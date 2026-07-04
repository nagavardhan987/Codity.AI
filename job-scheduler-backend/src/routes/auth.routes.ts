import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/database';
import { AppError } from '../middlewares/errorHandler';
import { z } from 'zod';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = registerSchema.parse(req.body);

    const existingUser = await db.selectFrom('users')
      .where('email', '=', email)
      .executeTakeFirst();

    if (existingUser) {
      throw new AppError('Email already in use', 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await db.transaction().execute(async (trx) => {
      const newUser = await trx.insertInto('users')
        .values({ email, password_hash: passwordHash })
        .returning(['id', 'email', 'created_at'])
        .executeTakeFirstOrThrow();

      const org = await trx.insertInto('organizations')
        .values({ name: `${email.split('@')[0]}'s Org` })
        .returning('id')
        .executeTakeFirstOrThrow();

      await trx.insertInto('organization_users')
        .values({ org_id: org.id, user_id: newUser.id, role: 'owner' })
        .execute();

      return newUser;
    });

    res.status(201).json({ status: 'success', data: { user } });
  } catch (error: any) {
    if (error instanceof z.ZodError || error.name === 'ZodError') {
      next(new AppError(error.errors?.map((e: any) => e.message).join(', ') || 'Invalid input', 400));
    } else {
      next(error);
    }
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = registerSchema.parse(req.body);

    const user = await db.selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new AppError('Invalid email or password', 401);
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET as string,
      { expiresIn: '24h' }
    );

    res.json({
      status: 'success',
      data: {
        token,
        user: { id: user.id, email: user.email },
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError || error.name === 'ZodError') {
      next(new AppError(error.errors?.map((e: any) => e.message).join(', ') || 'Invalid input', 400));
    } else {
      next(error);
    }
  }
});

export default router;
