import { z } from 'zod';

export const roles = ['admin', 'volunteer', 'student'] as const;
export const taskStatuses = ['ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED'] as const;
export const claimStatuses = ['DRAFT','SUBMITTED','CHANGES_REQUESTED','REJECTED','APPROVED_UNPAID','PAID'] as const;

export const loginSchema = z.object({
  email: z.string().email().max(254).transform(v => v.toLowerCase().trim()),
  password: z.string().min(1).max(200),
  requestedPortal: z.enum(roles).optional()
}).strict();

export const passwordSchema = z.string().min(12, 'Use at least 12 characters').max(200);
export const moneySchema = z.number().int().min(0).max(1000000000);
export const optionalId = z.string().min(1).max(100).nullable().optional();
export const dateTimeSchema = z.iso.datetime({ offset: true }).transform(v => new Date(v).toISOString());

export function normalizePhone(raw: string): string {
  const cleaned = (raw || '').trim().replace(/[\s\-\(\)\.]/g, '');
  if (/^\+91[6-9]\d{9}$/.test(cleaned)) return cleaned;
  if (/^91[6-9]\d{9}$/.test(cleaned)) return `+${cleaned}`;
  if (/^0[6-9]\d{9}$/.test(cleaned)) return `+91${cleaned.slice(1)}`;
  if (/^[6-9]\d{9}$/.test(cleaned)) return `+91${cleaned}`;
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;
  throw new Error('Invalid phone number format');
}

export const studentRegistrationSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  email: z.string().trim().email('Invalid email address').max(254).transform(v => v.toLowerCase().trim()),
  phone: z.string().trim().min(7, 'Invalid phone number').max(30).transform((val, ctx) => {
    try {
      return normalizePhone(val);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid phone number format. Provide a valid 10-digit mobile number.' });
      return z.NEVER;
    }
  }),
  password: passwordSchema,
  confirmPassword: z.string().optional()
}).passthrough().refine(data => !data.confirmPassword || data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
});

export const memberSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(254),
  phone: z.string().max(30).default(''),
  student_number: z.string().max(50).default(''),
  notes: z.string().max(2000).default(''),
  user_id: optionalId
}).strict();

export const eventSchema = z.object({
  title: z.string().trim().min(2).max(160),
  type: z.enum(['EVENT','FUNDRAISER']).default('EVENT'),
  description: z.string().max(5000).default(''),
  image_url: z.string().max(500).default(''),
  start_at: dateTimeSchema,
  end_at: dateTimeSchema,
  location: z.string().trim().min(2).max(300),
  capacity: z.number().int().min(1).max(100000),
  member_price_paise: moneySchema.default(0),
  nonmember_price_paise: moneySchema.default(0),
  budget_paise: moneySchema.default(0),
  volunteer_requirement: z.number().int().min(0).max(10000).default(0),
  status: z.enum(['DRAFT','PUBLISHED','CANCELLED']).default('DRAFT')
}).strict();

export const taskSchema = z.object({
  title: z.string().trim().min(2).max(200),
  instructions: z.string().max(5000).default(''),
  assignee_id: z.string().min(1).max(100),
  event_id: optionalId,
  due_at: dateTimeSchema.nullable().optional(),
  budget_paise: moneySchema.default(0),
  status: z.enum(taskStatuses).default('ASSIGNED')
}).strict();

export const razorpayOrderSchema = z.discriminatedUnion('purpose', [
  z.object({
    purpose: z.literal('event_ticket'),
    eventId: z.string().min(1)
  }),
  z.object({
    purpose: z.literal('membership'),
    membershipTierId: z.string().optional()
  }),
  z.object({
    purpose: z.literal('merchandise'),
    items: z.array(z.object({
      variantId: z.string().min(1),
      quantity: z.number().int().min(1).max(50)
    })).min(1)
  })
]);

export const razorpayVerifySchema = z.object({
  intent_id: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1)
}).strict();

export type User = {
  id: string;
  email: string;
  name: string;
  phone: string;
  active: number;
  email_verified_at?: string | null;
  roles: Array<typeof roles[number]>;
  workspaces?: Array<typeof roles[number]>;
};
