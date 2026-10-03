import { Router } from 'express';
import { z } from 'zod';
import { DateTime,IANAZone } from 'luxon';
import { randomBytes } from 'node:crypto';
import { memberSchema,eventSchema,taskSchema,passwordSchema,moneySchema } from '../../../../packages/shared/src/index.js';
import { getDb } from '../db/index.js';
import { userById,requireAdmin,requireAuth } from '../middleware/auth.js';
import { hashPassword,issuePasswordReset,issuePasswordResetData } from '../auth/routes.js';
import { apiError,asyncRoute,audit,id,now,validate,validatePatch,withIdempotency } from '../utils.js';

export function settings():any {return getDb().prepare('SELECT * FROM organization_settings WHERE id=1').get();}
export function localToday():string {return DateTime.now().setZone(settings().timezone).toISODate()!;}
export function memberIsActive(memberId:string):boolean {
  return !!getDb().prepare('SELECT 1 FROM member_records m JOIN membership_terms t ON t.member_id=m.id WHERE m.id=? AND m.archived=0 AND t.status=\'PAID\' AND t.starts_on<=? AND t.ends_on>=?').get(memberId,localToday(),localToday());
}
function existing(table:'events'|'member_records'|'tasks'|'users',recordId:string):any {const row=getDb().prepare(`SELECT * FROM ${table} WHERE id=?`).get(recordId);if(!row) throw apiError(404,'NOT_FOUND','Record not found.');return row;}
function activeVolunteer(userId:string):void {const user=userById(userId);if(!user?.active||!user.roles.includes('volunteer')) throw apiError(422,'INVALID_VOLUNTEER','Select an active volunteer.');}
function enrichMember(member:any):any {
  const terms=getDb().prepare('SELECT * FROM membership_terms WHERE member_id=? ORDER BY ends_on DESC').all(member.id) as any[];
  const today=localToday(),active=terms.find(t=>t.status==='PAID'&&t.starts_on<=today&&t.ends_on>=today),term=active||terms[0];
  let membership_status='NONE';
  if(member.archived) membership_status='ARCHIVED';
  else if(active) membership_status=active.ends_on<=DateTime.fromISO(today).plus({days:30}).toISODate()!?'EXPIRING':'ACTIVE';
  else if(term&&term.ends_on<today) membership_status='EXPIRED';else if(term?.status==='UNPAID') membership_status='UNPAID';else if(term&&term.starts_on>today) membership_status='UPCOMING';
  return {...member,membership_status,payment_status:term?.status||'NONE',current_term:term||null,unpaid_paise:terms.filter(t=>t.status==='UNPAID').reduce((n,t)=>n+t.dues_paise,0),eligible:!!active&&!member.archived};
}
function adminView(req:any):boolean {
  if(req.query.mine==='true'&&!req.user.roles.includes('volunteer')) throw apiError(403,'FORBIDDEN','Volunteer permission is required.');
  return req.user.roles.includes('admin')&&req.query.mine!=='true';
}
function eventForRole(req:any,event:any):any {
  if(adminView(req)) return event;
  const {budget_paise,member_price_paise,nonmember_price_paise,...view}=event;
  return view;
}
function eventVisible(req:any,eventId:string):any {
  const event=existing('events',eventId);
  if(adminView(req)) return event;
  if(!req.user.roles.includes('volunteer')) throw apiError(403,'FORBIDDEN','Access denied.');
  if(event.status==='PUBLISHED'||getDb().prepare('SELECT 1 FROM event_assignments WHERE event_id=? AND user_id=?').get(eventId,req.user.id)) return event;
  throw apiError(404,'NOT_FOUND','Event not found.');
}
const methodSchema=z.enum(['cash','upi','card','bank','other']);
function settlement(req:any,sourceType:string,sourceId:string,amount:number,category:string,description:string,eventId:string|null,method:string,reference:string):string {
  const db=getDb(),paymentId=id(),timestamp=now();
  db.prepare('INSERT INTO payments(id,source_type,source_id,amount_paise,method,reference,settlement_kind,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(paymentId,sourceType,sourceId,amount,method,reference,settings().demo_mode?'mock':'manual',req.user.id,timestamp);
  if(amount>0) db.prepare('INSERT INTO ledger_entries(id,direction,amount_paise,category,description,event_id,payment_id,actor_id,occurred_at,created_at) VALUES(?,\'IN\',?,?,?,?,?,?,?,?)').run(id(),amount,category,description,eventId,paymentId,req.user.id,timestamp,timestamp);
  return paymentId;
}
export function createCoreRouter() {
  const router=Router();
  router.post('/users/:id/reset', requireAuth,requireAdmin,issuePasswordReset);
  router.get('/members', requireAuth,requireAdmin,(req,res)=>{
    let members=getDb().prepare('SELECT * FROM member_records ORDER BY name').all().map(enrichMember);
    const q=String(req.query.q||'').toLowerCase(),status=String(req.query.status||'');
    if(q) members=members.filter(m=>`${m.name} ${m.email} ${m.student_number}`.toLowerCase().includes(q));if(status) members=members.filter(m=>m.membership_status===status);
    res.json({data:members});
  });
  router.get('/members/:id', requireAuth,requireAdmin,(req,res)=>{
    const member=enrichMember(existing('member_records',String(req.params.id))),db=getDb();
    res.json({data:{...member,record:member,terms:db.prepare('SELECT * FROM membership_terms WHERE member_id=? ORDER BY ends_on DESC').all(member.id),payments:db.prepare('SELECT p.*,t.starts_on,t.ends_on FROM dues_payments d JOIN membership_terms t ON t.id=d.term_id JOIN payments p ON p.id=d.payment_id WHERE t.member_id=? ORDER BY p.created_at DESC').all(member.id)}});
  });
  router.post('/members', requireAuth,requireAdmin,(req,res)=>{
    const d=validate(memberSchema,req.body),recordId=id(),timestamp=now();
    if(d.user_id) existing('users',d.user_id);
    getDb().prepare('INSERT INTO member_records(id,user_id,name,email,phone,student_number,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(recordId,d.user_id||null,d.name,d.email,d.phone,d.student_number,d.notes,timestamp,timestamp);audit(req.user!.id,'MEMBER_CREATED','member',recordId);res.status(201).json({data:enrichMember(existing('member_records',recordId))});
  });
  router.patch('/members/:id', requireAuth,requireAdmin,(req,res)=>{
    const d=validatePatch(memberSchema.partial().extend({archived:z.boolean().optional()}),req.body),row=existing('member_records',String(req.params.id));
    if(d.user_id) existing('users',d.user_id);
    const next={...row,...d};getDb().prepare('UPDATE member_records SET user_id=?,name=?,email=?,phone=?,student_number=?,notes=?,archived=?,updated_at=? WHERE id=?').run(next.user_id||null,next.name,next.email,next.phone,next.student_number,next.notes,next.archived?1:0,now(),row.id);audit(req.user!.id,'MEMBER_UPDATED','member',row.id,{archived:!!next.archived});res.json({data:enrichMember(existing('member_records',row.id))});
  });
  router.post('/members/:id/renew', requireAuth,requireAdmin,(req,res)=>{
    const d=validate(z.object({starts_on:z.iso.date().optional(),ends_on:z.iso.date().optional(),dues_paise:moneySchema.refine(v=>v>0).optional()}).strict(),req.body);
    const result=withIdempotency(req,'members.renew',()=>{
      const member=existing('member_records',String(req.params.id));if(member.archived) throw apiError(409,'ARCHIVED_MEMBER','Restore this member before renewal.');
      const last=getDb().prepare('SELECT * FROM membership_terms WHERE member_id=? ORDER BY ends_on DESC LIMIT 1').get(member.id) as any;
      const today=localToday(),starts=d.starts_on||(last?.ends_on>=today?DateTime.fromISO(last.ends_on).plus({days:1}).toISODate()!:today);
      const cfg=settings(),year=Number(starts.slice(0,4));let ends=d.ends_on||`${year}-${cfg.membership_year_end}`;if(!d.ends_on&&ends<starts) ends=`${year+1}-${cfg.membership_year_end}`;
      if(ends<starts||!DateTime.fromISO(ends).isValid) throw apiError(422,'INVALID_TERM','Membership end must be on or after its start.');
      if(getDb().prepare('SELECT 1 FROM membership_terms WHERE member_id=? AND starts_on<=? AND ends_on>=?').get(member.id,ends,starts)) throw apiError(409,'OVERLAPPING_TERM','Membership renewal must follow existing terms.');
      const termId=id();getDb().prepare('INSERT INTO membership_terms VALUES(?,?,?,?,?,\'UNPAID\',?)').run(termId,member.id,starts,ends,d.dues_paise||cfg.dues_paise,now());audit(req.user!.id,'MEMBERSHIP_RENEWED','member',member.id,{term_id:termId});return getDb().prepare('SELECT * FROM membership_terms WHERE id=?').get(termId);
    });res.status(201).json({data:result});
  });
  router.post('/members/:id/dues', requireAuth,requireAdmin,(req,res)=>{
    const d=validate(z.object({term_id:z.string().optional(),method:methodSchema,reference:z.string().max(200).default('')}).strict(),req.body);
    const result=withIdempotency(req,'members.dues',()=>{
      const member=existing('member_records',String(req.params.id));if(member.archived) throw apiError(409,'ARCHIVED_MEMBER','Restore this member before recording dues.');
      const term=(d.term_id?getDb().prepare('SELECT * FROM membership_terms WHERE id=? AND member_id=?').get(d.term_id,member.id):getDb().prepare('SELECT * FROM membership_terms WHERE member_id=? AND status=\'UNPAID\' ORDER BY ends_on DESC LIMIT 1').get(member.id)) as any;
      if(!term) throw apiError(404,'NOT_FOUND','Unpaid membership term not found.');if(term.status==='PAID') throw apiError(409,'ALREADY_SETTLED','This membership is already paid.');
      const paymentSource=id();getDb().prepare('INSERT INTO dues_payments(id,term_id,amount_paise,created_at) VALUES(?,?,?,?)').run(paymentSource,term.id,term.dues_paise,now());
      const paymentId=settlement(req,'dues',paymentSource,term.dues_paise,'membership',`Membership dues · ${member.name}`,null,d.method,d.reference);
      getDb().prepare('UPDATE dues_payments SET payment_id=? WHERE id=?').run(paymentId,paymentSource);getDb().prepare('UPDATE membership_terms SET status=\'PAID\' WHERE id=? AND status=\'UNPAID\'').run(term.id);audit(req.user!.id,'DUES_SETTLED','member',member.id,{term_id:term.id,payment_id:paymentId});return {...enrichMember(member),payment_id:paymentId,settlement_kind:settings().demo_mode?'mock':'manual'};
    });res.json({data:result});
  });
  router.get(['/volunteers','/users'], requireAuth,requireAdmin,(_req,res)=>{
    const users=getDb().prepare('SELECT id FROM users ORDER BY name').all() as any[];
    res.json({data:users.map(row=>({...userById(row.id),open_tasks:(getDb().prepare('SELECT COUNT(*) n FROM tasks WHERE assignee_id=? AND status IN(\'ASSIGNED\',\'IN_PROGRESS\')').get(row.id) as any).n}))});
  });
  router.post(['/volunteers','/users'], requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
    const d=validate(z.object({name:z.string().trim().min(2).max(120),email:z.email().max(254),phone:z.string().max(30).default(''),password:passwordSchema.optional(),roles:z.array(z.enum(['admin','volunteer'])).min(1).max(2).default(['volunteer'])}).strict(),req.body),hash=await hashPassword(d.password||randomBytes(48).toString('base64url')),userId=id();
    const setup=getDb().transaction(()=>{getDb().prepare('INSERT INTO users(id,email,name,phone,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(userId,d.email.toLowerCase(),d.name,d.phone,hash,now(),now());for(const role of new Set(d.roles)) getDb().prepare('INSERT INTO user_roles VALUES(?,?)').run(userId,role);audit(req.user!.id,'ACCOUNT_CREATED','user',userId,{roles:d.roles});return d.password?{}:issuePasswordResetData(req.user!.id,userId);}).immediate();res.status(201).json({data:{...userById(userId),...setup}});
  }));
  router.patch(['/users/:id','/volunteers/:id'], requireAuth,requireAdmin,(req,res)=>{
    const d=validate(z.object({name:z.string().trim().min(2).max(120).optional(),phone:z.string().max(30).optional(),active:z.boolean().optional(),roles:z.array(z.enum(['admin','volunteer'])).min(1).max(2).optional()}).strict(),req.body),userId=String(req.params.id);
    getDb().transaction(()=>{
      const row=existing('users',userId),user=userById(userId)!,roles=d.roles||user.roles,active=d.active===undefined?!!row.active:d.active;
      if(row.active&&user.roles.includes('admin')&&(!active||!roles.includes('admin'))) {
        const admins=(getDb().prepare('SELECT COUNT(*) n FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.active=1 AND r.role=\'admin\'').get() as any).n;
        if(admins<=1) throw apiError(409,'FINAL_ADMIN','The final active administrator cannot be removed or deactivated.');
      }
      getDb().prepare('UPDATE users SET name=?,phone=?,active=?,session_version=session_version+?,updated_at=? WHERE id=?').run(d.name||row.name,d.phone??row.phone,active?1:0,active?0:1,now(),userId);
      if(d.roles) {getDb().prepare('DELETE FROM user_roles WHERE user_id=?').run(userId);for(const role of new Set(d.roles)) getDb().prepare('INSERT INTO user_roles VALUES(?,?)').run(userId,role);}
      audit(req.user!.id,'ACCOUNT_ROLES_UPDATED','user',userId,{active,roles});
    }).immediate();res.json({data:userById(userId)});
  });
  router.get('/events', requireAuth,(req,res)=>{
    const db=getDb(),admin=adminView(req),userId=req.user!.id;
    const events=(db.prepare(admin?'SELECT * FROM events ORDER BY start_at DESC':'SELECT e.* FROM events e WHERE e.status=\'PUBLISHED\' OR EXISTS(SELECT 1 FROM event_assignments a WHERE a.event_id=e.id AND a.user_id=?) ORDER BY start_at DESC').all(...(admin?[]:[userId])) as any[]).map(e=>{
      const response=db.prepare('SELECT response FROM volunteer_availability WHERE event_id=? AND user_id=?').get(e.id,userId) as any;
      return {...eventForRole(req,e),assigned:!!db.prepare('SELECT 1 FROM event_assignments WHERE event_id=? AND user_id=?').get(e.id,userId),can_check_in:!!db.prepare('SELECT 1 FROM event_assignments WHERE event_id=? AND user_id=? AND can_check_in=1').get(e.id,userId),availability_response:response?.response||null,availability_requested:!!db.prepare('SELECT 1 FROM availability_requests WHERE event_id=?').get(e.id),tickets_sold:e.seats_sold,assigned_count:(db.prepare('SELECT COUNT(*) n FROM event_assignments WHERE event_id=?').get(e.id) as any).n};
    });res.json({data:events});
  });
  router.post('/events', requireAuth,requireAdmin,(req,res)=>{
    const d=validate(eventSchema,req.body);if(d.end_at<d.start_at) throw apiError(422,'INVALID_DATES','Event end must follow its start.');const eventId=id();
    getDb().prepare('INSERT INTO events(id,title,type,description,start_at,end_at,location,capacity,member_price_paise,nonmember_price_paise,budget_paise,volunteer_requirement,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(eventId,d.title,d.type,d.description,d.start_at,d.end_at,d.location,d.capacity,d.member_price_paise,d.nonmember_price_paise,d.budget_paise,d.volunteer_requirement,d.status,now(),now());audit(req.user!.id,'EVENT_CREATED','event',eventId);res.status(201).json({data:existing('events',eventId)});
  });
  router.patch('/events/:id', requireAuth,requireAdmin,(req,res)=>{
    const d=validatePatch(eventSchema.partial(),req.body),row=existing('events',String(req.params.id)),next={...row,...d};
    if(next.end_at<next.start_at) throw apiError(422,'INVALID_DATES','Event end must follow its start.');if(next.capacity<row.seats_sold) throw apiError(409,'SOLD_CAPACITY','Capacity cannot be below already issued tickets.');
    if(row.status==='CANCELLED'&&next.status!=='CANCELLED') throw apiError(409,'CANCELLED_EVENT','Cancelled events cannot be republished.');
    getDb().transaction(()=>{getDb().prepare('UPDATE events SET title=?,type=?,description=?,start_at=?,end_at=?,location=?,capacity=?,member_price_paise=?,nonmember_price_paise=?,budget_paise=?,volunteer_requirement=?,status=?,updated_at=? WHERE id=?').run(next.title,next.type,next.description,next.start_at,next.end_at,next.location,next.capacity,next.member_price_paise,next.nonmember_price_paise,next.budget_paise,next.volunteer_requirement,next.status,now(),row.id);let cancelled_tasks=0;if(next.status==='CANCELLED'){getDb().prepare('UPDATE tickets SET status=\'CANCELLED\',refund_status=CASE WHEN price_paise>0 AND refund_status=\'NONE\' THEN \'UNRESOLVED\' ELSE refund_status END WHERE event_id=?').run(row.id);cancelled_tasks=getDb().prepare('UPDATE tasks SET status=\'CANCELLED\',updated_at=? WHERE event_id=? AND status IN(\'ASSIGNED\',\'IN_PROGRESS\')').run(now(),row.id).changes;}audit(req.user!.id,'EVENT_UPDATED','event',row.id,{status:next.status,cancelled_tasks});}).immediate();res.json({data:existing('events',row.id)});
  });
  router.get('/events/:id', requireAuth,(req,res)=>{
    const event=eventVisible(req,String(req.params.id)),db=getDb(),admin=adminView(req),userId=req.user!.id;
    const assignments=db.prepare('SELECT a.*,u.name AS volunteer_name FROM event_assignments a JOIN users u ON u.id=a.user_id WHERE a.event_id=?'+(admin?'':' AND a.user_id=?')).all(event.id,...(admin?[]:[userId]));
    const tasks=db.prepare('SELECT t.*,u.name AS assignee_name FROM tasks t JOIN users u ON u.id=t.assignee_id WHERE t.event_id=?'+(admin?'':' AND t.assignee_id=?')).all(event.id,...(admin?[]:[userId]));
    const availability=admin?db.prepare('SELECT u.id user_id,u.name,v.response,v.note FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role=\'volunteer\' LEFT JOIN volunteer_availability v ON v.user_id=u.id AND v.event_id=? WHERE u.active=1 ORDER BY u.name').all(event.id):db.prepare('SELECT * FROM volunteer_availability WHERE event_id=? AND user_id=?').all(event.id,userId);
    const summary=admin?{...db.prepare('SELECT COALESCE(SUM(CASE WHEN direction=\'IN\' THEN amount_paise ELSE 0 END),0) income_paise,COALESCE(SUM(CASE WHEN direction=\'OUT\' THEN amount_paise ELSE 0 END),0) expense_paise FROM ledger_entries WHERE event_id=?').get(event.id) as any,tickets_sold:event.seats_sold,checked_in:(db.prepare('SELECT COUNT(*) n FROM tickets WHERE event_id=? AND checked_in_at IS NOT NULL').get(event.id) as any).n,approved_unpaid_paise:(db.prepare('SELECT COALESCE(SUM(amount_paise),0) n FROM expense_claims WHERE event_id=? AND status=\'APPROVED_UNPAID\'').get(event.id) as any).n}:undefined;
    const availability_counts=admin?{available:(availability as any[]).filter(v=>v.response==='AVAILABLE').length,unavailable:(availability as any[]).filter(v=>v.response==='UNAVAILABLE').length,no_response:(availability as any[]).filter(v=>!v.response).length}:undefined;
    res.json({data:{...eventForRole(req,event),availability,assignments,tasks,availability_request:db.prepare('SELECT * FROM availability_requests WHERE event_id=?').get(event.id)||null,...(admin?{availability_counts,tickets:db.prepare('SELECT * FROM tickets WHERE event_id=? ORDER BY created_at DESC').all(event.id),summary}:{} )}});
  });
  router.post('/events/:id/availability-request', requireAuth,requireAdmin,(req,res)=>{
    const d=validate(z.object({deadline_at:z.iso.datetime({offset:true}).nullable().optional()}).strict(),req.body),event=existing('events',String(req.params.id));if(event.status==='CANCELLED') throw apiError(409,'CANCELLED_EVENT','This event is cancelled.');
    if(event.status!=='PUBLISHED') throw apiError(409,'EVENT_NOT_PUBLISHED','Publish the event before requesting volunteer availability.');
    getDb().prepare('INSERT INTO availability_requests(id,event_id,requested_by,deadline_at,created_at) VALUES(?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET requested_by=excluded.requested_by,deadline_at=excluded.deadline_at').run(id(),event.id,req.user!.id,d.deadline_at?new Date(d.deadline_at).toISOString():null,now());audit(req.user!.id,'AVAILABILITY_REQUESTED','event',event.id);res.json({data:getDb().prepare('SELECT * FROM availability_requests WHERE event_id=?').get(event.id)});
  });
  router.post('/events/:id/availability', requireAuth,(req,res)=>{
    if(!req.user!.roles.includes('volunteer')) throw apiError(403,'FORBIDDEN','Volunteer role required.');const d=validate(z.object({response:z.enum(['AVAILABLE','UNAVAILABLE']),note:z.string().max(1000).default('')}).strict(),req.body),event=eventVisible(req,String(req.params.id));
    if(event.status==='CANCELLED') throw apiError(409,'CANCELLED_EVENT','This event is cancelled.');if(!getDb().prepare('SELECT 1 FROM availability_requests WHERE event_id=?').get(event.id)) throw apiError(409,'NOT_REQUESTED','Availability has not been requested for this event.');
    getDb().prepare('INSERT INTO volunteer_availability VALUES(?,?,?,?,?,?) ON CONFLICT(event_id,user_id) DO UPDATE SET response=excluded.response,note=excluded.note,updated_at=excluded.updated_at').run(id(),event.id,req.user!.id,d.response,d.note,now());res.json({data:getDb().prepare('SELECT * FROM volunteer_availability WHERE event_id=? AND user_id=?').get(event.id,req.user!.id)});
  });
  router.post('/events/:id/assignments', requireAuth,requireAdmin,(req,res)=>{
    const d=validate(z.object({user_id:z.string(),role_label:z.string().min(1).max(120).default('Volunteer'),can_check_in:z.boolean().default(false)}).strict(),req.body),event=existing('events',String(req.params.id));activeVolunteer(d.user_id);if(event.status==='CANCELLED') throw apiError(409,'CANCELLED_EVENT','This event is cancelled.');
    getDb().prepare('INSERT INTO event_assignments VALUES(?,?,?,?,?,?,?) ON CONFLICT(event_id,user_id) DO UPDATE SET role_label=excluded.role_label,can_check_in=excluded.can_check_in').run(id(),event.id,d.user_id,d.role_label,d.can_check_in?1:0,req.user!.id,now());const response=getDb().prepare('SELECT response FROM volunteer_availability WHERE event_id=? AND user_id=?').get(event.id,d.user_id) as any;const warning=response?.response==='AVAILABLE'?null:response?.response==='UNAVAILABLE'?'Volunteer marked unavailable.':'Volunteer has not responded.';audit(req.user!.id,'VOLUNTEER_ASSIGNED','event',event.id,{user_id:d.user_id,warning});res.json({data:{...getDb().prepare('SELECT * FROM event_assignments WHERE event_id=? AND user_id=?').get(event.id,d.user_id) as any,warning}});
  });
  router.delete('/events/:id/assignments/:userId', requireAuth,requireAdmin,(req,res)=>{getDb().transaction(()=>{existing('events',String(req.params.id));if(getDb().prepare('SELECT 1 FROM tasks WHERE event_id=? AND assignee_id=? AND status IN(\'ASSIGNED\',\'IN_PROGRESS\')').get(req.params.id,req.params.userId)) throw apiError(409,'OPEN_TASKS','Reassign or cancel this volunteer’s open event tasks before removing the assignment.');if(!getDb().prepare('DELETE FROM event_assignments WHERE event_id=? AND user_id=?').run(req.params.id,req.params.userId).changes) throw apiError(404,'NOT_FOUND','Assignment not found.');audit(req.user!.id,'ASSIGNMENT_REMOVED','event',String(req.params.id),{user_id:req.params.userId});}).immediate();res.json({data:{removed:true}});});
  router.post('/events/:id/tickets', requireAuth,requireAdmin,(req,res)=>{
    const d=validate(z.object({member_id:z.string().nullable().optional(),buyer_name:z.string().trim().min(2).max(120),buyer_email:z.union([z.email(),z.literal('')]).default(''),method:methodSchema,reference:z.string().max(200).default('')}).strict(),req.body);
    const result=withIdempotency(req,'tickets.sale',()=>{
      const event=existing('events',String(req.params.id));if(event.status!=='PUBLISHED') throw apiError(409,'EVENT_NOT_SELLABLE','Ticket sales require a published event.');
      const member=d.member_id?existing('member_records',d.member_id):null;if(member?.archived) throw apiError(409,'ARCHIVED_MEMBER','Select an unarchived member.');
      const price=member&&memberIsActive(member.id)?event.member_price_paise:event.nonmember_price_paise;
      const capacity=getDb().prepare('UPDATE events SET seats_sold=seats_sold+1 WHERE id=? AND seats_sold<capacity AND status=\'PUBLISHED\'').run(event.id);if(!capacity.changes) throw apiError(409,'SOLD_OUT','No seats remain.');
      const ticketId=id(),code=`SKY-${id().slice(0,8).toUpperCase()}`;getDb().prepare('INSERT INTO tickets(id,event_id,member_id,owner_user_id,buyer_name,buyer_email,code,price_paise,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(ticketId,event.id,member?.id||null,member?.user_id||null,d.buyer_name,d.buyer_email,code,price,now());
      const paymentId=settlement(req,'ticket',ticketId,price,event.type==='FUNDRAISER'?'fundraiser':'tickets',`Ticket · ${event.title}`,event.id,d.method,d.reference);getDb().prepare('UPDATE tickets SET payment_id=? WHERE id=?').run(paymentId,ticketId);audit(req.user!.id,'TICKET_SOLD','ticket',ticketId);return getDb().prepare('SELECT * FROM tickets WHERE id=?').get(ticketId);
    });res.status(201).json({data:result});
  });
  router.post('/events/:id/check-in', requireAuth,(req,res)=>{
    const d=validate(z.object({code:z.string().trim().min(1).max(100)}).strict(),req.body),eventId=String(req.params.id);
    if(!adminView(req)&&!getDb().prepare('SELECT 1 FROM event_assignments WHERE event_id=? AND user_id=? AND can_check_in=1').get(eventId,req.user!.id)) throw apiError(403,'FORBIDDEN','Check-in permission is required for this event.');
    const result=getDb().transaction(()=>{
      const event=existing('events',eventId);if(event.status==='CANCELLED') throw apiError(409,'CANCELLED_EVENT','This event is cancelled.');
      const ticket=getDb().prepare('SELECT * FROM tickets WHERE code=? AND event_id=?').get(d.code,eventId) as any;if(!ticket) throw apiError(404,'INVALID_TICKET','Ticket is not valid for this event.');
      if(ticket.status!=='VALID') throw apiError(409,ticket.status==='USED'?'ALREADY_CHECKED_IN':'CANCELLED_TICKET',ticket.status==='USED'?'Ticket was already checked in.':'Ticket is cancelled.');
      const timestamp=now(),update=getDb().prepare('UPDATE tickets SET status=\'USED\',checked_in_at=?,checked_in_by=? WHERE id=? AND status=\'VALID\'').run(timestamp,req.user!.id,ticket.id);if(!update.changes) throw apiError(409,'ALREADY_CHECKED_IN','Ticket was already checked in.');audit(req.user!.id,'TICKET_CHECKED_IN','ticket',ticket.id);return {id:ticket.id,buyer_name:ticket.buyer_name,code:ticket.code,status:'USED',checked_in_at:timestamp};
    }).immediate();res.json({data:result});
  });
  router.get('/tasks', requireAuth,(req,res)=>{
    const clauses:string[]=[],args:any[]=[],admin=adminView(req);if(!admin){clauses.push('t.assignee_id=?');args.push(req.user!.id);}for(const key of ['event_id','assignee_id','status']) if(req.query[key]) {if(!admin&&key==='assignee_id'&&req.query[key]!==req.user!.id) throw apiError(403,'FORBIDDEN','Only your own tasks are available.');clauses.push(`t.${key}=?`);args.push(validate(z.string().min(1).max(100),req.query[key]));}
    res.json({data:getDb().prepare('SELECT t.*,e.title AS event_name,u.name AS assignee_name FROM tasks t LEFT JOIN events e ON e.id=t.event_id JOIN users u ON u.id=t.assignee_id'+(clauses.length?' WHERE '+clauses.join(' AND '):'')+' ORDER BY t.due_at IS NULL,t.due_at,t.created_at DESC').all(...args)});
  });
  router.get('/tasks/:id', requireAuth,(req,res)=>{
    const row=getDb().prepare('SELECT t.*,e.title event_name,u.name assignee_name FROM tasks t LEFT JOIN events e ON e.id=t.event_id JOIN users u ON u.id=t.assignee_id WHERE t.id=?').get(req.params.id) as any;
    if(!row||(!adminView(req)&&row.assignee_id!==req.user!.id)) throw apiError(404,'NOT_FOUND','Task not found.');
    res.json({data:row});
  });
  router.post('/tasks', requireAuth,requireAdmin,(req,res)=>{
    const d=validate(taskSchema,req.body);activeVolunteer(d.assignee_id);if(d.event_id){const event=existing('events',d.event_id);if(event.status==='CANCELLED'&&['ASSIGNED','IN_PROGRESS'].includes(d.status)) throw apiError(409,'CANCELLED_EVENT','Open tasks cannot be assigned to a cancelled event.');}const taskId=id();getDb().prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(taskId,d.title,d.instructions,d.assignee_id,d.event_id||null,d.due_at||null,d.budget_paise,d.status,req.user!.id,now(),now());audit(req.user!.id,'TASK_CREATED','task',taskId);res.status(201).json({data:existing('tasks',taskId)});
  });
  router.patch('/tasks/:id', requireAuth,(req,res)=>{
    const row=existing('tasks',String(req.params.id)),admin=adminView(req);if(!admin&&row.assignee_id!==req.user!.id) throw apiError(404,'NOT_FOUND','Task not found.');
    const d=admin?validatePatch(taskSchema.partial(),req.body):validate(z.object({status:z.enum(['IN_PROGRESS','COMPLETED'])}).strict(),req.body);
    if(!admin&&!(row.status==='ASSIGNED'&&d.status==='IN_PROGRESS'||row.status==='IN_PROGRESS'&&d.status==='COMPLETED')) throw apiError(409,'INVALID_TRANSITION','Start an assigned task, then mark it completed.');
    const next={...row,...d};if(next.assignee_id!==row.assignee_id) activeVolunteer(next.assignee_id);if(next.event_id) {const event=existing('events',next.event_id);if(event.status==='CANCELLED'&&['ASSIGNED','IN_PROGRESS'].includes(next.status)) throw apiError(409,'CANCELLED_EVENT','Open tasks cannot be assigned to a cancelled event.');}getDb().prepare('UPDATE tasks SET title=?,instructions=?,assignee_id=?,event_id=?,due_at=?,budget_paise=?,status=?,updated_at=? WHERE id=?').run(next.title,next.instructions,next.assignee_id,next.event_id||null,next.due_at||null,next.budget_paise,next.status,now(),row.id);audit(req.user!.id,'TASK_UPDATED','task',row.id,{status:next.status});res.json({data:existing('tasks',row.id)});
  });
  router.get('/settings', requireAuth,(req,res)=>{const cfg=settings();res.json({data:req.user!.roles.includes('admin')?cfg:{organization_name:cfg.organization_name,timezone:cfg.timezone}});});
  router.patch('/settings', requireAuth,requireAdmin,(req,res)=>{
    const d=validate(z.object({organization_name:z.string().trim().min(2).max(120).optional(),timezone:z.string().refine(v=>IANAZone.isValidZone(v),'Use an IANA timezone').optional(),membership_year_end:z.string().regex(/^\d{2}-\d{2}$/).refine(v=>DateTime.fromISO(`2025-${v}`).isValid,'Use a valid month and day (excluding February 29)').optional(),dues_paise:moneySchema.refine(v=>v>0).optional()}).strict(),req.body),cfg={...settings(),...d};getDb().transaction(()=>{getDb().prepare('UPDATE organization_settings SET organization_name=?,timezone=?,membership_year_end=?,dues_paise=?,updated_at=? WHERE id=1').run(cfg.organization_name,cfg.timezone,cfg.membership_year_end,cfg.dues_paise,now());audit(req.user!.id,'SETTINGS_UPDATED','settings','1',d);})();res.json({data:settings()});
  });
  return router;
}
