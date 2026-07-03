import { db } from './src/db/database';
import { sql } from 'kysely';

async function migrate() {
  try {
    await sql`ALTER TABLE workers ADD COLUMN assigned_queues TEXT`.execute(db);
    console.log('Success');
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
migrate();
