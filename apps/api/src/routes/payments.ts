import { Router, type Request } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { razorpayOrderSchema, razorpayVerifySchema } from '../../../../packages/shared/src/index.js';
import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { apiError, asyncRoute, audit, id, now, validate } from '../utils.js';
import { postPayment, localDate } from '../services/operations.js';
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  getRazorpayKeyId,
  isRazorpayConfigured
} from '../services/razorpay.js';

export function getOrCreateMemberRecord(userId: string, userName: string, userEmail: string): any {
  const db = getDb();
  let member = db.prepare('SELECT * FROM member_records WHERE user_id=?').get(userId) as any;
  if (!member) {
    member = db.prepare('SELECT * FROM member_records WHERE lower(email)=?').get(userEmail.toLowerCase()) as any;
    if (member) {
      db.prepare('UPDATE member_records SET user_id=?,updated_at=? WHERE id=?').run(userId, now(), member.id);
      member.user_id = userId;
    } else {
      const memberId = id();
      const studentNum = `STU-${id().slice(0, 6).toUpperCase()}`;
      db.prepare('INSERT INTO member_records(id,user_id,name,email,student_number,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(
        memberId, userId, userName, userEmail.toLowerCase(), studentNum, now(), now()
      );
      member = db.prepare('SELECT * FROM member_records WHERE id=?').get(memberId);
    }
  }
  return member;
}

