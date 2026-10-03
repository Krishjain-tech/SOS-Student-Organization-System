import 'dotenv/config';
import { z } from 'zod';
import { getDb, migrateDb, closeDb } from '../apps/api/src/db/index.js';
import { hashPassword } from '../apps/api/src/auth/routes.js';
import { passwordSchema } from '../packages/shared/src/index.js';
import { id, now, audit } from '../apps/api/src/utils.js';

async function initialize() {
  if (process.env.DEMO_MODE !== 'false') throw new Error('Set DEMO_MODE=false to initialize a non-demo database.');
  const email=z.email().parse(process.env.INIT_ADMIN_EMAIL).toLowerCase();
  const password=passwordSchema.parse(process.env.INIT_ADMIN_PASSWORD);
  if(password==='SkylineDemo!2026') throw new Error('Choose a unique administrator password.');
  const name=z.string().trim().min(2).max(120).parse(process.env.INIT_ADMIN_NAME||'Skyline Administrator');
  migrateDb(); const db=getDb();
  if((db.prepare('SELECT COUNT(*) count FROM users').get() as any).count) throw new Error('Initialize only an empty database. Existing accounts must be managed through the admin workspace.');
  const hash=await hashPassword(password);const userId=id();
  db.transaction(()=>{
    if((db.prepare('SELECT COUNT(*) count FROM users').get() as any).count) throw new Error('Database is no longer empty.');
    db.prepare('INSERT INTO users(id,email,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(userId,email,name,hash,now(),now());
    db.prepare("INSERT INTO user_roles VALUES(?,'admin')").run(userId);
    db.prepare('UPDATE organization_settings SET demo_mode=0,updated_at=? WHERE id=1').run(now());
    audit(userId,'ADMIN_INITIALIZED','user',userId);
  }).immediate();
  console.log('Unique administrator initialized. No credentials were printed. Remove INIT_ADMIN_PASSWORD from your environment.');
}
initialize().catch(error=>{console.error(error instanceof z.ZodError?'Provide valid INIT_ADMIN_EMAIL, INIT_ADMIN_NAME and INIT_ADMIN_PASSWORD (12+ characters).':error.message);process.exitCode=1;}).finally(closeDb);
