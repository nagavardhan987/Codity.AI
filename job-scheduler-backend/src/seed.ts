import { db } from './db/database';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('Starting seed...');

  try {
    // Clear existing data
    await db.deleteFrom('jobs').execute();
    await db.deleteFrom('queues').execute();
    await db.deleteFrom('projects').execute();
    await db.deleteFrom('organization_users').execute();
    await db.deleteFrom('organizations').execute();
    await db.deleteFrom('users').execute();
    await db.deleteFrom('retry_policies').execute();
    await db.deleteFrom('workers').execute();
    
    // 1. Create a user
    const passwordHash = await bcrypt.hash('password123', 10);
    const user = await db.insertInto('users')
      .values({
        email: 'demo@example.com',
        password_hash: passwordHash,
      })
      .returningAll()
      .executeTakeFirst();
      
    if (!user) throw new Error('Failed to create user');
    console.log('Created user:', user.email);

    // 2. Create Org
    const org = await db.insertInto('organizations')
      .values({ name: 'Demo Organization' })
      .returningAll()
      .executeTakeFirstOrThrow();
      
    await db.insertInto('organization_users')
      .values({ org_id: org.id, user_id: user.id, role: 'owner' })
      .execute();
    console.log('Created Org:', org.name);

    // 3. Create Project
    const project = await db.insertInto('projects')
      .values({ org_id: org.id, name: 'Default Project' })
      .returningAll()
      .executeTakeFirstOrThrow();
    console.log('Created Project:', project.name);

    // 4. Create Retry Policies
    const policy = await db.insertInto('retry_policies')
      .values({
        name: 'Standard Retry',
        type: 'exponential',
        max_retries: 3,
        delay_seconds: 5,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // 5. Create Queues
    const q1 = await db.insertInto('queues')
      .values({
        project_id: project.id,
        name: 'Email Queue',
        priority: 1,
        concurrency_limit: 10,
        retry_policy_id: policy.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const q2 = await db.insertInto('queues')
      .values({
        project_id: project.id,
        name: 'Data Sync',
        priority: 5,
        concurrency_limit: 2,
        retry_policy_id: policy.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
      
    console.log('Created Queues');

    // 6. Create Jobs
    await db.insertInto('jobs')
      .values([
        {
          queue_id: q1.id,
          type: 'immediate',
          status: 'completed',
          payload: JSON.stringify({ to: 'alice@example.com' }),
          run_at: new Date(),
        },
        {
          queue_id: q1.id,
          type: 'immediate',
          status: 'failed',
          payload: JSON.stringify({ to: 'bob@example.com' }),
          run_at: new Date(),
        },
        {
          queue_id: q2.id,
          type: 'delayed',
          status: 'queued',
          payload: JSON.stringify({ sync_target: 'crm' }),
          run_at: new Date(Date.now() + 60000), // run in 1 min
        },
      ])
      .execute();

    console.log('Created Jobs');
    
    // Add a dead worker for visual test
    await db.insertInto('workers')
      .values({
        hostname: 'ip-10-0-1-dead'
        // No status, worker is dead because it has no heartbeat
      })
      .execute();
      
    console.log('Seed completed successfully!');

  } catch (error) {
    console.error('Seed error:', error);
  } finally {
    process.exit(0);
  }
}

seed();
