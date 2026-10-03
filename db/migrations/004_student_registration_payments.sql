-- Migration 004: Student Registration and Razorpay Payments
-- Adds email verification for users and payment intents / gateway tracking

-- 1. Add email verification timestamp to users
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

-- 2. Create email verification tokens table
CREATE TABLE email_verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX email_verification_tokens_user ON email_verification_tokens(user_id, expires_at);

-- 3. Add provider tracking columns to payments table
ALTER TABLE payments ADD COLUMN provider TEXT;
ALTER TABLE payments ADD COLUMN provider_order_id TEXT;
ALTER TABLE payments ADD COLUMN provider_payment_id TEXT;
ALTER TABLE payments ADD COLUMN provider_status TEXT;

-- 4. Add owner_user_id to orders table for registered student user tracking
ALTER TABLE orders ADD COLUMN owner_user_id TEXT REFERENCES users(id);

-- 5. Create payment_intents table to track Razorpay orders before fulfillment
CREATE TABLE payment_intents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL CHECK(purpose IN('event_ticket','membership','merchandise')),
  target_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_order_id TEXT UNIQUE,
  provider_payment_id TEXT,
  provider_signature TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK(status IN('created','pending','paid','failed','cancelled')),
  payment_id TEXT REFERENCES payments(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX payment_intents_user ON payment_intents(user_id, status);
CREATE INDEX payment_intents_order ON payment_intents(provider_order_id);
