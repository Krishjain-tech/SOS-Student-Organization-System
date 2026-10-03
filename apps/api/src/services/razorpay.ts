import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { apiError } from '../utils.js';

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function getRazorpayKeyId(): string | null {
  if (isRazorpayConfigured()) return process.env.RAZORPAY_KEY_ID!;
  if (process.env.NODE_ENV === 'test') return 'rzp_test_mock_key';
  return null;
}

export function getRazorpayKeySecret(): string {
  return process.env.RAZORPAY_KEY_SECRET || 'test_razorpay_secret';
}

export function getRazorpayWebhookSecret(): string {
  return process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret';
}

export interface CreateOrderParams {
  amount_paise: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderResult {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

// In-memory mock storage for tests
let mockOrderOverride: ((params: CreateOrderParams) => RazorpayOrderResult) | null = null;

export function setMockOrderOverride(fn: ((params: CreateOrderParams) => RazorpayOrderResult) | null) {
  mockOrderOverride = fn;
}

export async function createRazorpayOrder(params: CreateOrderParams): Promise<RazorpayOrderResult> {
  if (mockOrderOverride) {
    return mockOrderOverride(params);
  }

  // If in automated test mode or keys are not configured, use mocked test order
  if (process.env.NODE_ENV === 'test' || !isRazorpayConfigured()) {
    const randomHex = crypto.randomBytes(8).toString('hex');
    return {
      id: `order_test_${randomHex}`,
      amount: params.amount_paise,
      currency: params.currency || 'INR',
      receipt: params.receipt,
      status: 'created'
    };
  }

  // Real Razorpay Test API
  try {
    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!
    });

    const order = await instance.orders.create({
      amount: params.amount_paise,
      currency: params.currency || 'INR',
      receipt: params.receipt,
      notes: params.notes
    });

    return {
      id: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      receipt: String(order.receipt || params.receipt),
      status: order.status
    };
  } catch (err: any) {
    throw apiError(502, 'RAZORPAY_ERROR', err?.error?.description || err.message || 'Failed to create payment order with Razorpay.');
  }
}

export function verifyPaymentSignature(params: {
  order_id: string;
  payment_id: string;
  signature: string;
}): boolean {
  const secret = getRazorpayKeySecret();
  const body = `${params.order_id}|${params.payment_id}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');

  try {
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const providedBuf = Buffer.from(params.signature, 'utf8');
    if (expectedBuf.length !== providedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}

export function verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
  const secret = getRazorpayWebhookSecret();
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  try {
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const providedBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.length !== providedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}

// Test helpers
export function generateTestPaymentSignature(order_id: string, payment_id: string, secret = getRazorpayKeySecret()): string {
  return crypto.createHmac('sha256', secret).update(`${order_id}|${payment_id}`).digest('hex');
}

export function generateTestWebhookSignature(rawBody: string | Buffer, secret = getRazorpayWebhookSecret()): string {
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
