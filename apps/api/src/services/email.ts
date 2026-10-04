import nodemailer from 'nodemailer';
import { getDb } from '../db/index.js';
import { id, now } from '../utils.js';

export interface SentEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  verificationLink?: string;
  token?: string;
  sentAt: string;
}

// In-memory test outbox for test suites
export const testMailOutbox: SentEmail[] = [];

export function clearTestMailOutbox() {
  testMailOutbox.length = 0;
}

export function getLatestTestEmail(): SentEmail | undefined {
  return testMailOutbox[testMailOutbox.length - 1];
}

export function getTestEmailsFor(to: string): SentEmail[] {
  return testMailOutbox.filter(m => m.to.toLowerCase() === to.toLowerCase());
}

export function getLastVerificationToken(to: string): string | undefined {
  const matches = getTestEmailsFor(to);
  if (!matches.length) return undefined;
  return matches[matches.length - 1].token;
}

export interface SendVerificationEmailOptions {
  to: string;
  name: string;
  token: string;
  origin?: string;
}

export async function sendVerificationEmail({ to, name, token, origin }: SendVerificationEmailOptions): Promise<void> {
  const appOrigin = (process.env.APP_ORIGIN || (origin && !origin.includes(':3001') ? origin : 'http://127.0.0.1:5173')).trim().replace(/\/+$/, '');
  const verificationLink = `${appOrigin}/student/verify-email?token=${token}`;
  const subject = 'Verify your Skyline Student account';

  const text = `Hello ${name},\n\n` +
    `Welcome to the Skyline Student Association!\n\n` +
    `Please verify your email address to activate your Student Workspace account. Click the link below or copy and paste it into your browser:\n\n` +
    `${verificationLink}\n\n` +
    `This verification link will expire in 24 hours.\n\n` +
    `If you did not register for a Skyline Student account, please ignore this email.\n\n` +
    `Best regards,\n` +
    `Skyline Student Association Team`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; color: #1e293b; padding: 24px; margin: 0; }
          .container { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; }
          .header { text-align: center; margin-bottom: 24px; }
          .logo { font-size: 20px; font-weight: 800; color: #102A4C; letter-spacing: -0.5px; }
          h1 { font-size: 20px; color: #102A4C; margin-top: 0; margin-bottom: 16px; }
          p { font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 16px; }
          .btn { display: inline-block; background: #1463D8; color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; margin: 16px 0; }
          .footer { font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; }
          .url { word-break: break-all; font-size: 12px; color: #64748b; background: #f1f5f9; padding: 8px 12px; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Skyline Student Association</div>
          </div>
          <h1>Verify your email address</h1>
          <p>Hello <strong>${name}</strong>,</p>
          <p>Welcome to the Skyline Student Association. Please confirm your email address to access your campus workspace, events, tickets, and membership.</p>
          <div style="text-align: center;">
            <a href="${verificationLink}" class="btn">Verify Email Address</a>
          </div>
          <p>This verification link will expire in <strong>24 hours</strong>.</p>
          <p>If the button doesn't work, copy and paste this URL into your browser:</p>
          <div class="url">${verificationLink}</div>
          <div class="footer">
            <p>If you did not register for this account, you can safely ignore this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const sentEmail: SentEmail = {
    to,
    subject,
    text,
    html,
    verificationLink,
    token,
    sentAt: now()
  };

  // Record to test/dev in-memory outbox
  testMailOutbox.push(sentEmail);

  // Record to SQLite mock_email_outbox table
  try {
    const db = getDb();
    const dedupeKey = `verify-${id()}`;
    db.prepare(
      'INSERT INTO mock_email_outbox(id,recipient_email,subject,body,status,attempts,dedupe_key,created_at,delivered_at) VALUES(?,?,?,?,?,?,?,?,?)'
    ).run(id(), to, subject, text, 'DELIVERED', 1, dedupeKey, now(), now());
  } catch (err) {
    // If DB is busy or running in isolated script, ignore
  }

  // If real SMTP is configured and not in test environment, send real email
  if (process.env.SMTP_HOST && process.env.NODE_ENV !== 'test') {
    try {
      const port = Number(process.env.SMTP_PORT) || 587;
      const secure = process.env.SMTP_SECURE === 'true' || port === 465;
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        auth: process.env.SMTP_USER ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || ''
        } : undefined
      });

      await transporter.sendMail({
        from: process.env.MAIL_FROM || 'noreply@skyline.example.com',
        to,
        subject,
        text,
        html
      });
    } catch (smtpErr) {
      console.error('SMTP transmission error:', smtpErr);
    }
  }
}
