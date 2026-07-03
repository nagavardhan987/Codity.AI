import { Router } from 'express';
import { db } from '../db/database';
import { AppError } from '../middlewares/errorHandler';
import { authenticate } from '../middlewares/authMiddleware';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const createOrgSchema = z.object({
  name: z.string().min(1),
});

router.post('/', async (req, res, next) => {
  try {
    const { name } = createOrgSchema.parse(req.body);
    const userId = req.user!.id;

    // Transaction to create org and add user as admin
    const result = await db.transaction().execute(async (trx) => {
      const org = await trx.insertInto('organizations')
        .values({ name })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx.insertInto('organization_users')
        .values({
          org_id: org.id,
          user_id: userId,
          role: 'admin',
        })
        .execute();

      return org;
    });

    res.status(201).json({ status: 'success', data: { organization: result } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors.map((e) => e.message).join(', '), 400));
    } else {
      next(error);
    }
  }
});

router.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.id;

    const orgs = await db.selectFrom('organizations as o')
      .innerJoin('organization_users as ou', 'o.id', 'ou.org_id')
      .where('ou.user_id', '=', userId)
      .selectAll('o')
      .execute();

    res.json({ status: 'success', data: { organizations: orgs } });
  } catch (error) {
    next(error);
  }
});

export default router;
