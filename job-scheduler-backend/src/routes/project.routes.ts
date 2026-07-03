import { Router } from 'express';
import { db } from '../db/database';
import { AppError } from '../middlewares/errorHandler';
import { authenticate } from '../middlewares/authMiddleware';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const createProjectSchema = z.object({
  org_id: z.string().uuid(),
  name: z.string().min(1),
});

router.post('/', async (req, res, next) => {
  try {
    const { org_id, name } = createProjectSchema.parse(req.body);
    const userId = req.user!.id;

    // Verify user belongs to this org
    const orgUser = await db.selectFrom('organization_users')
      .where('org_id', '=', org_id)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!orgUser) {
      throw new AppError('Forbidden: You do not belong to this organization', 403);
    }

    const project = await db.insertInto('projects')
      .values({ org_id, name })
      .returningAll()
      .executeTakeFirstOrThrow();

    res.status(201).json({ status: 'success', data: { project } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors.map((e) => e.message).join(', '), 400));
    } else {
      next(error);
    }
  }
});

router.get('/org/:orgId', async (req, res, next) => {
  try {
    const orgId = req.params.orgId;
    const userId = req.user!.id;

    const orgUser = await db.selectFrom('organization_users')
      .where('org_id', '=', orgId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!orgUser) {
      throw new AppError('Forbidden: You do not belong to this organization', 403);
    }

    const projects = await db.selectFrom('projects')
      .where('org_id', '=', orgId)
      .selectAll()
      .execute();

    res.json({ status: 'success', data: { projects } });
  } catch (error) {
    next(error);
  }
});

export default router;
