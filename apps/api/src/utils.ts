import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import type { ZodType } from 'zod';
import { getDb } from './db/index.js';

export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string,string[]>) { super(message); }
}
export function apiError(status:number,code:string,message:string,fields?:Record<string,string[]>): ApiError { return new ApiError(status,code,message,fields); }
export function validate<T>(schema: ZodType<T>, body: unknown): T {
  const result=schema.safeParse(body);
  if(!result.success) { const fields:Record<string,string[]>={}; for(const issue of result.error.issues) (fields[issue.path.join('.')||'_form'] ||= []).push(issue.message); throw apiError(422,'VALIDATION_ERROR','Please check the highlighted fields.',fields); }
  return result.data;
}
// Zod defaults inside optional fields may materialize even on partial objects.
// A PATCH may persist only fields the caller actually supplied.
export function validatePatch<T>(schema: ZodType<T>, body: unknown): T {
  const data = validate(schema, body) as Record<string, unknown>;
  return Object.fromEntries(Object.keys(body as object).map(key => [key, data[key]])) as T;
}
export function audit(actor:string|null,action:string,entity:string,entityId:string|null,details:unknown={}):void {
  getDb().prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)').run(id(),actor,action,entity,entityId,JSON.stringify(details),now());
}
export const asyncRoute = (fn:(req:Request,res:Response,next:NextFunction)=>unknown):RequestHandler => (req,res,next) => { Promise.resolve().then(()=>fn(req,res,next)).catch(next); };
function canonical(value:any): string { if(value===null||typeof value!=='object') return JSON.stringify(value); if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']'; return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}'; }
export function withIdempotency<T>(req: Request, action: string, callback:()=>T):T {
  const key=req.get('Idempotency-Key'); const db=getDb();
  if(!key) return db.transaction(callback).immediate();
  if(!req.user||!key.match(/^[\w.:-]{1,150}$/)) throw apiError(422,'INVALID_IDEMPOTENCY_KEY','Use a safe idempotency key up to 150 characters.');
  const actor=req.user.id, payloadHash=createHash('sha256').update(canonical({params:req.params,body:req.body})).digest('hex');
  return db.transaction(()=>{
    const stored=db.prepare('SELECT * FROM idempotency_keys WHERE actor_id=? AND action=? AND key=?').get(actor,action,key) as any;
    if(stored) { if(stored.payload_hash!==payloadHash) throw apiError(409,'IDEMPOTENCY_MISMATCH','This idempotency key was already used with different input.'); return JSON.parse(stored.response_json) as T; }
    const result=callback();
    db.prepare('INSERT INTO idempotency_keys VALUES(?,?,?,?,?,?)').run(actor,action,key,payloadHash,JSON.stringify(result),now());
    return result;
  }).immediate();
}
export function errorHandler(error:any,_req:Request,res:Response,_next:NextFunction):void {
  if(error instanceof ApiError) { res.status(error.status).json({error:{code:error.code,message:error.message,...(error.fields?{fields:error.fields}:{})}}); return; }
  if(error.code==='EBADCSRFTOKEN') { res.status(403).json({error:{code:'CSRF_INVALID',message:'Your session changed. Reload and try again.'}}); return; }
  if(error.code?.startsWith('SQLITE_CONSTRAINT')) { res.status(409).json({error:{code:'CONFLICT',message:'This change conflicts with an existing record or constraint.'}}); return; }
  if(error.type==='entity.too.large'||error.code==='LIMIT_FILE_SIZE') { res.status(413).json({error:{code:'FILE_TOO_LARGE',message:'Maximum receipt size is 5 MB.'}}); return; }
  if(error instanceof SyntaxError && 'body' in error) { res.status(422).json({error:{code:'INVALID_JSON',message:'Request body must be valid JSON.'}}); return; }
  console.error('API error:',error.message);
  res.status(500).json({error:{code:'INTERNAL_ERROR',message:'Unable to complete this request.'}});
}
