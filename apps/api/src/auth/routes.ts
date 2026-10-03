import { Router } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import { randomBytes,createHash } from 'node:crypto';
import { loginSchema,passwordSchema,studentRegistrationSchema } from '../../../../packages/shared/src/index.js';
import { getDb } from '../db/index.js';
import { requireAdmin,requireAuth,userById } from '../middleware/auth.js';
import { apiError,asyncRoute,audit,id,now,validate } from '../utils.js';
import { sendVerificationEmail, getLastVerificationToken } from '../services/email.js';

export const hashPassword=(password:string)=>argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
const dummyHash=hashPassword(randomBytes(24).toString('hex'));
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
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
  router.get('/me',requireAuth,(req,res)=>res.json({data:{...req.user,workspaces:req.user?.roles}}));
  router.post('/login',asyncRoute(async(req,res)=>{
    const data=validate(loginSchema,req.body), db=getDb(), key=`${req.ip}:${data.email}`;
    const attempt=db.prepare('SELECT * FROM login_attempts WHERE key=?').get(key) as any;
    if(attempt?.blocked_until&&attempt.blocked_until>now()) throw apiError(429,'LOGIN_THROTTLED','Sign in was unsuccessful. Please try again later.');
    const row=db.prepare('SELECT * FROM users WHERE email=?').get(data.email) as any;
    const trimmed=data.password.trim();
    let matches=await argon2.verify(row?.password_hash||await dummyHash,data.password);
    if(!matches&&trimmed!==data.password&&row?.password_hash) matches=await argon2.verify(row.password_hash,trimmed);
    const user=row?userById(row.id):undefined;
    if(!matches||!user?.active||!user.roles.length) {
      const failures=attempt&&(Date.now()-Date.parse(attempt.updated_at)<15*60*1000)?attempt.failures+1:1;
      db.prepare('INSERT INTO login_attempts(key,failures,blocked_until,updated_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET failures=excluded.failures,blocked_until=excluded.blocked_until,updated_at=excluded.updated_at').run(key,failures,failures>=5?new Date(Date.now()+15*60*1000).toISOString():null,now());
      throw apiError(401,'LOGIN_FAILED','Sign in was unsuccessful. Check your details.');
    }
    if(user.roles.includes('student')&&!row.email_verified_at) {
      throw apiError(403,'EMAIL_NOT_VERIFIED','Please verify your email address before signing in.');
    }
    db.prepare('DELETE FROM login_attempts WHERE key=?').run(key);
    await new Promise<void>((resolve,reject)=>req.session.regenerate(err=>err?reject(err):resolve()));
    req.session.userId=row.id;req.session.sessionVersion=row.session_version;req.session.loggedInAt=Date.now();
    const csrfToken=generateToken(req,true);
    await new Promise<void>((resolve,reject)=>req.session.save(err=>err?reject(err):resolve()));
    audit(row.id,'LOGIN','user',row.id,{roles:user.roles});
    res.json({data:{...user,roles:user.roles,workspaces:user.roles,csrfToken}});
  }));
  router.post('/register/student',asyncRoute(async(req,res)=>{
    const data=validate(studentRegistrationSchema,req.body), db=getDb();
    const existing=db.prepare('SELECT id FROM users WHERE email=?').get(data.email) as any;
    if(existing) throw apiError(409,'EMAIL_EXISTS','An account with this email address already exists.');
    const userId=id();
    const hash=await hashPassword(data.password);
    const token=randomBytes(32).toString('base64url');
    const hashedToken=tokenHash(token);
    const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
    db.transaction(()=>{
      db.prepare('INSERT INTO users(id,email,name,phone,password_hash,active,session_version,created_at,updated_at,email_verified_at) VALUES(?,?,?,?,?,1,1,?,?,NULL)').run(userId,data.email,data.name,data.phone,hash,now(),now());
      db.prepare('INSERT INTO user_roles(user_id,role) VALUES(?,?)').run(userId,'student');
      db.prepare('INSERT INTO email_verification_tokens(id,user_id,token_hash,expires_at,used_at,created_at) VALUES(?,?,?,?,NULL,?)').run(id(),userId,hashedToken,expiresAt,now());
      audit(userId,'STUDENT_REGISTERED','user',userId,{email:data.email,phone:data.phone});
    })();
    const reqOrigin=req.get('Origin')||(req.get('host')?`${req.protocol}://${req.get('host')}`:undefined);
    await sendVerificationEmail({to:data.email,name:data.name,token,origin:reqOrigin});
    res.status(201).json({data:{registered:true,email:data.email,requires_verification:true}});
  }));
  router.post('/verify-email',asyncRoute(async(req,res)=>{
    const data=validate(z.object({token:z.string().min(1).max(200)}).strict(),req.body), db=getDb();
    const hashed=tokenHash(data.token);
    const tokenRow=db.prepare('SELECT * FROM email_verification_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?').get(hashed,now()) as any;
    if(!tokenRow) throw apiError(400,'INVALID_VERIFICATION_TOKEN','This verification link is invalid or has expired.');
    db.transaction(()=>{
      db.prepare('UPDATE email_verification_tokens SET used_at=? WHERE id=?').run(now(),tokenRow.id);
      db.prepare('UPDATE users SET email_verified_at=?,updated_at=? WHERE id=?').run(now(),now(),tokenRow.user_id);
      db.prepare('UPDATE email_verification_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL').run(now(),tokenRow.user_id);
      audit(tokenRow.user_id,'EMAIL_VERIFIED','user',tokenRow.user_id);
    })();
    res.json({data:{verified:true,message:'Email verified successfully.'}});
  }));
  router.post('/resend-verification',asyncRoute(async(req,res)=>{
    const data=validate(z.object({email:z.string().email().max(254).transform(v=>v.toLowerCase().trim())}).strict(),req.body), db=getDb();
    const user=db.prepare('SELECT u.*,ur.role FROM users u JOIN user_roles ur ON ur.user_id=u.id WHERE u.email=? AND ur.role=?').get(data.email,'student') as any;
    if(user&&user.active&&!user.email_verified_at) {
      const recent=db.prepare('SELECT created_at FROM email_verification_tokens WHERE user_id=? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1').get(user.id) as any;
      const tooSoon=recent&&(Date.now()-Date.parse(recent.created_at)<60*1000);
      if(!tooSoon) {
        const token=randomBytes(32).toString('base64url');
        const hashedToken=tokenHash(token);
        const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
        db.transaction(()=>{
          db.prepare('UPDATE email_verification_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL').run(now(),user.id);
          db.prepare('INSERT INTO email_verification_tokens(id,user_id,token_hash,expires_at,used_at,created_at) VALUES(?,?,?,?,NULL,?)').run(id(),user.id,hashedToken,expiresAt,now());
          audit(user.id,'RESEND_VERIFICATION','user',user.id);
        })();
        const reqOrigin=req.get('Origin')||(req.get('host')?`${req.protocol}://${req.get('host')}`:undefined);
        await sendVerificationEmail({to:user.email,name:user.name,token,origin:reqOrigin});
      }
    }
    res.json({data:{sent:true,message:'If an eligible account exists, a verification email has been sent.'}});
  }));
  if (process.env.NODE_ENV === 'test') {
    router.get('/test/last-verification-token', (req, res) => {
      const email = String(req.query.email || '');
      res.json({ data: { token: getLastVerificationToken(email) } });
    });
  }
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
