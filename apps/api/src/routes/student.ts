import { Router, type Request } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { getDb } from '../db/index.js';
import { requireAuth, requireStudent } from '../middleware/auth.js';
import { id, now, audit, apiError, validate, withIdempotency } from '../utils.js';
import { postPayment, localDate, organizationTimezone } from '../services/operations.js';

function actor(req: Request) { return req.user!.id; }

function getOrCreateMemberRecord(userId: string, userName: string, userEmail: string): any {
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

export function createStudentRouter() {
  const router = Router();

  // Consolidated endpoint for the Student workspace UI
  router.get('/student/portal-data', requireAuth, (req, res) => {
    const db = getDb();
    const user = req.user!;
    const today = localDate();

    // 1. Student member record & membership term
    const member = db.prepare('SELECT * FROM member_records WHERE user_id=? OR lower(email)=?').get(user.id, user.email.toLowerCase()) as any;
    let membership = {
      is_member: false,
      status: 'NONE',
      tier: 'Standard Student',
      starts_on: null as string | null,
      ends_on: null as string | null,
      dues_paise: 50000,
      student_number: member?.student_number || 'STU-2026-DEMO',
      perks: [
        '15% discount on all campus events & galas',
        'Early access to limited-edition merchandise',
        'Free entry to monthly tech talks & workshops',
        'Official Skyline digital membership badge'
      ]
    };

    if (member) {
      const activeTerm = db.prepare(
        "SELECT * FROM membership_terms WHERE member_id=? AND status='PAID' AND starts_on<=? AND ends_on>=? ORDER BY ends_on DESC LIMIT 1"
      ).get(member.id, today, today) as any;

      if (activeTerm) {
        const in30 = DateTime.now().setZone(organizationTimezone()).plus({ days: 30 }).toISODate()!;
        const isExpiring = activeTerm.ends_on <= in30;
        membership = {
          is_member: true,
          status: isExpiring ? 'EXPIRING' : 'ACTIVE',
          tier: 'Annual Premium Membership',
          starts_on: activeTerm.starts_on,
          ends_on: activeTerm.ends_on,
          dues_paise: activeTerm.dues_paise,
          student_number: member.student_number,
          perks: membership.perks
        };
      } else {
        const lastTerm = db.prepare("SELECT * FROM membership_terms WHERE member_id=? ORDER BY ends_on DESC LIMIT 1").get(member.id) as any;
        if (lastTerm) {
          membership.status = lastTerm.status === 'UNPAID' ? 'UNPAID' : (lastTerm.ends_on < today ? 'EXPIRED' : 'UPCOMING');
          membership.starts_on = lastTerm.starts_on;
          membership.ends_on = lastTerm.ends_on;
        }
      }
    }

    // 2. Published events with images and full details
    const events = db.prepare(
      "SELECT id,title,type,description,image_url,start_at,end_at,location,capacity,seats_sold,member_price_paise,nonmember_price_paise,status FROM events WHERE status='PUBLISHED' ORDER BY start_at ASC"
    ).all() as any[];

    // 3. Active products with variants and stock
    const products = (db.prepare(
      "SELECT id,name,description,price_paise,member_price_paise,image_url,active FROM products WHERE active=1 ORDER BY name ASC"
    ).all() as any[]).map(p => ({
      ...p,
      variants: db.prepare("SELECT id,size,stock FROM product_variants WHERE product_id=? ORDER BY id ASC").all(p.id)
    }));

    // 4. Announcements targeted to students / all
    const announcements = db.prepare(
      "SELECT id,title,body,audience,published_at,created_at FROM announcements WHERE status='PUBLISHED' AND audience='all' ORDER BY published_at DESC LIMIT 10"
    ).all();

    // 5. Student's tickets
    const tickets = db.prepare(
      `SELECT t.id, t.event_id, t.buyer_name, t.buyer_email, t.code, t.price_paise, t.status, t.checked_in_at, t.created_at,
              e.title as event_title, e.start_at as event_start, e.location as event_location, e.image_url as event_image
       FROM tickets t
       JOIN events e ON e.id = t.event_id
       WHERE t.owner_user_id = ? OR (t.member_id IS NOT NULL AND t.member_id = ?)
       ORDER BY t.created_at DESC`
    ).all(user.id, member?.id || '') as any[];

    // 6. Student's orders
    const orders = (db.prepare(
      `SELECT o.id, o.buyer_name, o.total_paise, o.collected, o.created_at
       FROM orders o
       WHERE o.member_id = ? OR lower(o.buyer_name) = lower(?)
       ORDER BY o.created_at DESC LIMIT 10`
    ).all(member?.id || '', user.name) as any[]).map(o => ({
      ...o,
      items: db.prepare(
        `SELECT oi.id, oi.quantity, oi.unit_price_paise, pv.size, p.name as product_name
         FROM order_items oi
         JOIN product_variants pv ON pv.id = oi.variant_id
         JOIN products p ON p.id = pv.product_id
         WHERE oi.order_id = ?`
      ).all(o.id)
    }));

    res.json({
      data: {
        user,
        membership,
        events,
        merchandise: products,
        announcements,
        tickets,
        orders
      }
    });
  });

  // Book an event ticket
  router.post('/student/tickets/book', requireAuth, requireStudent, (req, res) => {
    const bookSchema = z.object({
      event_id: z.string().min(1),
      tier: z.enum(['member', 'standard']).optional()
    }).strict();

    const data = validate(bookSchema, req.body);
    const user = req.user!;
    const db = getDb();

    const result = withIdempotency(req, 'student.tickets.book', () => {
      return db.transaction(() => {
        const event = db.prepare("SELECT * FROM events WHERE id=?").get(data.event_id) as any;
        if (!event) throw apiError(404, 'NOT_FOUND', 'Event not found.');
        if (event.status !== 'PUBLISHED') throw apiError(409, 'EVENT_NOT_PUBLISHED', 'This event is not open for ticket sales.');
        if (event.seats_sold >= event.capacity) throw apiError(409, 'SOLD_OUT', 'This event is sold out.');

        const member = getOrCreateMemberRecord(user.id, user.name, user.email);
        const today = localDate();
        const isMember = !!db.prepare(
          "SELECT 1 FROM membership_terms WHERE member_id=? AND status='PAID' AND starts_on<=? AND ends_on>=?"
        ).get(member.id, today, today);

        const price = (isMember && data.tier !== 'standard') ? event.member_price_paise : event.nonmember_price_paise;

        const updated = db.prepare(
          "UPDATE events SET seats_sold=seats_sold+1 WHERE id=? AND seats_sold<capacity AND status='PUBLISHED'"
        ).run(event.id);
        if (!updated.changes) throw apiError(409, 'SOLD_OUT', 'Seats are no longer available.');

        const ticketId = id();
        const ticketCode = `SKY-${event.title.slice(0, 4).toUpperCase().replace(/[^A-Z]/g, 'X')}-${id().slice(0, 6).toUpperCase()}`;

        db.prepare(
          "INSERT INTO tickets(id,event_id,member_id,owner_user_id,buyer_name,buyer_email,code,price_paise,status,created_at) VALUES(?,?,?,?,?,?,?,?,'VALID',?)"
        ).run(ticketId, event.id, member.id, user.id, user.name, user.email, ticketCode, price, now());

        const paymentId = postPayment(
          user.id,
          'ticket',
          ticketId,
          price,
          'upi',
          `STUDENT-${ticketCode}`,
          'tickets',
          `Student ticket booking · ${event.title}`,
          'IN',
          event.id,
          now()
        );

        db.prepare("UPDATE tickets SET payment_id=? WHERE id=?").run(paymentId, ticketId);
        audit(user.id, 'ticket.book', 'ticket', ticketId, { event_id: event.id, price_paise: price });

        return db.prepare(
          `SELECT t.*, e.title as event_title, e.start_at as event_start, e.location as event_location, e.image_url as event_image
           FROM tickets t
           JOIN events e ON e.id = t.event_id
           WHERE t.id = ?`
        ).get(ticketId);
      }).immediate();
    });

    res.status(201).json({ data: result });
  });

  // Ticket check-in
  router.post('/student/tickets/:id/checkin', requireAuth, (req, res) => {
    const ticketId = req.params.id;
    const db = getDb();
    const user = req.user!;

    const result = db.transaction(() => {
      const ticket = db.prepare("SELECT * FROM tickets WHERE id=?").get(ticketId) as any;
      if (!ticket) throw apiError(404, 'NOT_FOUND', 'Ticket not found.');
      if (ticket.status !== 'VALID') throw apiError(409, 'ALREADY_CHECKED_IN', 'Ticket is not in valid state for check-in.');

      const timestamp = now();
      db.prepare("UPDATE tickets SET status='USED',checked_in_at=?,checked_in_by=? WHERE id=? AND status='VALID'").run(
        timestamp, user.id, ticket.id
      );

      audit(user.id, 'ticket.checkin', 'ticket', ticket.id, {});
      return { id: ticket.id, code: ticket.code, status: 'USED', checked_in_at: timestamp };
    }).immediate();

    res.json({ data: result });
  });

  // Membership purchase / renewal
  router.post('/student/membership/join', requireAuth, requireStudent, (req, res) => {
    const joinSchema = z.object({
      plan: z.string().default('annual'),
      method: z.enum(['upi', 'card', 'cash']).default('upi')
    }).strict();

    const data = validate(joinSchema, req.body);
    const user = req.user!;
    const db = getDb();

    const result = withIdempotency(req, 'student.membership.join', () => {
      return db.transaction(() => {
        const member = getOrCreateMemberRecord(user.id, user.name, user.email);
        const today = localDate();
        const endsOn = DateTime.now().setZone(organizationTimezone()).plus({ years: 1 }).toISODate()!;
        const duesPaise = 50000; // ₹500.00 annual student dues

        const termId = id();
        db.prepare(
          "INSERT INTO membership_terms(id,member_id,starts_on,ends_on,dues_paise,status,created_at) VALUES(?,?,?,?,?,'PAID',?)"
        ).run(termId, member.id, today, endsOn, duesPaise, now());

        const duesPaymentId = id();
        db.prepare("INSERT INTO dues_payments(id,term_id,amount_paise,created_at) VALUES(?,?,?,?)").run(
          duesPaymentId, termId, duesPaise, now()
        );

        const paymentId = postPayment(
          user.id,
          'dues',
          duesPaymentId,
          duesPaise,
          data.method,
          `STUDENT-MEMBERSHIP-${termId.slice(0, 8)}`,
          'membership',
          `Annual Student Membership Dues · ${user.name}`,
          'IN',
          null,
          now()
        );

        db.prepare("UPDATE dues_payments SET payment_id=? WHERE id=?").run(paymentId, duesPaymentId);
        audit(user.id, 'membership.join', 'membership_term', termId, { dues_paise: duesPaise });

        return {
          term_id: termId,
          starts_on: today,
          ends_on: endsOn,
          dues_paise: duesPaise,
          status: 'PAID',
          is_member: true
        };
      }).immediate();
    });

    res.status(201).json({ data: result });
  });

  // Merchandise checkout
  router.post('/student/orders/checkout', requireAuth, requireStudent, (req, res) => {
    const checkoutSchema = z.object({
      items: z.array(z.object({
        variant_id: z.string().min(1),
        quantity: z.number().int().positive().max(10)
      }).strict()).min(1).max(10),
      method: z.enum(['upi', 'card', 'cash']).default('upi')
    }).strict();

    const data = validate(checkoutSchema, req.body);
    const user = req.user!;
    const db = getDb();

    const result = withIdempotency(req, 'student.orders.checkout', () => {
      return db.transaction(() => {
        const member = getOrCreateMemberRecord(user.id, user.name, user.email);
        const today = localDate();
        const isMember = !!db.prepare(
          "SELECT 1 FROM membership_terms WHERE member_id=? AND status='PAID' AND starts_on<=? AND ends_on>=?"
        ).get(member.id, today, today);

        const orderLines = data.items.map(item => {
          const variant = db.prepare(
            "SELECT v.*, p.name as product_name, p.price_paise, p.member_price_paise, p.active FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=?"
          ).get(item.variant_id) as any;
          if (!variant || !variant.active) throw apiError(422, 'INVALID_VARIANT', 'Select an active merchandise item.');
          if (variant.stock < item.quantity) throw apiError(409, 'INSUFFICIENT_STOCK', `Insufficient stock for ${variant.product_name} (${variant.size}).`);

          const unitPrice = isMember ? variant.member_price_paise : variant.price_paise;
          return {
            variant_id: item.variant_id,
            quantity: item.quantity,
            unit_price_paise: unitPrice,
            product_name: variant.product_name,
            size: variant.size
          };
        });

        const total = orderLines.reduce((sum, line) => sum + line.unit_price_paise * line.quantity, 0);
        const orderId = id();

        db.prepare(
          "INSERT INTO orders(id,member_id,buyer_name,total_paise,collected,created_at) VALUES(?,?,?,?,1,?)"
        ).run(orderId, member.id, user.name, total, now());

        for (const line of orderLines) {
          const updated = db.prepare("UPDATE product_variants SET stock=stock-? WHERE id=? AND stock>=?").run(
            line.quantity, line.variant_id, line.quantity
          );
          if (updated.changes !== 1) throw apiError(409, 'INSUFFICIENT_STOCK', 'Stock was updated by another request.');

          db.prepare("INSERT INTO order_items(id,order_id,variant_id,quantity,unit_price_paise) VALUES(?,?,?,?,?)").run(
            id(), orderId, line.variant_id, line.quantity, line.unit_price_paise
          );

          db.prepare("INSERT INTO stock_movements(id,variant_id,quantity,reason,order_id,actor_id,created_at) VALUES(?,?,?,?,?,?,?)").run(
            id(), line.variant_id, -line.quantity, 'Student portal online purchase', orderId, user.id, now()
          );
        }

        const paymentId = postPayment(
          user.id,
          'order',
          orderId,
          total,
          data.method,
          `STUDENT-ORDER-${orderId.slice(0, 8)}`,
          'merchandise',
          `Student merchandise order · ${user.name}`,
          'IN',
          null,
          now()
        );

        db.prepare("UPDATE orders SET payment_id=? WHERE id=?").run(paymentId, orderId);
        audit(user.id, 'order.checkout', 'order', orderId, { total_paise: total, items_count: orderLines.length });

        return {
          id: orderId,
          total_paise: total,
          items: orderLines,
          buyer_name: user.name,
          created_at: now()
        };
      }).immediate();
    });

    res.status(201).json({ data: result });
  });

  return router;
}

