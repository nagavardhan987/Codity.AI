import { Router } from 'express';
import { db } from '../db/database';
import { AppError } from '../middlewares/errorHandler';
import { authenticate } from '../middlewares/authMiddleware';
import { z } from 'zod';
import { io } from '../index';

const router = Router();
router.use(authenticate);

const baseJobSchema = z.object({
  queue_id: z.string().uuid(),
  idempotency_key: z.string().optional(),
  payload: z.any().optional(),
  max_retries: z.number().int().min(0).optional(),
});

const immediateJobSchema = baseJobSchema.extend({
  type: z.literal('immediate'),
});

const delayedJobSchema = baseJobSchema.extend({
  type: z.literal('delayed'),
  run_at: z.string().datetime(), // ISO string
});

const scheduledJobSchema = baseJobSchema.extend({
  type: z.enum(['scheduled', 'recurring']),
  cron_expression: z.string(),
});

const batchJobSchema = z.object({
  jobs: z.array(z.union([immediateJobSchema, delayedJobSchema])).min(1),
});

const createJob = async (jobData: any, type: string, reqUserId: string) => {
  // Check queue access
  const queue = await db.selectFrom('queues')
    .innerJoin('projects', 'queues.project_id', 'projects.id')
    .innerJoin('organization_users', 'projects.org_id', 'organization_users.org_id')
    .where('queues.id', '=', jobData.queue_id)
    .where('organization_users.user_id', '=', reqUserId)
    .select('queues.id')
    .executeTakeFirst();

  if (!queue) {
    throw new AppError('Forbidden: You do not have access to this queue', 403);
  }

  // Idempotency check
  if (jobData.idempotency_key) {
    const existingJob = await db.selectFrom('jobs')
      .where('queue_id', '=', jobData.queue_id)
      .where('idempotency_key', '=', jobData.idempotency_key)
      .selectAll()
      .executeTakeFirst();
    if (existingJob) return existingJob;
  }

  const runAt = jobData.run_at ? new Date(jobData.run_at) : new Date();

  return await db.insertInto('jobs')
    .values({
      queue_id: jobData.queue_id,
      idempotency_key: jobData.idempotency_key || null,
      type: type as any,
      status: 'queued',
      payload: JSON.stringify(jobData.payload || {}),
      run_at: runAt,
      max_retries: jobData.max_retries || null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
};

router.post('/', async (req, res, next) => {
  try {
    const type = req.body.type;
    let jobData;
    let result;

    const userId = req.user!.id;

    if (type === 'immediate') {
      jobData = immediateJobSchema.parse(req.body);
      result = await createJob(jobData, 'immediate', userId);
    } else if (type === 'delayed') {
      jobData = delayedJobSchema.parse(req.body);
      result = await createJob(jobData, 'delayed', userId);
    } else if (type === 'scheduled' || type === 'recurring') {
      jobData = scheduledJobSchema.parse(req.body);
      
      const queue = await db.selectFrom('queues')
        .innerJoin('projects', 'queues.project_id', 'projects.id')
        .innerJoin('organization_users', 'projects.org_id', 'organization_users.org_id')
        .where('queues.id', '=', jobData.queue_id)
        .where('organization_users.user_id', '=', userId)
        .select('queues.id')
        .executeTakeFirst();

      if (!queue) {
        throw new AppError('Forbidden: You do not have access to this queue', 403);
      }

      // Instead of Jobs table immediately, it goes to scheduled_jobs
      result = await db.insertInto('scheduled_jobs')
        .values({
          queue_id: jobData.queue_id,
          cron_expression: jobData.cron_expression,
          payload: JSON.stringify(jobData.payload || {}),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    } else {
      throw new AppError('Invalid job type', 400);
    }

    io.emit('dashboard_update');

    res.status(201).json({ status: 'success', data: { job: result } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors.map((e) => e.message).join(', '), 400));
    } else {
      next(error);
    }
  }
});

router.post('/batch', async (req, res, next) => {
  try {
    const { jobs } = batchJobSchema.parse(req.body);
    const userId = req.user!.id;

    // Validate access for all queues (optimizing by grouping queue_ids)
    const queueIds = [...new Set(jobs.map((j) => j.queue_id))];
    const accessibleQueues = await db.selectFrom('queues')
      .innerJoin('projects', 'queues.project_id', 'projects.id')
      .innerJoin('organization_users', 'projects.org_id', 'organization_users.org_id')
      .where('queues.id', 'in', queueIds)
      .where('organization_users.user_id', '=', userId)
      .select('queues.id')
      .execute();

    if (accessibleQueues.length !== queueIds.length) {
      throw new AppError('Forbidden: You do not have access to one or more queues', 403);
    }

    const jobInserts = jobs.map((jobData) => ({
      queue_id: jobData.queue_id,
      idempotency_key: jobData.idempotency_key || null,
      type: jobData.type as any,
      status: 'queued' as const,
      payload: JSON.stringify(jobData.payload || {}),
      run_at: (jobData as any).run_at ? new Date((jobData as any).run_at) : new Date(),
      max_retries: jobData.max_retries || null,
    }));

    const result = await db.insertInto('jobs')
      .values(jobInserts)
      .returningAll()
      .execute();

    res.status(201).json({ status: 'success', data: { jobs: result } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors.map((e) => e.message).join(', '), 400));
    } else {
      next(error);
    }
  }
});

// GET /api/jobs?queue_id=...&status=...
router.get('/', async (req, res, next) => {
  try {
    const { queue_id, status, limit, offset } = req.query;
    const userId = req.user!.id;

    let query = db.selectFrom('jobs')
      .innerJoin('queues', 'jobs.queue_id', 'queues.id')
      .innerJoin('projects', 'queues.project_id', 'projects.id')
      .innerJoin('organization_users', 'projects.org_id', 'organization_users.org_id')
      .where('organization_users.user_id', '=', userId);

    if (queue_id) {
      query = query.where('jobs.queue_id', '=', String(queue_id));
    }
    if (status) {
      query = query.where('jobs.status', '=', String(status) as any);
    }

    const jobs = await query
      .selectAll('jobs')
      .limit(Number(limit) || 50)
      .offset(Number(offset) || 0)
      .orderBy('jobs.created_at', 'desc')
      .execute();

    res.json({ status: 'success', data: { jobs } });
  } catch (error) {
    next(error);
  }
});

export default router;
