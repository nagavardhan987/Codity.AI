import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Alter workers: drop status column
  try {
    await db.schema.alterTable('workers')
      .dropColumn('status')
      .execute();
  } catch(e) {}

  // Clear existing heartbeats to avoid duplicate constraint errors
  await sql`DELETE FROM worker_heartbeats`.execute(db);

  // Alter worker_heartbeats: add unique constraint on worker_id for upsert
  await db.schema.alterTable('worker_heartbeats')
    .addUniqueConstraint('unique_worker_id', ['worker_id'])
    .execute();

  // Alter jobs: add batch_id, scheduled_job_id, claimed_by, claimed_at
  await db.schema.alterTable('jobs')
    .addColumn('batch_id', 'varchar')
    .addColumn('scheduled_job_id', 'uuid', (col) => col.references('scheduled_jobs.id').onDelete('set null'))
    .addColumn('claimed_by', 'uuid', (col) => col.references('workers.id').onDelete('set null'))
    .addColumn('claimed_at', 'timestamp')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('jobs')
    .dropColumn('claimed_at')
    .dropColumn('claimed_by')
    .dropColumn('scheduled_job_id')
    .dropColumn('batch_id')
    .execute();

  await db.schema.alterTable('worker_heartbeats')
    .dropConstraint('unique_worker_id')
    .execute();

  await db.schema.alterTable('workers')
    .addColumn('status', sql`worker_status`, (col) => col.notNull().defaultTo('active'))
    .execute();
}
