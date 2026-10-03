import { Router } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import { randomBytes,createHash } from 'node:crypto';
import { loginSchema,passwordSchema } from '../../../../packages/shared/src/index.js';
import { getDb } from '../db/index.js';
import { requireAdmin,requireAuth,userById } from '../middleware/auth.js';
import { apiError,asyncRoute,audit,id,now,validate } from '../utils.js';

export const hashPassword=(password:string)=>argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
const dummyHash=hashPassword(randomBytes(24).toString('hex'));
const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export function issuePasswordResetData(actorId:string,userId:string,reqOrigin?:string) {
  const user=userById(userId);if(!user||!user.active) throw apiError(404,'NOT_FOUND','Active account not found.');
  const token=randomBytes(32).toString('base64url'),expires_at=new Date(Date.now()+60*60*1000).toISOString();
  getDb().transaction(()=>{getDb().prepare('UPDATE password_reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL').run(now(),user.id);getDb().prepare('INSERT INTO password_reset_tokens VALUES(?,?,?,?,NULL,?,?)').run(id(),user.id,tokenHash(token),expires_at,actorId,now());audit(actorId,'RESET_ISSUED','user',user.id,{expires_at});})();
  const origin=reqOrigin||process.env.APP_ORIGIN||'http://localhost:5173';
  return {setup_link:`${origin}/reset-password?token=${token}`,expires_at,delivery:'Manual delivery by administrator. No email sent.'};
}
export function issuePasswordReset(req:any,res:any) {
  const reqOrigin=req.get('Origin')||(req.get('host')?`${req.protocol}://${req.get('host')}`:undefined);
  res.json({data:issuePasswordResetData(req.user.id,req.params.id,reqOrigin)});
}
export function createAuthRouter(generateToken:(req:any,overwrite?:boolean)=>string) {
  const router=Router();
  router.get('/csrf',(req,res)=>res.json({data:{csrfToken:generateToken(req)}}));
  router.get('/me',requireAuth,(req,res)=>res.json({data:req.user}));
  router.post('/login',asyncRoute(async(req,res)=>{
    const data=validate(loginSchema,req.body), db=getDb(), key=`${req.ip}:${data.email}`;
    const attempt=db.prepare('SELECT * FROM login_attempts WHERE key=?').get(key) as any;
    if(attempt?.blocked_until&&attempt.blocked_until>now()) throw apiError(429,'LOGIN_THROTTLED','Sign in was unsuccessful. Please try again later.');
    const row=db.prepare('SELECT * FROM users WHERE email=?').get(data.email) as any;
    const trimmed=data.password.trim();
    let matches=await argon2.verify(row?.password_hash||await dummyHash,data.password);
    if(!matches&&trimmed!==data.password&&row?.password_hash) matches=await argon2.verify(row.password_hash,trimmed);
    const user=row?userById(row.id):undefined;
    if(!matches||!user?.active||!user.roles.includes(data.requestedPortal)) {
      const failures=attempt&&(Date.now()-Date.parse(attempt.updated_at)<15*60*1000)?attempt.failures+1:1;
      db.prepare('INSERT INTO login_attempts(key,failures,blocked_until,updated_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET failures=excluded.failures,blocked_until=excluded.blocked_until,updated_at=excluded.updated_at').run(key,failures,failures>=5?new Date(Date.now()+15*60*1000).toISOString():null,now());
      throw apiError(401,'LOGIN_FAILED','Sign in was unsuccessful. Check your details and workspace.');
    }
    db.prepare('DELETE FROM login_attempts WHERE key=?').run(key);
    await new Promise<void>((resolve,reject)=>req.session.regenerate(err=>err?reject(err):resolve()));
    req.session.userId=row.id;req.session.sessionVersion=row.session_version;req.session.loggedInAt=Date.now();
    const csrfToken=generateToken(req,true);
    await new Promise<void>((resolve,reject)=>req.session.save(err=>err?reject(err):resolve()));
    audit(row.id,'LOGIN','user',row.id,{portal:data.requestedPortal});res.json({data:{...user,csrfToken}});
  }));
  router.post('/logout',asyncRoute(async(req,res)=>{await new Promise<void>((resolve,reject)=>req.session.destroy(err=>err?reject(err):resolve()));res.clearCookie('skyline.sid',{path:'/'});res.json({data:{logged_out:true}});}));
  router.patch('/profile',requireAuth,(req,res)=>{const d=validate(z.object({name:z.string().trim().min(2).max(120),phone:z.string().max(30).default('')}).strict(),req.body);getDb().prepare('UPDATE users SET name=?,phone=?,updated_at=? WHERE id=?').run(d.name,d.phone,now(),req.user!.id);res.json({data:userById(req.user!.id)});});
  router.post('/change-password',requireAuth,asyncRoute(async(req,res)=>{
    const d=validate(z.object({currentPassword:z.string().min(1).max(200),newPassword:passwordSchema}).strict(),req.body),db=getDb();
    const row=db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user!.id) as any;
    if(!await argon2.verify(row.password_hash,d.currentPassword)) throw apiError(422,'WRONG_PASSWORD','Current password is incorrect.',{currentPassword:['Current password is incorrect.']});
    const hash=await hashPassword(d.newPassword);
    db.transaction(()=>{db.prepare('UPDATE users SET password_hash=?,session_version=session_version+1,updated_at=? WHERE id=?').run(hash,now(),req.user!.id);db.prepare('UPDATE password_reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL').run(now(),req.user!.id);audit(req.user!.id,'PASSWORD_CHANGED','user',req.user!.id);})();
    await new Promise<void>(resolve=>req.session.destroy(()=>resolve()));res.clearCookie('skyline.sid');res.json({data:{changed:true,sign_in_required:true}});
  }));
  router.post('/users/:id/reset',requireAdmin,issuePasswordReset);
  router.post('/reset/consume',asyncRoute(async(req,res)=>{
    const d=validate(z.object({token:z.string().min(20).max(200),newPassword:passwordSchema}).strict(),req.body),db=getDb();
    const hash=await hashPassword(d.newPassword);
    const userId=db.transaction(()=>{
      const row=db.prepare('SELECT * FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?').get(tokenHash(d.token),now()) as any;
      if(!row) throw apiError(422,'INVALID_RESET','Setup link is invalid or has expired.');
      db.prepare('UPDATE password_reset_tokens SET used_at=? WHERE id=? AND used_at IS NULL').run(now(),row.id);
      db.prepare('UPDATE users SET password_hash=?,session_version=session_version+1,updated_at=? WHERE id=?').run(hash,now(),row.user_id);
      audit(row.user_id,'RESET_CONSUMED','user',row.user_id);return row.user_id;
    }).immediate();
    await new Promise<void>(resolve=>req.session.destroy(()=>resolve()));res.clearCookie('skyline.sid');res.json({data:{reset:true,user_id:userId}});
  }));
  return router;
}
