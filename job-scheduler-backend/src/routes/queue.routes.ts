import { Router } from 'express';
import { db } from '../db/database';
import { AppError } from '../middlewares/errorHandler';
import { authenticate } from '../middlewares/authMiddleware';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const createQueueSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1),
  priority: z.number().int().default(0),
  concurrency_limit: z.number().int().min(1).default(10),
  retry_policy: z.object({
    name: z.string().min(1),
    type: z.enum(['fixed', 'linear', 'exponential']),
    max_retries: z.number().int().min(0),
    delay_seconds: z.number().int().min(0),
  }).optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const data = createQueueSchema.parse(req.body);
    const userId = req.user!.id;

    // Verify user access via project -> org
    const project = await db.selectFrom('projects')
      .innerJoin('organization_users', 'projects.org_id', 'organization_users.org_id')
      .where('projects.id', '=', data.project_id)
      .where('organization_users.user_id', '=', userId)
      .select('projects.id')
      .executeTakeFirst();

    if (!project) {
      throw new AppError('Forbidden: You do not have access to this project', 403);
    }

    const queue = await db.transaction().execute(async (trx) => {
      let retryPolicyId: string;

      if (data.retry_policy) {
        const policy = await trx.insertInto('retry_policies')
          .values(data.retry_policy)
          .returning('id')
          .executeTakeFirstOrThrow();
        retryPolicyId = policy.id;
      } else {
        // Create default retry policy
        const policy = await trx.insertInto('retry_policies')
          .values({
            name: 'Default',
            type: 'exponential',
            max_retries: 3,
            delay_seconds: 5,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        retryPolicyId = policy.id;
      }

      const newQueue = await trx.insertInto('queues')
        .values({
          project_id: data.project_id,
          name: data.name,
          priority: data.priority,
          concurrency_limit: data.concurrency_limit,
          retry_policy_id: retryPolicyId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return newQueue;
    });

    res.status(201).json({ status: 'success', data: { queue } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors.map((e) => e.message).join(', '), 400));
    } else {
      next(error);
    }
  }
});

router.get('/project/:projectId', async (req, res, next) => {
  try {
    const projectId = req.params.projectId;
    const userId = req.user!.id;

    const project = await db.selectFrom('projects')
      .innerJoin('organization_users', 'projects.org_id', 'organization_users.org_id')
      .where('projects.id', '=', projectId)
      .where('organization_users.user_id', '=', userId)
      .select('projects.id')
      .executeTakeFirst();

    if (!project) {
      throw new AppError('Forbidden: You do not have access to this project', 403);
    }

    const queues = await db.selectFrom('queues')
      .where('project_id', '=', projectId)
      .selectAll()
      .execute();

    res.json({ status: 'success', data: { queues } });
  } catch (error) {
    next(error);
  }
});

export default router;
