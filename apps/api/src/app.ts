import express from 'express';
import session from 'express-session';
import knex from 'knex';
import { ConnectSessionKnexStore } from 'connect-session-knex';
import { csrfSync } from 'csrf-sync';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { databasePath,getDb,migrateDb } from './db/index.js';
import { attachUser } from './middleware/auth.js';
import { createAuthRouter } from './auth/routes.js';
import { createCoreRouter } from './routes/core.js';
import { createOperationsRouter } from './routes/operations.js';
import { createStudentRouter } from './routes/student.js';
import { createPaymentsRouter } from './routes/payments.js';
import { apiError,errorHandler } from './utils.js';

export function createApp() {
  const app=express();migrateDb(getDb());
  const production=process.env.NODE_ENV==='production';
  if(production&&(getDb().prepare('SELECT demo_mode FROM organization_settings WHERE id=1').get() as any).demo_mode) throw new Error('Production requires a non-demo database with unique credentials. Follow docs/deployment.md.');
  const secret=process.env.SESSION_SECRET||(production?'':'local-demo-only-secret-replace-with-unique-32-plus-character-secret');
  if(secret.length<32||(production&&/replace|local-demo/i.test(secret))) throw new Error('Set a unique SESSION_SECRET of at least 32 characters.');
  if(production&&!process.env.APP_ORIGIN?.startsWith('https://')) throw new Error('Production APP_ORIGIN must be the exact HTTPS application origin.');
  if(production) app.set('trust proxy',1);
  app.disable('x-powered-by');
  app.use(helmet({contentSecurityPolicy:production?undefined:false,strictTransportSecurity:production?undefined:false}));
  app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.use((_req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin'});next();});
  const sessionDb=knex({client:'better-sqlite3',connection:{filename:databasePath()},useNullAsDefault:true,pool:{min:1,max:1,afterCreate:(conn:any,done:any)=>{conn.pragma('foreign_keys=ON');conn.pragma('journal_mode=WAL');conn.pragma('busy_timeout=5000');done(null,conn);}}});
  const store=new ConnectSessionKnexStore({knex:sessionDb,tableName:'sessions',createTable:false,cleanupInterval:60000});
  app.locals.close=()=>{store.options.cleanupInterval=0;clearTimeout((store as any).nextDbCleanup);return sessionDb.destroy();};app.locals.sessionStore=store;
  app.use(session({name:'skyline.sid',store,secret,resave:false,saveUninitialized:false,rolling:true,cookie:{httpOnly:true,sameSite:'lax',secure:production,maxAge:30*60*1000,path:'/'}}));
  app.use(express.json({limit:'100kb',verify:(req:any,_res,buf)=>{req.rawBody=buf;}}));
  app.use(attachUser);
  const {generateToken,csrfSynchronisedProtection}=csrfSync({getTokenFromRequest:req=>req.get('X-CSRF-Token')});
  app.use('/api',(req,_res,next)=>{
    if(req.path==='/v1/payments/razorpay/webhook') return next();
    if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const origin=req.get('Origin'),ownOrigin=`${req.protocol}://${req.get('host')}`;
      const configured=(process.env.APP_ORIGIN||'').split(',').map(s=>s.trim()).filter(Boolean);
      const isAllowed=!origin || origin===ownOrigin || configured.includes(origin) || (!production && (origin==='http://localhost:5173' || origin==='http://127.0.0.1:5173' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)));
      if(!isAllowed) {next(apiError(403,'ORIGIN_FORBIDDEN','This request origin is not allowed.'));return;}
    }
    next();
  },(req,res,next)=>{
    if(req.path==='/v1/payments/razorpay/webhook') return next();
    csrfSynchronisedProtection(req,res,next);
  });
  app.get('/api/v1/health',(_req,res)=>res.json({data:{status:'ok',database:'sqlite',currency:'INR'}}));
  const authLimiter=rateLimit({windowMs:15*60*1000,limit:process.env.NODE_ENV==='test'?10000:40,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:{code:'LOGIN_THROTTLED',message:'Too many attempts. Please try again later.'}})});
  const regLimiter=rateLimit({windowMs:15*60*1000,limit:process.env.NODE_ENV==='test'?10000:15,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:{code:'REGISTRATION_THROTTLED',message:'Too many registration attempts. Please try again later.'}})});
  const resendLimiter=rateLimit({windowMs:15*60*1000,limit:process.env.NODE_ENV==='test'?10000:10,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:{code:'RESEND_THROTTLED',message:'Too many resend attempts. Please wait before requesting another verification email.'}})});
  app.use(['/api/v1/auth/login','/api/v1/auth/reset/consume'],authLimiter);
  app.use('/api/v1/auth/register/student',regLimiter);
  app.use('/api/v1/auth/resend-verification',resendLimiter);
  app.use('/api/v1/auth',createAuthRouter(generateToken));
  app.use('/api/v1/payments',createPaymentsRouter());
  app.use('/api/v1',createCoreRouter(),createOperationsRouter(),createStudentRouter());
  app.use('/api',(_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'API route not found.'}}));
  const dist=path.resolve('apps/web/dist');
  if(fs.existsSync(path.join(dist,'index.html'))) {
    app.use(express.static(dist,{index:false}));
    app.get(/^\/(admin|volunteer|student)(\/.*)?$/,(_req,res)=>res.sendFile(path.join(dist,'index.html')));
    app.get('/reset-password',(_req,res)=>res.sendFile(path.join(dist,'index.html')));
    app.get('/',(_req,res)=>res.redirect('/admin/login'));
  }
  app.use((_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'Route not found.'}}));
  app.use(errorHandler);return app;
}
