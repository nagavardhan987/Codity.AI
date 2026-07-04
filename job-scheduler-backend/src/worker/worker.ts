import os from 'os';
import { db, pool } from '../db/database';
import { sql } from 'kysely';
import { JobExecutor } from './jobExecutor';
import { PoolClient } from 'pg';

export class Worker {
  private workerId: string | null = null;
  private isRunning = false;
  private queueIds: string[];
  private activeJobs = 0;
  private maxConcurrent: number;
  private executor = new JobExecutor();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private listenClient: PoolClient | null = null;

  constructor(queueIds: string[], maxConcurrent: number = 10) {
    this.queueIds = queueIds;
    this.maxConcurrent = maxConcurrent;
  }

  async start() {
    this.isRunning = true;
    
    const worker = await db.insertInto('workers')
      .values({
        hostname: os.hostname(),
        // status is computed from heartbeat recency
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    
    this.workerId = worker.id;
    console.log(`Worker ${this.workerId} started on queues: ${this.queueIds.join(', ')}`);

    this.startHeartbeat();
    this.pollLoop();
  }

  async stop() {
    this.isRunning = false;
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    if (this.listenClient) {
      this.listenClient.release();
      this.listenClient = null;
    }
    if (this.workerId) {
      // Worker liveness is based on heartbeat, so just stopping the timer will let it timeout.
    }
    console.log(`Worker ${this.workerId} gracefully stopped.`);
  }

  private startHeartbeat() {
    const ping = async () => {
      if (!this.workerId) return;
      try {
        await sql<any>`
          INSERT INTO worker_heartbeats (worker_id, cpu_usage, memory_usage, timestamp)
          VALUES (${this.workerId}, ${os.loadavg()[0]}, ${process.memoryUsage().rss / (1024 * 1024)}, ${sql.val(new Date())})
          ON CONFLICT (worker_id) DO UPDATE SET
            cpu_usage = EXCLUDED.cpu_usage,
            memory_usage = EXCLUDED.memory_usage,
            timestamp = EXCLUDED.timestamp
        `.execute(db);
      } catch (err) {
        console.error('Failed to send heartbeat', err);
      }
    };
    ping(); // Immediate heartbeat on start
    this.heartbeatTimer = setInterval(ping, 15000); // 15 seconds
  }

  private async pollLoop() {
    // Attempt to claim jobs continuously as long as there is work
    const drainQueues = async () => {
      let hasWork = true;
      while (hasWork && this.isRunning && this.activeJobs < this.maxConcurrent) {
        hasWork = await this.claimJob();
      }
    };

    try {
      this.listenClient = await pool.connect();
      await this.listenClient.query('LISTEN new_job');
      
      this.listenClient.on('notification', async (msg) => {
        if (!this.isRunning) return;
        if (msg.payload && this.queueIds.includes(msg.payload)) {
          // A new job was inserted into one of our queues, wake up!
          await drainQueues();
        }
      });

      console.log(`Worker ${this.workerId} is listening for 'new_job' events...`);

      // Fallback polling (every 10 seconds) to catch delayed jobs or missed events
      while (this.isRunning) {
        await drainQueues();
        await new Promise(res => setTimeout(res, 10000));
      }
    } catch (err) {
      console.error('Listen client failed, falling back to aggressive polling', err);
      while (this.isRunning) {
        if (this.activeJobs >= this.maxConcurrent) {
          await new Promise((res) => setTimeout(res, 1000));
          continue;
        }
        const jobClaimed = await this.claimJob();
        if (!jobClaimed) await new Promise((res) => setTimeout(res, 2000));
      }
    }
  }

  private async claimJob(): Promise<boolean> {
    if (!this.workerId) return false;

    try {
      // The core atomic claim query using FOR UPDATE SKIP LOCKED
      // We look for jobs in 'queued' state where run_at <= now()
      const job = await db.transaction().execute(async (trx) => {
        const claimed = await sql<any>`
          UPDATE jobs
          SET status = 'claimed', updated_at = now(), claimed_by = ${sql.val(this.workerId)}, claimed_at = now()
          WHERE id = (
            SELECT j.id
            FROM jobs j
            JOIN queues q ON j.queue_id = q.id
            WHERE j.queue_id IN (${sql.join(this.queueIds.map(id => sql.val(id)))})
              AND j.status = 'queued'
              AND j.run_at <= ${sql.val(new Date())}
              AND q.is_paused = false
            ORDER BY q.priority DESC, j.run_at ASC
            LIMIT 1
            FOR UPDATE OF j SKIP LOCKED
          )
          RETURNING *;
        `.execute(trx);

        if (claimed.rows.length === 0) return null;

        const jobRow = claimed.rows[0];

        // Get attempt number by counting previous executions
        const { count } = await trx.selectFrom('job_executions')
          .where('job_id', '=', jobRow.id)
          .select((eb) => eb.fn.count('id').as('count'))
          .executeTakeFirstOrThrow();

        const execution = await trx.insertInto('job_executions')
          .values({
            job_id: jobRow.id,
            worker_id: this.workerId,
            status: 'running',
            attempt_number: Number(count) + 1,
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        await trx.updateTable('jobs')
          .set({ status: 'running' })
          .where('id', '=', jobRow.id)
          .execute();

        return { job: jobRow, executionId: execution.id, attemptNumber: Number(count) + 1 };
      });

      if (!job) return false;

      this.activeJobs++;
      this.executeJob(job.job, job.executionId, job.attemptNumber).finally(() => {
        this.activeJobs--;
      });

      return true;
    } catch (error) {
      console.error('Error claiming job:', error);
      return false;
    }
  }

  private async executeJob(job: any, executionId: string, attemptNumber: number) {
    let finalStatus: 'completed' | 'failed' = 'completed';
    let errorDetails: any = null;

    try {
      await db.insertInto('job_logs')
        .values({
          execution_id: executionId,
          log_level: 'info',
          message: 'Starting job execution',
        })
        .execute();

      await this.executor.execute(job.id, typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload);

      await db.insertInto('job_logs')
        .values({
          execution_id: executionId,
          log_level: 'info',
          message: 'Job completed successfully',
        })
        .execute();

    } catch (error: any) {
      finalStatus = 'failed';
      errorDetails = { message: error.message, stack: error.stack };
      console.error(`Job ${job.id} failed:`, error);
      
      await db.insertInto('job_logs')
        .values({
          execution_id: executionId,
          log_level: 'error',
          message: `Job failed: ${error.message}`,
        })
        .execute();
    }

    try {
      await db.transaction().execute(async (trx) => {
        await trx.updateTable('job_executions')
          .set({
            status: finalStatus,
            completed_at: new Date(),
            error_details: errorDetails ? JSON.stringify(errorDetails) : null,
          })
          .where('id', '=', executionId)
          .execute();

        if (finalStatus === 'failed') {
          // Fetch queue retry policy
          const queue = await trx.selectFrom('queues')
            .innerJoin('retry_policies', 'queues.retry_policy_id', 'retry_policies.id')
            .where('queues.id', '=', job.queue_id)
            .select(['retry_policies.type', 'retry_policies.max_retries', 'retry_policies.delay_seconds'])
            .executeTakeFirst();
            
          const maxRetries = job.max_retries !== null ? job.max_retries : (queue?.max_retries || 0);

          if (attemptNumber <= maxRetries) {
            // Requeue for retry
            let delay = queue?.delay_seconds || 5;
            if (queue?.type === 'linear') {
              delay = delay * attemptNumber;
            } else if (queue?.type === 'exponential') {
              delay = delay * Math.pow(2, attemptNumber - 1);
            }
            
            const nextRunAt = new Date(Date.now() + delay * 1000);
            
            await trx.updateTable('jobs')
              .set({ status: 'queued', run_at: nextRunAt })
              .where('id', '=', job.id)
              .execute();
          } else {
            // Max retries reached, move to DLQ
            await trx.updateTable('jobs')
              .set({ status: 'dead_letter' })
              .where('id', '=', job.id)
              .execute();
              
            await trx.insertInto('dead_letter_queue')
              .values({
                job_id: job.id,
                reason: errorDetails?.message || 'Max retries exceeded',
              })
              .execute();
          }
        } else {
          await trx.updateTable('jobs')
            .set({ status: 'completed' })
            .where('id', '=', job.id)
            .execute();
        }
      });
      
      const { io } = require('../index');
      io.emit('dashboard_update');
      
    } catch (err) {
      console.error('Failed to update job execution status', err);
    }
  }
}

