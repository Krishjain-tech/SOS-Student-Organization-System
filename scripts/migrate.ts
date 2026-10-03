import 'dotenv/config';
import { getDb, migrateDb, closeDb } from '../apps/api/src/db/index.js';
migrateDb(getDb());
console.log('SQLite migrations applied successfully.');
closeDb();
