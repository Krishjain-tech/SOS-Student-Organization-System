import { api } from './api';

export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export interface CheckoutOptions {
  key_id: string;
  order_id: string;
  intent_id: string;
  amount_paise: number;
  name?: string;
  description?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  onSuccess: (data: any) => void;
  onError: (error: string) => void;
}

export async function startRazorpayPayment(opts: CheckoutOptions): Promise<void> {
  // Test hook: automated mock test provider for Playwright / automated tests
  if ((window as any).__MOCK_RAZORPAY__) {
    try {
      const mockResult = await (window as any).__MOCK_RAZORPAY__(opts);
      opts.onSuccess(mockResult);
    } catch (err: any) {
      opts.onError(err.message || 'Payment failed');
    }
    return;
  }

  const loaded = await loadRazorpayScript();
  if (!loaded || !(window as any).Razorpay) {
    opts.onError('Razorpay Test Mode is not available. Please verify network access.');
    return;
  }

  const rzp = new (window as any).Razorpay({
    key: opts.key_id,
    amount: opts.amount_paise,
    currency: 'INR',
    name: opts.name || 'Skyline Student Association',
    description: opts.description || 'Campus Association Payment (Test Mode)',
    order_id: opts.order_id,
    prefill: opts.prefill || {},
    theme: { color: '#1463D8' },
    handler: async (response: any) => {
      try {
        const result = await api('/payments/razorpay/verify', 'POST', {
          intent_id: opts.intent_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature
        });
        opts.onSuccess(result);
      } catch (err: any) {
        opts.onError(err.message || 'Payment verification failed on the server.');
      }
    },
    modal: {
      ondismiss: () => {
        opts.onError('Payment cancelled.');
      }
    }
  });

  if (rzp.on) {
    rzp.on('payment.failed', (response: any) => {
      opts.onError(response?.error?.description || 'Payment was unsuccessful.');
    });
  }

  rzp.open();
}
