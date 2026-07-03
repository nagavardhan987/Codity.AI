import cronParser from 'cron-parser';
import { db } from '../db/database';
import * as dotenv from 'dotenv';
import { sql } from 'kysely';

dotenv.config();

class Scheduler {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private intervalMs = 10000; // run every 10s

  start() {
    this.isRunning = true;
    console.log('Scheduler started.');
    this.loop();
  }

  stop() {
    this.isRunning = false;
    if (this.timer) clearTimeout(this.timer);
    console.log('Scheduler stopped.');
  }

  private async loop() {
    if (!this.isRunning) return;

    try {
      await this.processScheduledJobs();
      await this.detectStalledWorkers();
    } catch (error) {
      console.error('Scheduler error:', error);
    }

    this.timer = setTimeout(() => this.loop(), this.intervalMs);
  }

  private async detectStalledWorkers() {
    const stalledThreshold = new Date(Date.now() - 60000); // 60 seconds without heartbeat
    await db.transaction().execute(async (trx) => {
      const orphanedExecutions = await trx.selectFrom('job_executions')
        .leftJoin('worker_heartbeats', 'job_executions.worker_id', 'worker_heartbeats.worker_id')
        .where('job_executions.status', '=', 'running')
        .where((eb) => eb.or([
          eb('worker_heartbeats.timestamp', '<', stalledThreshold),
          eb('worker_heartbeats.timestamp', 'is', null)
        ]))
        .select(['job_executions.id', 'job_executions.job_id'])
        .execute();

      if (orphanedExecutions.length > 0) {
        const executionIds = orphanedExecutions.map(e => e.id);
        const jobIds = orphanedExecutions.map(e => e.job_id);

        // Mark executions as failed
        await trx.updateTable('job_executions')
          .set({ 
            status: 'failed', 
            completed_at: new Date(), 
            error_details: JSON.stringify({ message: 'Worker died' }) 
          })
          .where('id', 'in', executionIds)
          .execute();

        // Requeue the jobs for retry (ignoring max_retries here for simplicity, assuming worker crash shouldn't count against application-level retries)
        await trx.updateTable('jobs')
          .set({ status: 'queued', run_at: new Date() })
          .where('id', 'in', jobIds)
          .execute();
      }
    });
  }

  private async processScheduledJobs() {
    const now = new Date();
    
    // Find scheduled jobs that need to run
    const readyJobs = await db.selectFrom('scheduled_jobs')
      .where((eb) => eb.or([
        eb('next_run_at', '<=', now),
        eb('next_run_at', 'is', null)
      ]))
      .selectAll()
      .execute();

    if (readyJobs.length === 0) return;

    for (const sJob of readyJobs) {
      try {
        await db.transaction().execute(async (trx) => {
          // Check if it's already processed concurrently
          const lock = await sql`
            SELECT id FROM scheduled_jobs 
            WHERE id = ${sJob.id} 
            FOR UPDATE NOWAIT
          `.execute(trx).catch(() => null);

          if (!lock) return; // Skip if locked by another scheduler instance

          const interval = cronParser.parseExpression(sJob.cron_expression);
          const nextRunAt = interval.next().toDate();

          // Enqueue a job instance
          await trx.insertInto('jobs')
            .values({
              queue_id: sJob.queue_id,
              type: 'recurring',
              status: 'queued',
              payload: sJob.payload,
              run_at: new Date(),
              scheduled_job_id: sJob.id,
            })
            .execute();

          // Update the schedule
          await trx.updateTable('scheduled_jobs')
            .set({
              last_run_at: new Date(),
              next_run_at: nextRunAt,
            })
            .where('id', '=', sJob.id)
            .execute();
            
          console.log(`Enqueued recurring job for schedule ${sJob.id}, next run: ${nextRunAt}`);
        });
      } catch (err) {
        console.error(`Failed to process scheduled job ${sJob.id}:`, err);
      }
    }
  }
}

const scheduler = new Scheduler();

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down scheduler');
  scheduler.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down scheduler');
  scheduler.stop();
  process.exit(0);
});

scheduler.start();
