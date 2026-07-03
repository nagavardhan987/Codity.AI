import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Enums
  await db.schema.createType('retry_policy_type').asEnum(['fixed', 'linear', 'exponential']).execute();
  await db.schema.createType('job_type').asEnum(['immediate', 'delayed', 'scheduled', 'recurring', 'batch']).execute();
  await db.schema.createType('job_status').asEnum(['queued', 'scheduled', 'claimed', 'running', 'completed', 'failed', 'dead_letter']).execute();
  await db.schema.createType('execution_status').asEnum(['running', 'completed', 'failed']).execute();
  await db.schema.createType('worker_status').asEnum(['active', 'dead']).execute();

  // Tables
  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('email', 'varchar', (col) => col.notNull().unique())
    .addColumn('password_hash', 'varchar', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema
    .createTable('organizations')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema
    .createTable('organization_users')
    .addColumn('org_id', 'uuid', (col) => col.references('organizations.id').onDelete('restrict').notNull())
    .addColumn('user_id', 'uuid', (col) => col.references('users.id').onDelete('cascade').notNull())
    .addColumn('role', 'varchar', (col) => col.notNull())
    .addPrimaryKeyConstraint('organization_users_pk', ['org_id', 'user_id'])
    .execute();

  await db.schema
    .createTable('projects')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('org_id', 'uuid', (col) => col.references('organizations.id').onDelete('cascade').notNull())
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema
    .createTable('retry_policies')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('type', sql`retry_policy_type`, (col) => col.notNull())
    .addColumn('max_retries', 'integer', (col) => col.notNull())
    .addColumn('delay_seconds', 'integer', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('queues')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', (col) => col.references('projects.id').onDelete('cascade').notNull())
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('priority', 'integer', (col) => col.notNull())
    .addColumn('concurrency_limit', 'integer', (col) => col.notNull())
    .addColumn('retry_policy_id', 'uuid', (col) => col.references('retry_policies.id').onDelete('restrict').notNull())
    .addColumn('is_paused', 'boolean', (col) => col.defaultTo(false).notNull())
    .execute();

  await db.schema
    .createTable('jobs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('queue_id', 'uuid', (col) => col.references('queues.id').onDelete('cascade').notNull())
    .addColumn('idempotency_key', 'varchar')
    .addColumn('type', sql`job_type`, (col) => col.notNull())
    .addColumn('status', sql`job_status`, (col) => col.notNull())
    .addColumn('payload', 'jsonb')
    .addColumn('run_at', 'timestamp', (col) => col.notNull())
    .addColumn('max_retries', 'integer')
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
    .execute();
    
  // Composite index for claim hot path
  await sql`CREATE INDEX idx_jobs_claim ON jobs (queue_id, status, run_at)`.execute(db);

  await db.schema
    .createTable('workers')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('hostname', 'varchar', (col) => col.notNull())
    .addColumn('status', sql`worker_status`, (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema
    .createTable('job_executions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('job_id', 'uuid', (col) => col.references('jobs.id').onDelete('cascade').notNull())
    .addColumn('worker_id', 'uuid', (col) => col.references('workers.id').onDelete('set null'))
    .addColumn('status', sql`execution_status`, (col) => col.notNull())
    .addColumn('started_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn('completed_at', 'timestamp')
    .addColumn('error_details', 'jsonb')
    .addColumn('attempt_number', 'integer', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('job_logs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('execution_id', 'uuid', (col) => col.references('job_executions.id').onDelete('cascade').notNull())
    .addColumn('log_level', 'varchar', (col) => col.notNull())
    .addColumn('message', 'text', (col) => col.notNull())
    .addColumn('timestamp', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema
    .createTable('worker_heartbeats')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('worker_id', 'uuid', (col) => col.references('workers.id').onDelete('cascade').notNull())
    .addColumn('timestamp', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn('cpu_usage', 'real', (col) => col.notNull())
    .addColumn('memory_usage', 'real', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('scheduled_jobs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('queue_id', 'uuid', (col) => col.references('queues.id').onDelete('cascade').notNull())
    .addColumn('cron_expression', 'varchar', (col) => col.notNull())
    .addColumn('payload', 'jsonb')
    .addColumn('last_run_at', 'timestamp')
    .addColumn('next_run_at', 'timestamp')
    .execute();

  await db.schema
    .createTable('dead_letter_queue')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('job_id', 'uuid', (col) => col.references('jobs.id').onDelete('cascade').notNull())
    .addColumn('reason', 'text', (col) => col.notNull())
    .addColumn('moved_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('dead_letter_queue').execute();
  await db.schema.dropTable('scheduled_jobs').execute();
  await db.schema.dropTable('worker_heartbeats').execute();
  await db.schema.dropTable('job_logs').execute();
  await db.schema.dropTable('job_executions').execute();
  await db.schema.dropTable('workers').execute();
  await db.schema.dropTable('jobs').execute();
  await db.schema.dropTable('queues').execute();
  await db.schema.dropTable('retry_policies').execute();
  await db.schema.dropTable('projects').execute();
  await db.schema.dropTable('organization_users').execute();
  await db.schema.dropTable('organizations').execute();
  await db.schema.dropTable('users').execute();

  await db.schema.dropType('worker_status').execute();
  await db.schema.dropType('execution_status').execute();
  await db.schema.dropType('job_status').execute();
  await db.schema.dropType('job_type').execute();
  await db.schema.dropType('retry_policy_type').execute();
}
