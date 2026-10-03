import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type SqliteDatabase = Database.Database;
let singleton: SqliteDatabase | undefined;
export const databasePath = () => process.env.TEST_DB_PATH || process.env.DB_PATH || process.env.DATABASE_PATH || path.resolve('data/skyline.sqlite');
export function openDatabase(filename = databasePath()): SqliteDatabase {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const db = new Database(filename);
  db.pragma('foreign_keys = ON'); db.pragma('journal_mode = WAL'); db.pragma('busy_timeout = 5000');
  return db;
}
export function migrateDb(db: SqliteDatabase = getDb()): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const migrationDir = path.resolve('db/migrations');
  for (const file of fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort()) {
    if (db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(file)) continue;
    db.transaction(() => { db.exec(fs.readFileSync(path.join(migrationDir, file), 'utf8')); db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(file, new Date().toISOString()); })();
  }
}
export function getDb(): SqliteDatabase { return singleton ||= openDatabase(); }
export function closeDb(): void { singleton?.close(); singleton = undefined; }
