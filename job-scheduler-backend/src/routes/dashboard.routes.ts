import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { sql } from 'kysely';

const router = Router();

// GET /api/dashboard/queues - List all queues with active/paused status
router.get('/queues', async (req: Request, res: Response) => {
  try {
    const { project_id } = req.query;
    
    let query = db.selectFrom('queues').selectAll().orderBy('priority', 'desc');
    
    if (project_id) {
      query = query.where('project_id', '=', String(project_id));
    }
    
    const queues = await query.execute();
      
    res.json({
      status: 'success',
      data: queues
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch queues' });
  }
});

// GET /api/dashboard/workers - List all workers and their heartbeats
router.get('/workers', async (req: Request, res: Response) => {
  try {
    // Get all workers and their latest heartbeat
    const workers = await db.selectFrom('workers')
      .leftJoin('worker_heartbeats', 'workers.id', 'worker_heartbeats.worker_id')
      .select([
        'workers.id', 
        'workers.hostname', 
        'workers.assigned_queues',
        'worker_heartbeats.timestamp as last_heartbeat',
        'worker_heartbeats.cpu_usage',
        'worker_heartbeats.memory_usage'
      ])
      // Subquery trick or distinct on in postgres to get latest heartbeat
      // For simplicity, we just order and distinct on worker.id
      .distinctOn('workers.id')
      .orderBy('workers.id')
      .orderBy('worker_heartbeats.timestamp', 'desc')
      .execute();
      
    // Fetch active jobs per worker
    const activeJobs = await db.selectFrom('job_executions')
      .where('status', '=', 'running')
      .select(['worker_id', 'job_id'])
      .execute();
      
    // Group active jobs by worker
    const activeJobsMap = new Map<string, string[]>();
    activeJobs.forEach(aj => {
      if (aj.worker_id) {
        const jobs = activeJobsMap.get(aj.worker_id) || [];
        jobs.push(aj.job_id);
        activeJobsMap.set(aj.worker_id, jobs);
      }
    });

    const allQueues = await db.selectFrom('queues').select(['id', 'name']).execute();
    const queueNameMap = new Map<string, string>();
    allQueues.forEach(q => queueNameMap.set(q.id, q.name));

    const enrichedWorkers = workers.map(w => {
      let assignedQueueIds: string[] = [];
      try {
        assignedQueueIds = w.assigned_queues ? JSON.parse(w.assigned_queues) : [];
      } catch(e) {}
      
      const assignedQueues = assignedQueueIds.map(id => ({
        id,
        name: queueNameMap.get(id) || id
      }));

      const isStalled = !w.last_heartbeat || (Date.now() - new Date(w.last_heartbeat).getTime() > 60000);

      return {
        ...w,
        status: isStalled ? 'dead' : 'active',
        activeJobsCount: activeJobsMap.get(w.id)?.length || 0,
        activeJobId: activeJobsMap.get(w.id)?.[0] || null, // Pick first running job
        assignedQueues
      };
    });

    res.json({
      status: 'success',
      data: enrichedWorkers
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch workers' });
  }
});

// GET /api/dashboard/jobs - List jobs for a queue (no auth for demo)
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const { queue_id } = req.query;

    let query = db.selectFrom('jobs');

    if (queue_id) {
      query = query.where('queue_id', '=', String(queue_id));
    }

    const jobs = await query
      .selectAll()
      .limit(50)
      .orderBy('created_at', 'desc')
      .execute();
      
    // Fetch attempts by counting executions
    const jobsWithAttempts = await Promise.all(jobs.map(async (job) => {
      const { count } = await db.selectFrom('job_executions')
        .where('job_id', '=', job.id)
        .select((eb) => eb.fn.count('id').as('count'))
        .executeTakeFirstOrThrow();
        
      return {
        ...job,
        attempts: Number(count)
      };
    }));

    res.json({
      status: 'success',
      data: jobsWithAttempts
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch jobs' });
  }
});

// GET /api/dashboard/jobs/:id/logs - Fetch logs for a specific job
router.get('/jobs/:id/logs', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const job = await db.selectFrom('jobs')
      .leftJoin('queues', 'jobs.queue_id', 'queues.id')
      .leftJoin('retry_policies', 'queues.retry_policy_id', 'retry_policies.id')
      .select(['jobs.id', 'jobs.payload', 'jobs.max_retries', 'retry_policies.max_retries as queue_retries'])
      .where('jobs.id', '=', id)
      .executeTakeFirst();

    if (!job) return res.status(404).json({ status: 'error', message: 'Job not found' });

    // Get all executions for this job
    const executions = await db.selectFrom('job_executions')
      .where('job_id', '=', id)
      .selectAll()
      .orderBy('attempt_number', 'asc')
      .execute();

    if (executions.length === 0) {
      return res.json({ status: 'success', data: { job, groupedLogs: [] } });
    }

    const executionIds = executions.map(e => e.id);

    // Get logs for those executions
    const logs = await db.selectFrom('job_logs')
      .where('execution_id', 'in', executionIds)
      .selectAll()
      .orderBy('timestamp', 'asc')
      .execute();

    // Group logs by execution
    const groupedLogs = executions.map(exec => ({
      execution: exec,
      logs: logs.filter(log => log.execution_id === exec.id)
    }));

    res.json({
      status: 'success',
      data: {
        job,
        groupedLogs
      }
    });
  } catch (error) {
    console.error('Failed to fetch logs:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch logs' });
  }
});

