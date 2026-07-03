import { Worker } from './worker';
import { db } from '../db/database';
import * as dotenv from 'dotenv';

dotenv.config();

async function start() {
  console.log('Fetching queues to poll...');
  // For this assignment, we'll just poll all queues that exist
  const queues = await db.selectFrom('queues').select('id').execute();
  const queueIds = queues.map((q) => q.id);

  if (queueIds.length === 0) {
    console.log('No queues found. Please create a queue first.');
    process.exit(1);
  }

  const worker = new Worker(queueIds, 5);
  
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down...');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down...');
    await worker.stop();
    process.exit(0);
  });

  await worker.start();
}

start();
