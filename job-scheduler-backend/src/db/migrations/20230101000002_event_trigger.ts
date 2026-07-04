import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE OR REPLACE FUNCTION notify_new_job() RETURNS TRIGGER AS $$
    BEGIN
      PERFORM pg_notify('new_job', NEW.queue_id::text);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    CREATE TRIGGER job_inserted_trigger
    AFTER INSERT ON jobs
    FOR EACH ROW EXECUTE PROCEDURE notify_new_job();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS job_inserted_trigger ON jobs;`.execute(db);
  await sql`DROP FUNCTION IF EXISTS notify_new_job();`.execute(db);
}
