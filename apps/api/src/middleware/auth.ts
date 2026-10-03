import type { RequestHandler } from 'express';
import type { User } from '../../../../packages/shared/src/index.js';
import { getDb } from '../db/index.js';
import { apiError } from '../utils.js';

declare global { namespace Express { interface Request { user?: User } } }
declare module 'express-session' { interface SessionData { userId?:string; sessionVersion?:number; loggedInAt?:number } }
export function userById(userId:string):User|undefined {
  const row=getDb().prepare('SELECT id,email,name,phone,active FROM users WHERE id=?').get(userId) as Omit<User,'roles'>|undefined;
  if(!row) return undefined;
  return {...row,roles:(getDb().prepare('SELECT role FROM user_roles WHERE user_id=? ORDER BY role').all(userId) as {role:'admin'|'volunteer'|'student'}[]).map(r=>r.role)};
}
export const attachUser:RequestHandler=(req,_res,next)=>{
  if(!req.session.userId) { next(); return; }
  const version=getDb().prepare('SELECT active,session_version FROM users WHERE id=?').get(req.session.userId) as any;
  if(!version?.active||version.session_version!==req.session.sessionVersion||!req.session.loggedInAt||Date.now()-req.session.loggedInAt>8*60*60*1000) { req.session.destroy(()=>next()); return; }
  req.user=userById(req.session.userId); next();
};
export const requireAuth:RequestHandler=(req,_res,next)=>{ if(!req.user) { next(apiError(401,'UNAUTHENTICATED','Please sign in to continue.')); return; } next(); };
export const requireAdmin:RequestHandler=(req,_res,next)=>{ if(!req.user) { next(apiError(401,'UNAUTHENTICATED','Please sign in to continue.')); return; } if(!req.user.roles.includes('admin')) { next(apiError(403,'FORBIDDEN','Administrator access is required.')); return; } next(); };
export const requireVolunteer:RequestHandler=(req,_res,next)=>{ if(!req.user?.roles.includes('volunteer')) { next(apiError(req.user?403:401,'FORBIDDEN','Volunteer access is required.')); return; } next(); };
export const requireStudent:RequestHandler=(req,_res,next)=>{ if(!req.user?.roles.includes('student')) { next(apiError(req.user?403:401,'FORBIDDEN','Student access is required.')); return; } next(); };
