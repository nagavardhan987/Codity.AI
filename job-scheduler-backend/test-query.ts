import { db } from './src/db/database';
import { sql } from 'kysely';

async function testQuery() {
  const queueIds = ['d157b603-61e5-4f71-9e5f-20a70364910a', 'f153a92c-9531-421d-b901-4da18fd25a93'];
  
  console.log('Testing claim query...');
  
  const query = sql<any>`
    SELECT j.id, j.run_at, now() as pg_now, (j.run_at <= now()) as is_past
    FROM jobs j
    JOIN queues q ON j.queue_id = q.id
    WHERE j.queue_id = ANY(${queueIds})
      AND j.status = 'queued'
  `;
  
  const res = await query.execute(db);
  console.log('Result:', res.rows);
  
  process.exit(0);
}

testQuery();
