import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getDb, openDatabase, databasePath, closeDb } from '../apps/api/src/db/index.js';

/** A second connection holds the write reservation while SQLite snapshots and receipts are copied. */
export async function createBackup(root = process.env.BACKUP_DIR || './backups') {
  const source = getDb();
  const rootPath = path.resolve(root);
  const receiptRoot = path.resolve(process.env.UPLOAD_DIR || './data/receipts');
  if (rootPath === receiptRoot || rootPath.startsWith(receiptRoot + path.sep)) throw new Error('Backup directory must be outside the live receipt directory.');
  fs.mkdirSync(rootPath, { recursive: true });
  const name = `skyline-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const staging = path.join(rootPath, name + '.partial');
  const destination = path.join(rootPath, name);
  fs.mkdirSync(path.join(staging, 'receipts'), { recursive: true });
  const guard = openDatabase(databasePath());
  try {
    guard.exec('BEGIN IMMEDIATE');
    const receipts = source.prepare('SELECT id,stored_name,size_bytes FROM receipt_files ORDER BY id').all() as any[];
    await source.backup(path.join(staging, 'skyline.sqlite'));
    const manifest = [];
    for (const receipt of receipts) {
      if (path.basename(receipt.stored_name) !== receipt.stored_name || receipt.stored_name.includes('..')) throw new Error('Unsafe receipt filename in database; backup aborted.');
      const bytes = fs.readFileSync(path.join(receiptRoot, receipt.stored_name));
      if (bytes.length !== receipt.size_bytes) throw new Error(`Receipt size mismatch for ${receipt.id}; backup aborted.`);
      fs.writeFileSync(path.join(staging, 'receipts', receipt.stored_name), bytes, { flag: 'wx' });
      manifest.push({ id: receipt.id, stored_name: receipt.stored_name, size_bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify({ format: 1, created_at: new Date().toISOString(), database: 'skyline.sqlite', receipts: manifest, warning: 'Contains private receipts, password hashes and session records. Protect access and clear sessions on restore.' }, null, 2));
    guard.exec('ROLLBACK');
    fs.renameSync(staging, destination);
    return { directory: destination, receipts: receipts.length, database: path.join(destination, 'skyline.sqlite') };
  } catch (error) {
    if (guard.inTransaction) guard.exec('ROLLBACK');
    // The exact generated child stays within the verified backup root.
    if (path.dirname(path.resolve(staging)) !== rootPath) throw new Error('Unsafe partial backup cleanup target.');
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  } finally { guard.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await createBackup(process.argv[2] || undefined), null, 2)); }
  finally { closeDb(); }
}