export function fulfillPaymentIntent(intent: any, razorpayPaymentId: string, actorId: string): any {
  const db = getDb();
  const payload = JSON.parse(intent.payload_json || '{}');
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(intent.user_id) as any;
  if (!user) throw apiError(404, 'USER_NOT_FOUND', 'User associated with payment was not found.');

  if (intent.purpose === 'event_ticket') {
    const event = db.prepare('SELECT * FROM events WHERE id=?').get(intent.target_id) as any;
    if (!event) throw apiError(404, 'EVENT_NOT_FOUND', 'Event not found.');
    if (event.seats_sold >= event.capacity) {
      throw apiError(409, 'EVENT_SOLD_OUT', 'Event reached full capacity.');
    }

    const ticketId = id();
    const code = `SKY-${id().slice(0, 8).toUpperCase()}`;
    const member = db.prepare('SELECT * FROM member_records WHERE user_id=? OR lower(email)=?').get(user.id, user.email.toLowerCase()) as any;

    db.prepare(
      'INSERT INTO tickets(id,event_id,member_id,owner_user_id,buyer_name,buyer_email,code,price_paise,status,refund_status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
    ).run(ticketId, event.id, member?.id || null, user.id, user.name, user.email, code, intent.amount_paise, 'VALID', 'NONE', now());

    const paymentId = postPayment(
      actorId,
      'ticket',
      ticketId,
      intent.amount_paise,
      'card',
      razorpayPaymentId,
      'tickets',
      `${event.title} ticket (${payload.isMember ? 'member' : 'standard'})`,
      'IN',
      event.id,
      now(),
      null,
      {
        provider: 'razorpay',
        provider_order_id: intent.provider_order_id,
        provider_payment_id: razorpayPaymentId,
        provider_status: 'captured'
      }
    );

    db.prepare('UPDATE tickets SET payment_id=? WHERE id=?').run(paymentId, ticketId);
    db.prepare('UPDATE events SET seats_sold=seats_sold+1 WHERE id=?').run(event.id);
    db.prepare('UPDATE payment_intents SET status=?,provider_payment_id=?,payment_id=?,updated_at=? WHERE id=?')
      .run('paid', razorpayPaymentId, paymentId, now(), intent.id);

    audit(actorId, 'RAZORPAY_PAYMENT_VERIFIED', 'ticket', ticketId, {
      amount_paise: intent.amount_paise,
      order_id: intent.provider_order_id,
      payment_id: razorpayPaymentId
    });

    return {
      fulfilled: true,
      purpose: 'event_ticket',
      ticket: db.prepare('SELECT * FROM tickets WHERE id=?').get(ticketId)
    };
  }

  if (intent.purpose === 'membership') {
    const member = getOrCreateMemberRecord(user.id, user.name, user.email);
    const startsOn = localDate();
    const endsOn = DateTime.now().plus({ years: 1 }).toISODate()!;
    const termId = id();

    db.prepare(
      'INSERT INTO membership_terms(id,member_id,starts_on,ends_on,dues_paise,status,created_at) VALUES(?,?,?,?,?,?,?)'
    ).run(termId, member.id, startsOn, endsOn, intent.amount_paise, 'PAID', now());

    const duesId = id();
    db.prepare('INSERT INTO dues_payments(id,term_id,amount_paise,created_at) VALUES(?,?,?,?)')
      .run(duesId, termId, intent.amount_paise, now());

    const paymentId = postPayment(
      actorId,
      'dues',
      duesId,
      intent.amount_paise,
      'card',
      razorpayPaymentId,
      'membership',
      `Annual dues - ${user.name}`,
      'IN',
      null,
      now(),
      null,
      {
        provider: 'razorpay',
        provider_order_id: intent.provider_order_id,
        provider_payment_id: razorpayPaymentId,
        provider_status: 'captured'
      }
    );

    db.prepare('UPDATE dues_payments SET payment_id=? WHERE id=?').run(paymentId, duesId);
    db.prepare('UPDATE payment_intents SET status=?,provider_payment_id=?,payment_id=?,updated_at=? WHERE id=?')
      .run('paid', razorpayPaymentId, paymentId, now(), intent.id);

    audit(actorId, 'RAZORPAY_PAYMENT_VERIFIED', 'membership', termId, {
      amount_paise: intent.amount_paise,
      order_id: intent.provider_order_id,
      payment_id: razorpayPaymentId
    });

    return {
      fulfilled: true,
      purpose: 'membership',
      term: db.prepare('SELECT * FROM membership_terms WHERE id=?').get(termId)
    };
  }

  if (intent.purpose === 'merchandise') {
    const items = payload.items || [];
    const orderId = id();
    const member = db.prepare('SELECT * FROM member_records WHERE user_id=? OR lower(email)=?').get(user.id, user.email.toLowerCase()) as any;

    db.prepare(
      'INSERT INTO orders(id,member_id,buyer_name,total_paise,collected,created_at,owner_user_id) VALUES(?,?,?,?,1,?,?)'
    ).run(orderId, member?.id || null, user.name, intent.amount_paise, now(), user.id);

    for (const item of items) {
      const dec = db.prepare('UPDATE product_variants SET stock=stock-? WHERE id=? AND stock>=?').run(item.quantity, item.variantId, item.quantity);
      if (dec.changes !== 1) {
        throw apiError(409, 'INSUFFICIENT_STOCK', `Stock unavailable for variant ${item.variantId}`);
      }

      const lineId = id();
      db.prepare('INSERT INTO order_items(id,order_id,variant_id,quantity,unit_price_paise) VALUES(?,?,?,?,?)')
        .run(lineId, orderId, item.variantId, item.quantity, item.unitPrice);

      db.prepare('INSERT INTO stock_movements(id,variant_id,quantity,reason,order_id,actor_id,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(id(), item.variantId, -item.quantity, 'Razorpay student purchase', orderId, user.id, now());
    }

    const paymentId = postPayment(
      actorId,
      'order',
      orderId,
      intent.amount_paise,
      'card',
      razorpayPaymentId,
      'merchandise',
      `Merchandise order - ${user.name}`,
      'IN',
      null,
      now(),
      null,
      {
        provider: 'razorpay',
        provider_order_id: intent.provider_order_id,
        provider_payment_id: razorpayPaymentId,
        provider_status: 'captured'
      }
    );

    db.prepare('UPDATE orders SET payment_id=? WHERE id=?').run(paymentId, orderId);
    db.prepare('UPDATE payment_intents SET status=?,provider_payment_id=?,payment_id=?,updated_at=? WHERE id=?')
      .run('paid', razorpayPaymentId, paymentId, now(), intent.id);

    audit(actorId, 'RAZORPAY_PAYMENT_VERIFIED', 'order', orderId, {
      amount_paise: intent.amount_paise,
      order_id: intent.provider_order_id,
      payment_id: razorpayPaymentId
    });

    return {
      fulfilled: true,
      purpose: 'merchandise',
      order: db.prepare('SELECT * FROM orders WHERE id=?').get(orderId)
    };
  }

  throw apiError(400, 'UNSUPPORTED_PURPOSE', 'Unsupported payment purpose.');
}

export function createPaymentsRouter() {
  const router = Router();

  // 1. Razorpay Public Configuration
  router.get('/razorpay/config', (_req, res) => {
    res.json({
      data: {
        configured: isRazorpayConfigured() || process.env.NODE_ENV === 'test',
        test_mode: true,
        key_id: getRazorpayKeyId()
      }
    });
  });

  // 2. Create Razorpay Test Order with Authoritative Backend Pricing
  router.post('/razorpay/order', requireAuth, asyncRoute(async (req, res) => {
    const data = validate(razorpayOrderSchema, req.body);
    const db = getDb();
    const user = req.user!;
    const today = localDate();

    // Determine active membership server-side
    const member = db.prepare('SELECT * FROM member_records WHERE user_id=? OR lower(email)=?').get(user.id, user.email.toLowerCase()) as any;
    const activeTerm = member ? db.prepare(
      "SELECT * FROM membership_terms WHERE member_id=? AND status='PAID' AND starts_on<=? AND ends_on>=? LIMIT 1"
    ).get(member.id, today, today) : null;
    const isMember = Boolean(activeTerm);

    let amount_paise = 0;
    let target_id: string | null = null;
    let payload: Record<string, any> = { isMember };

    if (data.purpose === 'event_ticket') {
      const event = db.prepare('SELECT * FROM events WHERE id=?').get(data.eventId) as any;
      if (!event) throw apiError(404, 'EVENT_NOT_FOUND', 'Event not found.');
      if (event.status !== 'PUBLISHED') throw apiError(400, 'EVENT_NOT_PUBLISHED', 'Event is not published.');
      if (event.seats_sold >= event.capacity) throw apiError(409, 'EVENT_SOLD_OUT', 'Event is sold out.');

      amount_paise = isMember ? event.member_price_paise : event.nonmember_price_paise;
      target_id = event.id;
      payload = { ...payload, eventId: event.id, eventTitle: event.title };
    } else if (data.purpose === 'membership') {
      const settings = db.prepare('SELECT dues_paise FROM organization_settings WHERE id=1').get() as any;
      amount_paise = settings?.dues_paise || 50000;
      target_id = 'membership-annual';
      payload = { ...payload, dues_paise: amount_paise };
    } else if (data.purpose === 'merchandise') {
      const itemsDetail = [];
      for (const item of data.items) {
        const variant = db.prepare(
          'SELECT v.*, p.name as product_name, p.price_paise, p.member_price_paise, p.active FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=?'
        ).get(item.variantId) as any;

        if (!variant || !variant.active) {
          throw apiError(404, 'PRODUCT_NOT_FOUND', 'Product variant not found or inactive.');
        }
        if (variant.stock < item.quantity) {
          throw apiError(409, 'INSUFFICIENT_STOCK', `Insufficient stock for ${variant.product_name} (${variant.size}). Available: ${variant.stock}`);
        }

        const unitPrice = isMember ? variant.member_price_paise : variant.price_paise;
        amount_paise += unitPrice * item.quantity;
        itemsDetail.push({
          variantId: variant.id,
          quantity: item.quantity,
          unitPrice,
          name: variant.product_name,
          size: variant.size
        });
      }
      payload = { ...payload, items: itemsDetail };
    }

    if (amount_paise <= 0) {
      throw apiError(400, 'INVALID_AMOUNT', 'Free items do not require gateway payment.');
    }

    const intentId = id();

    // Create local intent
    db.prepare(
      'INSERT INTO payment_intents(id,user_id,purpose,target_id,payload_json,amount_paise,currency,provider,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
    ).run(intentId, user.id, data.purpose, target_id, JSON.stringify(payload), amount_paise, 'INR', 'razorpay', 'created', now(), now());

    // Create Razorpay order
    const order = await createRazorpayOrder({
      amount_paise,
      currency: 'INR',
      receipt: intentId,
      notes: { intent_id: intentId, user_id: user.id, purpose: data.purpose }
    });

    db.prepare('UPDATE payment_intents SET provider_order_id=?,status=?,updated_at=? WHERE id=?')
      .run(order.id, 'pending', now(), intentId);

    audit(user.id, 'RAZORPAY_ORDER_CREATED', 'payment_intent', intentId, {
      amount_paise,
      order_id: order.id,
      purpose: data.purpose
    });

    res.status(201).json({
      data: {
        intent_id: intentId,
        order_id: order.id,
        amount_paise,
        currency: 'INR',
        key_id: getRazorpayKeyId(),
        purpose: data.purpose
      }
    });
  }));

  // 3. Verify Razorpay Payment Callback and Authoritatively Fulfill
  router.post('/razorpay/verify', requireAuth, asyncRoute(async (req, res) => {
    const data = validate(razorpayVerifySchema, req.body);
    const db = getDb();
    const user = req.user!;

    // Cryptographic signature check
    const valid = verifyPaymentSignature({
      order_id: data.razorpay_order_id,
      payment_id: data.razorpay_payment_id,
      signature: data.razorpay_signature
    });

    if (!valid) {
      audit(user.id, 'PAYMENT_FAILED', 'payment_intent', data.intent_id, {
        reason: 'INVALID_SIGNATURE',
        order_id: data.razorpay_order_id
      });
      throw apiError(400, 'INVALID_PAYMENT_SIGNATURE', 'Payment signature verification failed.');
    }

    const intent = db.prepare('SELECT * FROM payment_intents WHERE id=?').get(data.intent_id) as any;
    if (!intent) {
      throw apiError(404, 'INTENT_NOT_FOUND', 'Payment intent was not found.');
    }
    if (intent.user_id !== user.id) {
      throw apiError(403, 'FORBIDDEN_INTENT', 'Payment intent belongs to another user.');
    }
    if (intent.provider_order_id !== data.razorpay_order_id) {
      throw apiError(400, 'ORDER_MISMATCH', 'Razorpay order ID mismatch.');
    }

    // Idempotency: if already paid, return fulfilled response without duplicate processing
    if (intent.status === 'paid') {
      return res.json({
        data: {
          fulfilled: true,
          idempotent: true,
          purpose: intent.purpose,
          payment_id: intent.payment_id
        }
      });
    }

    // Atomic fulfillment in transaction
    const result = db.transaction(() => {
      return fulfillPaymentIntent(intent, data.razorpay_payment_id, user.id);
    }).immediate();

    res.json({ data: result });
  }));

  // 4. Razorpay Server-to-Server Webhook
  router.post('/razorpay/webhook', asyncRoute(async (req: any, res) => {
    const signature = req.get('x-razorpay-signature');
    if (!signature) {
      throw apiError(400, 'MISSING_SIGNATURE', 'Missing webhook signature.');
    }

    const valid = verifyWebhookSignature(req.rawBody || JSON.stringify(req.body), signature);
    if (!valid) {
      throw apiError(400, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature.');
    }

    const db = getDb();
    const event = req.body?.event;
    const paymentEntity = req.body?.payload?.payment?.entity;
    const orderId = paymentEntity?.order_id || req.body?.payload?.order?.entity?.id;
    const paymentId = paymentEntity?.id || `wh_${id().slice(0, 10)}`;

    audit(null, 'RAZORPAY_WEBHOOK_RECEIVED', 'webhook', orderId || 'none', { event });

    if (['payment.captured', 'order.paid'].includes(event) && orderId) {
      const intent = db.prepare('SELECT * FROM payment_intents WHERE provider_order_id=?').get(orderId) as any;
      if (intent && intent.status !== 'paid') {
        db.transaction(() => {
          fulfillPaymentIntent(intent, paymentId, intent.user_id);
        }).immediate();
      }
    }

    res.json({ data: { received: true, event } });
  }));

  return router;
}
