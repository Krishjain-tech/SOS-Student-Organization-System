import { Router, type Request } from 'express';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { readFileSync, mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { createHash } from 'node:crypto';
import { getDb } from '../db/index.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { id, now, audit, apiError, validate, validatePatch, asyncRoute, withIdempotency } from '../utils.js';
import { assertEditableClaim, claimView, csvCell, financeSummary, payClaim, postPayment, periodRange, localDate, settlementKind, organizationTimezone } from '../services/operations.js';

const money = z.number().int().positive().max(100_000_000);
const key = z.string().min(1).max(100);
const claimSchema = z.object({ description: z.string().trim().min(3).max(500), category: z.string().trim().min(1).max(60), amount_paise: money, event_id: key.nullable().optional(), task_id: key.nullable().optional() }).strict();
const settlement = z.object({ method: z.enum(['cash', 'upi', 'card', 'bank']), reference: z.string().trim().max(120).default('') }).strict();
const upload = multer({ storage: multer.memoryStorage(), preservePath: true, limits: { fileSize: 5 * 1024 * 1024, files: 5, fields: 0, parts: 5 } }).array('files', 5);
const uploadDir = () => resolve(process.env.UPLOAD_DIR || './data/receipts');

function actor(req: Request) { return req.user!.id; }
function isAdmin(req: Request) {
  if (req.query.mine === 'true' && !req.user!.roles.includes('volunteer')) throw apiError(403, 'FORBIDDEN', 'Volunteer permission is required.');
  return req.user!.roles.includes('admin') && req.query.mine !== 'true';
}
function ownClaim(req: Request, claimId: string) {
  const claim = getDb().prepare('SELECT c.*,u.name user_name,e.title event_name FROM expense_claims c JOIN users u ON u.id=c.user_id LEFT JOIN events e ON e.id=c.event_id WHERE c.id=?').get(claimId) as any;
  if (!claim || (!isAdmin(req) && claim.user_id !== actor(req))) throw apiError(404, 'NOT_FOUND', 'Claim not found.');
  return claim;
}
function validLinks(req: Request, data: any) {
  const db = getDb();
  if (data.task_id) {
    const task = db.prepare('SELECT * FROM tasks WHERE id=? AND assignee_id=?').get(data.task_id, actor(req)) as any;
    if (!task) throw apiError(422, 'INVALID_TASK', 'Select one of your assigned tasks.', { task_id: ['Task is not assigned to you.'] });
    if (data.event_id && task.event_id && data.event_id !== task.event_id) throw apiError(422, 'EVENT_MISMATCH', 'The event must match the selected task.', { event_id: ['Choose the event linked to this task.'] });
    if (task.event_id && !data.event_id) data.event_id = task.event_id;
  }
  if (data.event_id && !db.prepare('SELECT 1 FROM events WHERE id=?').get(data.event_id)) throw apiError(422, 'INVALID_EVENT', 'Select an existing event.', { event_id: ['Event not found.'] });
  if (data.event_id && !isAdmin(req) && !db.prepare('SELECT 1 FROM event_assignments WHERE event_id=? AND user_id=?').get(data.event_id, actor(req)) && !db.prepare('SELECT 1 FROM tasks WHERE event_id=? AND assignee_id=?').get(data.event_id, actor(req))) throw apiError(422, 'INVALID_EVENT', 'Select an event assigned to you.');
}
function reportingEvent(req: Request): string | null {
  if (!req.query.event_id) return null;
  const eventId = validate(key, req.query.event_id);
  if (!getDb().prepare('SELECT 1 FROM events WHERE id=?').get(eventId)) throw apiError(404, 'NOT_FOUND', 'Event not found.');
  return eventId;
}

export function createOperationsRouter() {
  const router = Router();
  router.get('/claims', requireAuth, (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const rows = getDb().prepare(`SELECT c.*,u.name user_name,e.title event_name FROM expense_claims c JOIN users u ON u.id=c.user_id LEFT JOIN events e ON e.id=c.event_id WHERE (?=1 OR c.user_id=?) AND (?='' OR c.status=?) ORDER BY c.created_at DESC`).all(isAdmin(req) ? 1 : 0, actor(req), status, status);
    res.json({ data: rows.map(claimView) });
  });
  router.get('/claims/:id', requireAuth, (req, res) => res.json({ data: claimView(ownClaim(req, req.params.id as string)) }));
  router.post('/claims', requireAuth, (req, res) => {
    const data = validate(claimSchema, req.body); validLinks(req, data);
    const claimId = id();
    getDb().prepare("INSERT INTO expense_claims(id,user_id,event_id,task_id,description,category,amount_paise,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'DRAFT',?,?)").run(claimId, actor(req), data.event_id || null, data.task_id || null, data.description, data.category, data.amount_paise, now(), now());
    audit(actor(req), 'claim.create', 'expense_claim', claimId, {});
    res.status(201).json({ data: claimView(ownClaim(req, claimId)) });
  });
  router.patch('/claims/:id', requireAuth, (req, res) => {
    const claim = ownClaim(req, req.params.id as string);
    if (claim.user_id !== actor(req)) throw apiError(403, 'FORBIDDEN', 'Only the claimant may edit this claim.');
    assertEditableClaim(claim);
    const data = validate(claimSchema, req.body); validLinks(req, data);
    const updated = getDb().prepare("UPDATE expense_claims SET event_id=?,task_id=?,description=?,category=?,amount_paise=?,updated_at=? WHERE id=? AND user_id=? AND status IN ('DRAFT','CHANGES_REQUESTED')").run(data.event_id || null, data.task_id || null, data.description, data.category, data.amount_paise, now(), claim.id, actor(req));
    if (updated.changes !== 1) throw apiError(409, 'CLAIM_IMMUTABLE', 'The claim is no longer editable.');
    audit(actor(req), 'claim.edit', 'expense_claim', claim.id, {});
    res.json({ data: claimView(ownClaim(req, claim.id)) });
  });
  router.post('/claims/:id/submit', requireAuth, (req, res) => {
    const claim = ownClaim(req, req.params.id as string);
    if (claim.user_id !== actor(req)) throw apiError(403, 'FORBIDDEN', 'Only the claimant may submit this claim.');
    assertEditableClaim(claim);
    if (!(getDb().prepare('SELECT COUNT(*) count FROM receipt_files WHERE claim_id=?').get(claim.id) as any).count) throw apiError(422, 'RECEIPT_REQUIRED', 'Attach at least one receipt before submitting.');
    validLinks(req, claim);
    if (getDb().prepare("UPDATE expense_claims SET status='SUBMITTED',submitted_at=?,updated_at=? WHERE id=? AND user_id=? AND status IN ('DRAFT','CHANGES_REQUESTED')").run(now(), now(), claim.id, actor(req)).changes !== 1) throw apiError(409, 'INVALID_TRANSITION', 'The claim is no longer editable.');
    audit(actor(req), 'claim.submit', 'expense_claim', claim.id, {});
    res.json({ data: claimView(ownClaim(req, claim.id)) });
  });
  router.post('/claims/:id/review', requireAuth, requireAdmin, (req, res) => {
    const data = validate(z.object({ action: z.enum(['approve', 'reject', 'request_changes']), note: z.string().trim().max(1000).default('') }).strict(), req.body);
    if (data.action !== 'approve' && data.note.length < 3) throw apiError(422, 'NOTE_REQUIRED', 'Explain the requested correction or rejection.', { note: ['Enter a review note.'] });
    const claim = ownClaim(req, req.params.id as string);
    const target = { approve: 'APPROVED_UNPAID', reject: 'REJECTED', request_changes: 'CHANGES_REQUESTED' }[data.action];
    const result = getDb().prepare("UPDATE expense_claims SET status=?,review_note=?,approved_at=?,updated_at=? WHERE id=? AND status='SUBMITTED'").run(target, data.note, data.action === 'approve' ? now() : null, now(), claim.id);
    if (result.changes !== 1) throw apiError(409, 'INVALID_TRANSITION', 'Only submitted claims may be reviewed.');
    audit(actor(req), `claim.${data.action}`, 'expense_claim', claim.id, { note: data.note });
    res.json({ data: claimView(ownClaim(req, claim.id)) });
  });
  router.post('/claims/:id/pay', requireAuth, requireAdmin, (req, res) => {
    const data = validate(settlement, req.body);
    const result = withIdempotency(req, 'claims.pay', () => payClaim(actor(req), req.params.id as string, data.method, data.reference));
    res.json({ data: result });
  });
  router.post('/claims/:id/receipts', requireAuth, (req, _res, next) => {
    const claim = ownClaim(req, req.params.id as string);
    if (claim.user_id !== actor(req)) throw apiError(403, 'FORBIDDEN', 'Only the claimant may change attachments.');
    assertEditableClaim(claim);
    next();
  }, (req, res, next) => upload(req, res, error => error ? next(apiError(422, 'UPLOAD_LIMIT', 'Upload at most five JPEG, PNG or PDF files of 5 MB each.')) : next()), asyncRoute(async (req, res) => {
    const claim = ownClaim(req, req.params.id as string); assertEditableClaim(claim);
    const files = req.files as Express.Multer.File[];
    if (!files?.length) throw apiError(422, 'FILES_REQUIRED', 'Select one or more receipt files.');
    const existing = (getDb().prepare('SELECT COUNT(*) count FROM receipt_files WHERE claim_id=?').get(claim.id) as any).count;
    if (existing + files.length > 5) throw apiError(422, 'TOO_MANY_RECEIPTS', 'A claim can contain at most five receipt files.');
    const validated: Array<{ file: Express.Multer.File; type: { mime: string; ext: string }; receiptId: string; storedName: string }> = [];
    for (const file of files) {
      if (file.originalname.includes('..') || /[\\/\x00-\x1f]/.test(file.originalname)) throw apiError(422, 'INVALID_FILENAME', 'Receipt filenames must not contain paths.');
      const type = await fileTypeFromBuffer(file.buffer);
      if (!type || !['image/png', 'image/jpeg', 'application/pdf'].includes(type.mime) || (type.mime === 'application/pdf' && !file.buffer.subarray(-1024).toString('latin1').includes('%%EOF'))) throw apiError(422, 'UNSUPPORTED_RECEIPT', 'Only valid JPEG, PNG and PDF receipts are accepted.');
      if (file.mimetype !== type.mime) throw apiError(422, 'MIME_MISMATCH', 'The file content does not match its declared MIME type.');
      validated.push({ file, type, receiptId: id(), storedName: `${id()}.${type.ext}` });
    }
    mkdirSync(uploadDir(), { recursive: true });
    const written: string[] = [];
    try {
      getDb().transaction(() => {
        assertEditableClaim(ownClaim(req, claim.id));
        for (const item of validated) {
          const count = (getDb().prepare('SELECT COUNT(*) count FROM receipt_files WHERE claim_id=?').get(claim.id) as any).count;
          if (count >= 5) throw apiError(422, 'TOO_MANY_RECEIPTS', 'A claim can contain at most five receipt files.');
          const path = resolve(uploadDir(), item.storedName); writeFileSync(path, item.file.buffer, { flag: 'wx' }); written.push(path);
          getDb().prepare('INSERT INTO receipt_files(id,claim_id,stored_name,original_name,mime_type,size_bytes,created_at) VALUES(?,?,?,?,?,?,?)').run(item.receiptId, claim.id, item.storedName, item.file.originalname, item.type.mime, item.file.size, now());
        }
        audit(actor(req), 'claim.receipts.attach', 'expense_claim', claim.id, { count: validated.length });
      }).immediate();
    } catch (error) { for (const path of written) if (existsSync(path)) unlinkSync(path); throw error; }
    res.status(201).json({ data: claimView(ownClaim(req, claim.id)) });
  }));
  router.get('/receipts/:id', requireAuth, (req, res) => {
    const receipt = getDb().prepare('SELECT * FROM receipt_files WHERE id=?').get(req.params.id) as any;
    if (!receipt) throw apiError(404, 'NOT_FOUND', 'Receipt not found.');
    ownClaim(req, receipt.claim_id);
    if (basename(receipt.stored_name) !== receipt.stored_name) throw apiError(404, 'NOT_FOUND', 'Receipt not found.');
    const path = resolve(uploadDir(), receipt.stored_name);
    if (!existsSync(path)) throw apiError(404, 'NOT_FOUND', 'Receipt file not found.');
    res.set({ 'Content-Type': receipt.mime_type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Disposition': `inline; filename="receipt.${receipt.mime_type === 'application/pdf' ? 'pdf' : receipt.mime_type === 'image/png' ? 'png' : 'jpg'}"` });
    res.send(readFileSync(path));
  });
  router.delete('/receipts/:id', requireAuth, (req, res) => {
    const receipt = getDb().prepare('SELECT * FROM receipt_files WHERE id=?').get(req.params.id) as any;
    if (!receipt) throw apiError(404, 'NOT_FOUND', 'Receipt not found.');
    const claim = ownClaim(req, receipt.claim_id);
    if (claim.user_id !== actor(req)) throw apiError(403, 'FORBIDDEN', 'Only the claimant may change attachments.');
    assertEditableClaim(claim);
    getDb().transaction(() => { assertEditableClaim(ownClaim(req, receipt.claim_id)); getDb().prepare('DELETE FROM receipt_files WHERE id=?').run(receipt.id); audit(actor(req), 'claim.receipt.delete', 'receipt', receipt.id, { claim_id: claim.id }); }).immediate();
    if (basename(receipt.stored_name) === receipt.stored_name && existsSync(resolve(uploadDir(), receipt.stored_name))) unlinkSync(resolve(uploadDir(), receipt.stored_name));
    res.json({ data: { deleted: true } });
  });

  router.get('/products', requireAuth, requireAdmin, (_req, res) => {
    const db = getDb(); res.json({ data: (db.prepare('SELECT * FROM products ORDER BY name').all() as any[]).map(product => ({ ...product, variants: db.prepare('SELECT * FROM product_variants WHERE product_id=? ORDER BY size').all(product.id) })) });
  });
  const variantSchema = z.object({ size: z.enum(['S', 'M', 'L', 'XL']), stock: z.number().int().min(0).max(100000).default(0) }).strict();
  const price = z.number().int().min(0).max(100_000_000);
  const productSchema = z.object({ name: z.string().trim().min(2).max(100), description: z.string().trim().max(1000).default(''), price_paise: price, member_price_paise: price, active: z.boolean().default(true), variants: z.array(variantSchema).min(1).max(4).optional() }).strict();
  router.post('/products', requireAuth, requireAdmin, (req, res) => {
    const data = validate(productSchema, req.body); const productId = id();
    if (!data.variants?.length || new Set(data.variants.map((v: any) => v.size)).size !== data.variants.length) throw apiError(422, 'VARIANTS_REQUIRED', 'Provide distinct sizes with opening stock.');
    if (data.member_price_paise > data.price_paise) throw apiError(422, 'INVALID_MEMBER_PRICE', 'Member price cannot exceed standard price.');
    getDb().transaction(() => {
      getDb().prepare('INSERT INTO products(id,name,description,active,price_paise,member_price_paise,created_at) VALUES(?,?,?,?,?,?,?)').run(productId, data.name, data.description, data.active ? 1 : 0, data.price_paise, data.member_price_paise, now());
      for (const variant of data.variants!) { const variantId = id(); getDb().prepare('INSERT INTO product_variants(id,product_id,size,stock) VALUES(?,?,?,?)').run(variantId, productId, variant.size, variant.stock); if (variant.stock > 0) getDb().prepare('INSERT INTO stock_movements(id,variant_id,quantity,reason,actor_id,created_at) VALUES(?,?,?,?,?,?)').run(id(), variantId, variant.stock, 'Opening stock', actor(req), now()); }
      audit(actor(req), 'product.create', 'product', productId, {});
    }).immediate();
    res.status(201).json({ data: getDb().prepare('SELECT * FROM products WHERE id=?').get(productId) });
  });
  router.patch('/products/:id', requireAuth, requireAdmin, (req, res) => {
    const change = validatePatch(productSchema.omit({ variants: true }).partial(), req.body);
    const product = getDb().prepare('SELECT * FROM products WHERE id=?').get(req.params.id) as any;
    if (!product) throw apiError(404, 'NOT_FOUND', 'Product not found.');
    const data = { ...product, ...change };
    if (data.member_price_paise > data.price_paise) throw apiError(422, 'INVALID_MEMBER_PRICE', 'Member price cannot exceed standard price.');
    const result = getDb().prepare('UPDATE products SET name=?,description=?,price_paise=?,member_price_paise=?,active=? WHERE id=?').run(data.name, data.description, data.price_paise, data.member_price_paise, data.active ? 1 : 0, req.params.id);
    if (!result.changes) throw apiError(404, 'NOT_FOUND', 'Product not found.'); audit(actor(req), 'product.update', 'product', req.params.id as string, {});
    res.json({ data: getDb().prepare('SELECT * FROM products WHERE id=?').get(req.params.id) });
  });
  router.get('/variants', requireAuth, requireAdmin, (req, res) => {
    const productId = req.query.product_id ? validate(key, req.query.product_id) : null;
    res.json({ data: getDb().prepare('SELECT v.*,p.name product_name,p.active,p.price_paise,p.member_price_paise FROM product_variants v JOIN products p ON p.id=v.product_id WHERE (? IS NULL OR v.product_id=?) ORDER BY p.name,CASE v.size WHEN \'S\' THEN 1 WHEN \'M\' THEN 2 WHEN \'L\' THEN 3 ELSE 4 END').all(productId, productId) });
  });
  router.post('/products/:id/variants', requireAuth, requireAdmin, (req, res) => {
    const data = validate(variantSchema, req.body);
    const result = withIdempotency(req, 'variants.create', () => {
      if (!getDb().prepare('SELECT 1 FROM products WHERE id=?').get(req.params.id)) throw apiError(404, 'NOT_FOUND', 'Product not found.');
      if (getDb().prepare('SELECT 1 FROM product_variants WHERE product_id=? AND size=?').get(req.params.id, data.size)) throw apiError(409, 'DUPLICATE_SIZE', 'This product already has that size.');
      const variantId = id();
      getDb().prepare('INSERT INTO product_variants(id,product_id,size,stock) VALUES(?,?,?,?)').run(variantId, req.params.id, data.size, data.stock);
      if (data.stock > 0) getDb().prepare('INSERT INTO stock_movements(id,variant_id,quantity,reason,actor_id,created_at) VALUES(?,?,?,?,?,?)').run(id(), variantId, data.stock, 'Opening stock for new size', actor(req), now());
      audit(actor(req), 'variant.create', 'variant', variantId, data);
      return getDb().prepare('SELECT * FROM product_variants WHERE id=?').get(variantId);
    });
    res.status(201).json({ data: result });
  });
  router.post('/stock-adjustments', requireAuth, requireAdmin, (req, res) => {
    const data = validate(z.object({ variant_id: key, quantity: z.number().int().min(-100000).max(100000).refine(v => v !== 0), reason: z.string().trim().min(3).max(500) }).strict(), req.body);
    const result = withIdempotency(req, 'stock.adjust', () => {
      const changed = getDb().prepare('UPDATE product_variants SET stock=stock+? WHERE id=? AND stock+?>=0').run(data.quantity, data.variant_id, data.quantity);
      if (changed.changes !== 1) throw apiError(409, 'INSUFFICIENT_STOCK', 'The adjustment would create negative stock or the variant does not exist.');
      getDb().prepare('INSERT INTO stock_movements(id,variant_id,quantity,reason,actor_id,created_at) VALUES(?,?,?,?,?,?)').run(id(), data.variant_id, data.quantity, data.reason, actor(req), now()); audit(actor(req), 'stock.adjust', 'variant', data.variant_id, data);
      return getDb().prepare('SELECT * FROM product_variants WHERE id=?').get(data.variant_id);
    }); res.json({ data: result });
  });
  router.get('/stock-adjustments', requireAuth, requireAdmin, (_req, res) => res.json({ data: getDb().prepare('SELECT s.*,p.name product_name,v.size FROM stock_movements s JOIN product_variants v ON v.id=s.variant_id JOIN products p ON p.id=v.product_id ORDER BY s.created_at DESC').all() }));
  router.get('/orders', requireAuth, requireAdmin, (_req, res) => res.json({ data: (getDb().prepare('SELECT * FROM orders ORDER BY created_at DESC').all() as any[]).map(order => ({ ...order, items: getDb().prepare('SELECT i.*,p.name product_name,v.size FROM order_items i JOIN product_variants v ON v.id=i.variant_id JOIN products p ON p.id=v.product_id WHERE i.order_id=?').all(order.id) })) }));
  router.post('/orders', requireAuth, requireAdmin, (req, res) => {
    const data = validate(z.object({ member_id: key.nullable().optional(), buyer_name: z.string().trim().min(2).max(100), items: z.array(z.object({ variant_id: key, quantity: z.number().int().positive().max(100) }).strict()).min(1).max(20), method: settlement.shape.method, reference: settlement.shape.reference }).strict(), req.body);
    const result = withIdempotency(req, 'orders.create', () => getDb().transaction(() => {
      const db = getDb(); const orderId = id();
      if (new Set(data.items.map((i: any) => i.variant_id)).size !== data.items.length) throw apiError(422, 'DUPLICATE_VARIANT', 'Combine quantities for each size into one order line.');
      if (data.member_id && !db.prepare('SELECT 1 FROM member_records WHERE id=? AND archived=0').get(data.member_id)) throw apiError(422, 'INVALID_MEMBER', 'Select an existing member record.');
      const today = localDate();
      const memberBenefit = data.member_id && db.prepare("SELECT 1 FROM membership_terms WHERE member_id=? AND starts_on<=? AND ends_on>=? AND status='PAID'").get(data.member_id, today, today);
      const lines = data.items.map((item: any) => { const variant = db.prepare('SELECT v.*,p.price_paise,p.member_price_paise,p.active FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=?').get(item.variant_id) as any; if (!variant || !variant.active) throw apiError(422, 'INVALID_VARIANT', 'Select an active product variant.'); return { ...item, unit_price_paise: memberBenefit ? variant.member_price_paise : variant.price_paise }; });
      const total = lines.reduce((sum: number, line: any) => sum + line.unit_price_paise * line.quantity, 0);
      db.prepare('INSERT INTO orders(id,member_id,buyer_name,total_paise,collected,created_at) VALUES(?,?,?,?,0,?)').run(orderId, data.member_id || null, data.buyer_name, total, now());
      for (const line of lines) {
        if (db.prepare('UPDATE product_variants SET stock=stock-? WHERE id=? AND stock>=?').run(line.quantity, line.variant_id, line.quantity).changes !== 1) throw apiError(409, 'INSUFFICIENT_STOCK', 'There is insufficient stock for this order.');
        db.prepare('INSERT INTO order_items(id,order_id,variant_id,quantity,unit_price_paise) VALUES(?,?,?,?,?)').run(id(), orderId, line.variant_id, line.quantity, line.unit_price_paise);
        db.prepare('INSERT INTO stock_movements(id,variant_id,quantity,reason,order_id,actor_id,created_at) VALUES(?,?,?,?,?,?,?)').run(id(), line.variant_id, -line.quantity, 'Manual counter sale', orderId, actor(req), now());
      }
      const paymentId = postPayment(actor(req), 'order', orderId, total, data.method, data.reference, 'merchandise', `Counter sale to ${data.buyer_name}`, 'IN'); db.prepare('UPDATE orders SET payment_id=? WHERE id=?').run(paymentId, orderId); audit(actor(req), 'order.create', 'order', orderId, {});
      return db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
    }).immediate()); res.status(201).json({ data: result });
  });
  router.patch('/orders/:id', requireAuth, requireAdmin, (req, res) => {
    const data = validate(z.object({ collected: z.boolean() }).strict(), req.body); if (!getDb().prepare('UPDATE orders SET collected=? WHERE id=?').run(data.collected ? 1 : 0, req.params.id).changes) throw apiError(404, 'NOT_FOUND', 'Order not found.'); audit(actor(req), 'order.collection', 'order', req.params.id as string, data); res.json({ data: getDb().prepare('SELECT * FROM orders WHERE id=?').get(req.params.id) });
  });

  router.get('/finance/summary', requireAuth, requireAdmin, (req, res) => res.json({ data: financeSummary(String(req.query.period || 'all'), reportingEvent(req)) }));
  router.get('/finance/events/:id', requireAuth, requireAdmin, (req, res) => {
    const event = getDb().prepare('SELECT * FROM events WHERE id=?').get(req.params.id) as any;
    if (!event) throw apiError(404, 'NOT_FOUND', 'Event not found.');
    res.json({ data: { event, ...financeSummary(String(req.query.period || 'all'), event.id), tickets_sold: event.seats_sold, checked_in: (getDb().prepare('SELECT COUNT(*) n FROM tickets WHERE event_id=? AND checked_in_at IS NOT NULL').get(event.id) as any).n, unresolved_refunds: (getDb().prepare("SELECT COUNT(*) n FROM tickets WHERE event_id=? AND refund_status='UNRESOLVED'").get(event.id) as any).n } });
  });
  router.get('/finance/transactions', requireAuth, requireAdmin, (req, res) => {
    const { start, end } = periodRange(String(req.query.period || 'all'));
    const eventId = reportingEvent(req);
    res.json({ data: getDb().prepare('SELECT l.*,p.method,p.reference,p.settlement_kind,p.source_type,(SELECT r.id FROM ledger_entries r WHERE r.reversal_of=l.id) reversed_by FROM ledger_entries l LEFT JOIN payments p ON p.id=l.payment_id WHERE l.occurred_at>=? AND l.occurred_at<? AND (? IS NULL OR l.event_id=?) ORDER BY l.occurred_at DESC,l.created_at DESC').all(start, end, eventId, eventId) });
  });
  for (const direction of ['income', 'expense'] as const) router.post(`/finance/${direction}`, requireAuth, requireAdmin, (req, res) => {
    const data = validate(z.object({ amount_paise: money, category: z.string().trim().min(1).max(60), description: z.string().trim().min(3).max(500), event_id: key.nullable().optional(), date: z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString()).optional(), method: settlement.shape.method, reference: settlement.shape.reference }).strict(), req.body);
    if (data.event_id && !getDb().prepare('SELECT 1 FROM events WHERE id=?').get(data.event_id)) throw apiError(422, 'INVALID_EVENT', 'Select an existing event.', { event_id: ['Event not found.'] });
    const result = withIdempotency(req, `finance.${direction}`, () => getDb().transaction(() => {
      const recordId = id(); const timestamp = data.date || now();
      getDb().prepare('INSERT INTO direct_financial_records(id,direction,amount_paise,category,description,event_id,actor_id,occurred_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(recordId, direction === 'income' ? 'IN' : 'OUT', data.amount_paise, data.category, data.description, data.event_id || null, actor(req), timestamp, now());
      const paymentId = postPayment(actor(req), 'direct', recordId, data.amount_paise, data.method, data.reference, data.category, data.description, direction === 'income' ? 'IN' : 'OUT', data.event_id || null, timestamp); audit(actor(req), `finance.${direction}`, 'direct_financial_record', recordId, {}); return { id: recordId, payment_id: paymentId, ...data };
    }).immediate()); res.status(201).json({ data: result });
  });
  router.post('/finance/transactions/:id/reverse', requireAuth, requireAdmin, (req, res) => {
    const data = validate(z.object({ reason: z.string().trim().min(3).max(500) }).strict(), req.body);
    const result = withIdempotency(req, 'finance.reverse', () => getDb().transaction(() => {
      const original = getDb().prepare('SELECT * FROM ledger_entries WHERE id=?').get(req.params.id) as any;
      if (!original) throw apiError(404, 'NOT_FOUND', 'Transaction not found.');
      if (original.reversal_of || getDb().prepare('SELECT 1 FROM ledger_entries WHERE reversal_of=?').get(original.id)) throw apiError(409, 'ALREADY_REVERSED', 'A full reversal can only be recorded once.');
      const source = getDb().prepare('SELECT source_type FROM payments WHERE id=?').get(original.payment_id) as any;
      if (source.source_type !== 'direct') throw apiError(409, 'SOURCE_REVERSAL_DEFERRED', 'Only direct income or expense records support corrections in this phase. Ticket, merchandise, dues and claim refund workflows are deferred.');
      const reversalId = id(); const recordId = id(); const paymentId = id(); const reverseDirection = original.direction === 'IN' ? 'OUT' : 'IN'; const timestamp = now();
      getDb().prepare('INSERT INTO direct_financial_records(id,direction,amount_paise,category,description,event_id,actor_id,occurred_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(recordId, reverseDirection, original.amount_paise, original.category, `Reversal: ${original.description}`, original.event_id, actor(req), timestamp, timestamp);
      getDb().prepare('INSERT INTO payments(id,source_type,source_id,amount_paise,method,reference,settlement_kind,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(paymentId, 'adjustment', recordId, original.amount_paise, 'other', data.reason, settlementKind(), actor(req), timestamp);
      getDb().prepare('INSERT INTO ledger_entries(id,direction,amount_paise,category,description,event_id,payment_id,reversal_of,reason,actor_id,occurred_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(reversalId, reverseDirection, original.amount_paise, original.category, `Reversal: ${original.description}`, original.event_id, paymentId, original.id, data.reason, actor(req), timestamp, timestamp); audit(actor(req), 'finance.reverse', 'ledger_entry', original.id, { reversal_id: reversalId, reason: data.reason }); return getDb().prepare('SELECT * FROM ledger_entries WHERE id=?').get(reversalId);
    }).immediate()); res.json({ data: result });
  });
  router.get('/finance/export.csv', requireAuth, requireAdmin, (req, res) => {
    const { start, end } = periodRange(String(req.query.period || 'all'));
    const eventId = reportingEvent(req);
    const columns = ['id', 'occurred_at', 'direction', 'category', 'description', 'amount_paise', 'reference', 'settlement_kind'];
    const rows = getDb().prepare('SELECT l.*,p.reference,p.settlement_kind FROM ledger_entries l LEFT JOIN payments p ON p.id=l.payment_id WHERE l.occurred_at>=? AND l.occurred_at<? AND (? IS NULL OR l.event_id=?) ORDER BY l.occurred_at').all(start, end, eventId, eventId) as any[];
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="skyline-transactions.csv"', 'X-Content-Type-Options': 'nosniff' }).send([columns.join(','), ...rows.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\r\n'));
  });

  const announcementSchema = z.object({ title: z.string().trim().min(3).max(160), body: z.string().trim().min(3).max(5000), audience: z.enum(['volunteers', 'all']) }).strict();
  router.get('/announcements', requireAuth, (req, res) => res.json({ data: getDb().prepare(`SELECT a.* FROM announcements a WHERE (?=1 OR (a.status='PUBLISHED' AND (a.audience='volunteers' OR EXISTS(SELECT 1 FROM member_records m WHERE m.user_id=? AND m.archived=0)))) ORDER BY a.created_at DESC`).all(isAdmin(req) ? 1 : 0, actor(req)) }));
  router.post('/announcements', requireAuth, requireAdmin, (req, res) => { const data = validate(announcementSchema, req.body); const announcementId = id(); getDb().prepare("INSERT INTO announcements(id,title,body,audience,status,created_at,actor_id) VALUES(?,?,?,?,'DRAFT',?,?)").run(announcementId, data.title, data.body, data.audience, now(), actor(req)); audit(actor(req), 'announcement.create', 'announcement', announcementId, { audience: data.audience }); res.status(201).json({ data: getDb().prepare('SELECT * FROM announcements WHERE id=?').get(announcementId) }); });
  router.patch('/announcements/:id', requireAuth, requireAdmin, (req, res) => { const data = validate(announcementSchema, req.body); if (!getDb().prepare("UPDATE announcements SET title=?,body=?,audience=? WHERE id=? AND status='DRAFT'").run(data.title, data.body, data.audience, req.params.id).changes) throw apiError(409, 'IMMUTABLE_ANNOUNCEMENT', 'Only draft announcements may be edited.'); audit(actor(req), 'announcement.edit', 'announcement', req.params.id as string, { audience: data.audience }); res.json({ data: getDb().prepare('SELECT * FROM announcements WHERE id=?').get(req.params.id) }); });
  router.post('/announcements/:id/publish', requireAuth, requireAdmin, (req, res) => {
    const result = withIdempotency(req, 'announcement.publish', () => {
      const db = getDb(); const announcement = db.prepare('SELECT * FROM announcements WHERE id=?').get(req.params.id) as any;
      if (!announcement) throw apiError(404, 'NOT_FOUND', 'Announcement not found.');
      if (announcement.status !== 'DRAFT') throw apiError(409, 'ALREADY_PUBLISHED', 'Only a draft may be published.');
      db.prepare("UPDATE announcements SET status='PUBLISHED',published_at=? WHERE id=? AND status='DRAFT'").run(now(), announcement.id);
      const volunteers = db.prepare("SELECT DISTINCT u.* FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.active=1 AND r.role='volunteer' AND (?='volunteers' OR EXISTS(SELECT 1 FROM member_records m WHERE m.user_id=u.id AND m.archived=0))").all(announcement.audience) as any[];
      for (const user of volunteers) db.prepare('INSERT OR IGNORE INTO notifications(id,user_id,announcement_id,created_at) VALUES(?,?,?,?)').run(id(), user.id, announcement.id, now());
      const recipients = announcement.audience === 'all' ? db.prepare('SELECT DISTINCT lower(email) email FROM member_records WHERE archived=0').all() as any[] : volunteers;
      let queued = 0;
      for (const recipient of recipients) queued += queueMockEmail(recipient.email, announcement.title, announcement.body, `announcement:${announcement.id}:${recipient.email.toLowerCase()}`);
      const published_at = (db.prepare('SELECT published_at FROM announcements WHERE id=?').get(announcement.id) as any).published_at;
      audit(actor(req), 'announcement.publish', 'announcement', announcement.id, { audience: announcement.audience, queued }); return { ...announcement, status: 'PUBLISHED', published_at, queued_recipients: queued, transport: 'MOCK DELIVERY' };
    }); res.json({ data: result });
  });
  router.post('/announcements/:id/archive', requireAuth, requireAdmin, (req, res) => { if (!getDb().prepare("UPDATE announcements SET status='ARCHIVED' WHERE id=?").run(req.params.id).changes) throw apiError(404, 'NOT_FOUND', 'Announcement not found.'); audit(actor(req), 'announcement.archive', 'announcement', req.params.id as string, {}); res.json({ data: { archived: true } }); });
  router.get('/notifications', requireAuth, (req, res) => res.json({ data: getDb().prepare("SELECT n.*,a.title,a.body,a.published_at FROM notifications n JOIN announcements a ON a.id=n.announcement_id WHERE n.user_id=? AND a.status='PUBLISHED' AND (a.audience='volunteers' OR EXISTS(SELECT 1 FROM member_records m WHERE m.user_id=? AND m.archived=0)) ORDER BY n.created_at DESC").all(actor(req), actor(req)) }));
  router.post('/notifications/:id/read', requireAuth, (req, res) => { if (!getDb().prepare('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?').run(now(), req.params.id, actor(req)).changes) throw apiError(404, 'NOT_FOUND', 'Notification not found.'); res.json({ data: { read: true } }); });
  router.get('/mock-outbox', requireAuth, requireAdmin, (_req, res) => res.json({ data: getDb().prepare('SELECT * FROM mock_email_outbox ORDER BY created_at DESC').all() }));
  router.post('/mock-outbox/:id/retry', requireAuth, requireAdmin, (req, res) => { if (!getDb().prepare("UPDATE mock_email_outbox SET status='QUEUED',simulate_failure=0,error=NULL WHERE id=? AND status='FAILED'").run(req.params.id).changes) throw apiError(409, 'INVALID_RETRY', 'Only failed mock deliveries can be retried.'); audit(actor(req), 'mock-email.retry', 'mock_email', req.params.id as string, {}); res.json({ data: { queued: true, transport: 'MOCK DELIVERY' } }); });
  router.post('/mock-outbox/run', requireAuth, requireAdmin, (req, res) => { const data = validate(z.object({ simulate_failure: z.boolean().optional() }).strict(), req.body); const result = processMockOutbox(data.simulate_failure); audit(actor(req), 'mock-email.run', 'job', 'mock-outbox', result); res.json({ data: result }); });
  router.post('/jobs/reminders', requireAuth, requireAdmin, (req, res) => res.json({ data: runRenewalReminders(actor(req)) }));

  router.get('/admin/dashboard', requireAuth, requireAdmin, (req, res) => {
    const db = getDb(); const period = String(req.query.period || 'all'); const range = periodRange(period);
    const events = db.prepare("SELECT e.*,e.seats_sold tickets_sold,(SELECT COUNT(*) FROM tickets t WHERE t.event_id=e.id AND t.checked_in_at IS NOT NULL) checked_in,(SELECT COUNT(*) FROM tickets t WHERE t.event_id=e.id AND t.refund_status='UNRESOLVED') unresolved_refunds,(SELECT COALESCE(SUM(CASE WHEN l.direction='IN' THEN l.amount_paise ELSE -l.amount_paise END),0) FROM ledger_entries l LEFT JOIN ledger_entries original ON original.id=l.reversal_of WHERE l.event_id=e.id AND l.occurred_at>=? AND l.occurred_at<? AND ((l.direction='IN' AND l.reversal_of IS NULL) OR original.direction='IN')) revenue_paise FROM events e ORDER BY e.start_at DESC").all(range.start, range.end);
    const today = localDate();
    const in30 = DateTime.now().setZone(organizationTimezone()).plus({ days: 30 }).toISODate()!;
    res.json({ data: { ...financeSummary(period), transactions: db.prepare('SELECT l.*,p.method,p.reference,p.settlement_kind FROM ledger_entries l LEFT JOIN payments p ON p.id=l.payment_id WHERE l.occurred_at>=? AND l.occurred_at<? ORDER BY l.occurred_at DESC LIMIT 8').all(range.start, range.end), events, claims: (db.prepare("SELECT c.*,u.name user_name,e.title event_name FROM expense_claims c JOIN users u ON u.id=c.user_id LEFT JOIN events e ON e.id=c.event_id WHERE c.status IN ('SUBMITTED','APPROVED_UNPAID') ORDER BY c.created_at DESC LIMIT 6").all() as any[]).map(claimView), attention: { overdue_tasks: (db.prepare("SELECT COUNT(*) count FROM tasks WHERE status IN ('ASSIGNED','IN_PROGRESS') AND due_at<?").get(now()) as any).count, expiring_members: (db.prepare("SELECT COUNT(DISTINCT t.member_id) count FROM membership_terms t JOIN member_records m ON m.id=t.member_id WHERE m.archived=0 AND t.status='PAID' AND t.starts_on<=? AND t.ends_on>=? AND t.ends_on<=? AND NOT EXISTS(SELECT 1 FROM membership_terms next WHERE next.member_id=m.id AND next.starts_on>t.ends_on AND next.status='PAID')").get(today, today, in30) as any).count, submitted_claims: (db.prepare("SELECT COUNT(*) count FROM expense_claims WHERE status='SUBMITTED'").get() as any).count, unresolved_refunds: (db.prepare("SELECT COUNT(*) count FROM tickets WHERE refund_status='UNRESOLVED'").get() as any).count } } });
  });
  router.get('/volunteer/dashboard', requireAuth, (req, res) => {
    if (!req.user!.roles.includes('volunteer')) throw apiError(403, 'FORBIDDEN', 'Volunteer permission is required.');
    const db = getDb(); const tasks = db.prepare('SELECT t.*,e.title event_name FROM tasks t LEFT JOIN events e ON e.id=t.event_id WHERE t.assignee_id=? ORDER BY t.due_at').all(actor(req)) as any[];
    const claims = db.prepare('SELECT c.*,e.title event_name FROM expense_claims c LEFT JOIN events e ON e.id=c.event_id WHERE c.user_id=? ORDER BY c.created_at DESC').all(actor(req)) as any[];
    const open = tasks.filter(task => ['ASSIGNED', 'IN_PROGRESS'].includes(task.status)); const localDay = (timestamp: string) => localDate(timestamp); const today = localDay(now());
    const submitted = claims.filter(claim => claim.status === 'SUBMITTED').reduce((sum, claim) => sum + claim.amount_paise, 0); const approved = claims.filter(claim => claim.status === 'APPROVED_UNPAID').reduce((sum, claim) => sum + claim.amount_paise, 0);
    const requests = db.prepare('SELECT r.*,e.title event_name,e.start_at,e.location,v.response FROM availability_requests r JOIN events e ON e.id=r.event_id LEFT JOIN volunteer_availability v ON v.event_id=r.event_id AND v.user_id=? WHERE e.status=\'PUBLISHED\' AND e.end_at>=? ORDER BY e.start_at').all(actor(req), now());
    const assignment = db.prepare('SELECT e.id,e.title,e.type,e.description,e.start_at,e.end_at,e.location,e.capacity,e.volunteer_requirement,e.status,a.can_check_in FROM event_assignments a JOIN events e ON e.id=a.event_id WHERE a.user_id=? AND e.end_at>=? AND e.status!=\'CANCELLED\' ORDER BY e.start_at LIMIT 1').get(actor(req), now()) || null;
    res.json({ data: { open_tasks: open.length, due_today: open.filter(task => task.due_at && localDay(task.due_at) === today).length, awaiting_reimbursement_paise: submitted + approved, submitted_paise: submitted, approved_unpaid_paise: approved, tasks, claims: claims.map(claimView), availability_requests: requests, next_assignment: assignment, overdue_tasks: open.filter(task => task.due_at && task.due_at < now()).length } });
  });
  return router;
}

export function queueMockEmail(email: string, subject: string, body: string, dedupe: string, simulateFailure = false) {
  // Recipient previews are fictional even if a future admin enters a real address.
  const address = email.trim().toLowerCase();
  const fictional = address.endsWith('@example.com') || address.endsWith('.example.com') ? address : `recipient-${createHash('sha256').update(address).digest('hex').slice(0, 20)}@example.com`;
  return getDb().prepare("INSERT OR IGNORE INTO mock_email_outbox(id,recipient_email,subject,body,status,attempts,simulate_failure,dedupe_key,created_at) VALUES(?,?,?,?,'QUEUED',0,?,?,?)").run(id(), fictional, subject, body, simulateFailure ? 1 : 0, dedupe, now()).changes;
}

export function processMockOutbox(forceFailure?: boolean) {
  return getDb().transaction(() => {
    const rows = getDb().prepare("SELECT * FROM mock_email_outbox WHERE status='QUEUED' ORDER BY created_at LIMIT 100").all() as any[];
    let delivered = 0; let failed = 0;
    for (const row of rows) { const fail = forceFailure ?? Boolean(row.simulate_failure); if (fail) failed++; else delivered++; getDb().prepare('UPDATE mock_email_outbox SET status=?,attempts=attempts+1,error=?,delivered_at=? WHERE id=? AND status=\'QUEUED\'').run(fail ? 'FAILED' : 'DELIVERED', fail ? 'Simulated mock transport failure; no email was sent.' : null, fail ? null : now(), row.id); }
    return { delivered, failed, transport: 'MOCK DELIVERY', real_email_sent: false };
  }).immediate();
}

export function runRenewalReminders(actorId: string | null = null) {
  const today = localDate(); const until = DateTime.now().setZone(organizationTimezone()).plus({ days: 30 }).toISODate()!;
  return getDb().transaction(() => {
    const members = getDb().prepare("SELECT m.id,m.email,m.name,t.id term_id,t.ends_on FROM member_records m JOIN membership_terms t ON t.member_id=m.id WHERE m.archived=0 AND t.status='PAID' AND t.starts_on<=? AND t.ends_on>=? AND t.ends_on<=? AND NOT EXISTS(SELECT 1 FROM membership_terms next WHERE next.member_id=m.id AND next.starts_on>t.ends_on AND next.status='PAID')").all(today, today, until) as any[];
    let queued = 0; for (const member of members) queued += queueMockEmail(member.email, 'Skyline membership renewal reminder', `FICTIONAL MOCK DELIVERY: Hello ${member.name}, your membership ends on ${member.ends_on}. Contact Skyline leadership to renew.`, `renewal:${member.term_id}:30-days`);
    if (actorId) audit(actorId, 'reminders.run', 'job', 'renewal-reminders', { queued }); return { queued, transport: 'MOCK DELIVERY' };
  }).immediate();
}