// POST /api/dashboard/queues - Create a queue (No Auth)
router.post('/queues', async (req: Request, res: Response) => {
  try {
    const { name, priority, concurrency_limit, project_id, retry_type, max_retries, delay_seconds } = req.body;
    
    // Fallback to first project if none provided
    let finalProjectId = project_id;
    if (!finalProjectId) {
      const project = await db.selectFrom('projects').select('id').executeTakeFirst();
      if (!project) throw new Error("No projects found to attach queue to. Run db seed first.");
      finalProjectId = project.id;
    }

    const retryPolicy = await db.insertInto('retry_policies')
      .values({ 
        name: `${name || 'Queue'} Policy`, 
        type: retry_type || 'exponential', 
        max_retries: max_retries ?? 3, 
        delay_seconds: delay_seconds ?? 5 
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const queue = await db.insertInto('queues')
      .values({
        project_id: finalProjectId,
        name: name || 'New Queue',
        priority: priority || 0,
        concurrency_limit: concurrency_limit || 10,
        retry_policy_id: retryPolicy.id
      })
      .returningAll()
      .executeTakeFirstOrThrow();
      
    res.status(201).json({ status: 'success', data: queue });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/dashboard/queues/:id/toggle - Pause/Resume queue
router.post('/queues/:id/toggle', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const queue = await db.selectFrom('queues').where('id', '=', id).select('is_paused').executeTakeFirstOrThrow();
    
    await db.updateTable('queues')
      .set({ is_paused: !queue.is_paused })
      .where('id', '=', id)
      .execute();
      
    res.json({ status: 'success', message: `Queue ${!queue.is_paused ? 'paused' : 'resumed'}` });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/dashboard/jobs - Submit a job (No Auth)
router.post('/jobs', async (req: Request, res: Response) => {
  try {
    const { queue_id, type, payload, delaySeconds, run_at, cron_expression } = req.body;
    
    if (type === 'recurring') {
      const cronJob = await db.insertInto('scheduled_jobs')
        .values({
          queue_id,
          cron_expression,
          payload: payload || {},
          next_run_at: new Date() // Normally calculated by cron parser, just set immediate to start
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return res.status(201).json({ status: 'success', data: cronJob });
    }

    let runAtDate = new Date();
    if (type === 'delayed' && delaySeconds) {
      runAtDate = new Date(Date.now() + (delaySeconds * 1000));
    } else if (type === 'scheduled' && run_at) {
      runAtDate = new Date(run_at);
    }
    
    let batch_id = null;
    if (payload && payload.batch_id) {
      batch_id = payload.batch_id;
    }

    const job = await db.insertInto('jobs')
      .values({
        queue_id,
        type: type || 'immediate',
        status: 'queued',
        payload: payload || { default_payload: true },
        run_at: runAtDate,
        batch_id
      })
      .returningAll()
      .executeTakeFirstOrThrow();
      
    res.status(201).json({ status: 'success', data: job });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/dashboard/jobs/:id/retry - Retry a failed/dead job
router.post('/jobs/:id/retry', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.updateTable('jobs')
      .set({ status: 'queued', run_at: new Date() })
      .where('id', '=', id)
      .execute();
      
    res.json({ status: 'success', message: 'Job retried' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET /api/dashboard/dlq - Fetch DLQ jobs
router.get('/dlq', async (req: Request, res: Response) => {
  try {
    const dlqJobs = await db.selectFrom('dead_letter_queue')
      .innerJoin('jobs', 'dead_letter_queue.job_id', 'jobs.id')
      .select([
        'dead_letter_queue.id as dlq_id',
        'jobs.id as job_id',
        'jobs.type',
        'jobs.payload',
        'dead_letter_queue.reason',
        'dead_letter_queue.moved_at as created_at'
      ])
      .orderBy('dead_letter_queue.moved_at', 'desc')
      .execute();
      
    res.json({ status: 'success', data: dlqJobs });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/dashboard/dlq/:jobId/requeue - Requeue a DLQ job
router.post('/dlq/:jobId/requeue', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    
    await db.transaction().execute(async (trx) => {
      // Fetch the current job to modify its payload
      const job = await trx.selectFrom('jobs').where('id', '=', jobId).selectAll().executeTakeFirst();
      if (!job) throw new Error("Job not found");

      let payload = job.payload;
      try {
        if (typeof payload === 'string') {
          payload = JSON.parse(payload);
        }
        if (payload && typeof payload === 'object' && 'shouldFail' in payload) {
          delete (payload as any).shouldFail;
        }
      } catch (e) {
        console.warn("Failed to parse/modify job payload during requeue", e);
      }

      await trx.updateTable('jobs')
        .set({ 
          status: 'queued', 
          run_at: new Date(),
          payload: payload // Save stripped payload
        })
        .where('id', '=', jobId)
        .execute();
        
      await trx.deleteFrom('dead_letter_queue')
        .where('job_id', '=', jobId)
        .execute();
    });
    
    res.json({ status: 'success', message: 'Job requeued from DLQ' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET /api/dashboard/metrics - Fetch overview metrics
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const jobStats = await db.selectFrom('jobs')
      .select(['status', (eb) => eb.fn.count('id').as('count')])
      .groupBy('status')
      .execute();
      
    const dlqCount = await db.selectFrom('dead_letter_queue')
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();
      
    const workers = await db.selectFrom('workers')
      .leftJoin('worker_heartbeats', 'workers.id', 'worker_heartbeats.worker_id')
      .select(['worker_heartbeats.timestamp as last_heartbeat'])
      .distinctOn('workers.id')
      .orderBy('workers.id')
      .orderBy('worker_heartbeats.timestamp', 'desc')
      .execute();

    let activeCount = 0;
    let deadCount = 0;
    const now = Date.now();
    workers.forEach(w => {
      if (!w.last_heartbeat || (now - new Date(w.last_heartbeat).getTime() > 60000)) {
        deadCount++;
      } else {
        activeCount++;
      }
    });
    const workerStats = [
      { status: 'active', count: activeCount },
      { status: 'dead', count: deadCount }
    ];

    // Calculate throughput (jobs completed in last 5 minutes)
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentCompleted = await db.selectFrom('job_executions')
      .where('status', '=', 'completed')
      .where('completed_at', '>=', fiveMinsAgo)
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();
      
    const jobsPerMin = Number(recentCompleted?.count || 0) / 5;

    res.json({
      status: 'success',
      data: {
        jobStats,
        dlqCount: Number(dlqCount?.count || 0),
        workerStats,
        jobsPerMin
      }
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router;
