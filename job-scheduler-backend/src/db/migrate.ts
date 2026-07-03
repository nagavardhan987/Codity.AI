import { up as upInitial } from './migrations/20230101000000_initial_schema';
import { up as upFixes } from './migrations/20230101000001_fixes';
import { db } from './database';

async function migrate() {
  try {
    try {
      await upInitial(db);
      console.log('Initial migration completed successfully');
    } catch (e: any) {
      if (e.code === '42710') {
        console.log('Initial schema already exists, skipping...');
      } else {
        throw e;
      }
    }
    
    try {
      await upFixes(db);
      console.log('Fixes migration completed successfully');
    } catch (e: any) {
      if (e.code === '42701') {
         console.log('Fixes already applied, skipping...');
      } else {
         throw e;
      }
    }
    
    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

migrate();
