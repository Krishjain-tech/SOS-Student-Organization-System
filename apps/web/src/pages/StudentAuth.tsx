import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, CheckCircle2, AlertCircle, ArrowLeft, Loader2, Sparkles, User, Lock, Phone } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { WorkspaceLogo } from '../App';

export function StudentRegister() {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }

    setLoading(true);
    try {
      await api('/auth/register/student', 'POST', {
        name,
        email,
        phone,
        password,
        confirmPassword
      });
      nav(`/student/check-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch (err: any) {
      setError(err?.message || 'Unable to register. Please check your information.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: '440px' }}>
        <Link className="brand" to="/login">
          <WorkspaceLogo />
        </Link>
        <span className="eyebrow">Student workspace</span>
        <h1>Create your account</h1>
        <p className="muted">Join Skyline Student Association to explore campus events, access member perks, and get student tickets.</p>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#991b1b', margin: '14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
          <div>
            <label htmlFor="reg-name" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
              Full name
            </label>
            <input
              id="reg-name"
              type="text"
              required
              placeholder="e.g. Aarav Patel"
              value={name}
              onChange={e => setName(e.target.value)}
              className="full-width"
              style={{ width: '100%', padding: '9px 12px', fontSize: '14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none' }}
            />
          </div>

          <div>
            <label htmlFor="reg-email" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
              Email address
            </label>
            <input
              id="reg-email"
              type="email"
              required
              placeholder="you@campus.example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="full-width"
              style={{ width: '100%', padding: '9px 12px', fontSize: '14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none' }}
            />
          </div>

          <div>
            <label htmlFor="reg-phone" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
              Phone number
            </label>
            <input
              id="reg-phone"
              type="tel"
              required
              placeholder="+91 98765 43210"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="full-width"
              style={{ width: '100%', padding: '9px 12px', fontSize: '14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none' }}
            />
          </div>

          <div>
            <label htmlFor="reg-password" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
              Password (min. 12 characters)
            </label>
            <input
              id="reg-password"
              type="password"
              required
              minLength={12}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="full-width"
              style={{ width: '100%', padding: '9px 12px', fontSize: '14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none' }}
            />
          </div>

          <div>
            <label htmlFor="reg-confirm-password" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
              Confirm password
            </label>
            <input
              id="reg-confirm-password"
              type="password"
              required
              minLength={12}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="full-width"
              style={{ width: '100%', padding: '9px 12px', fontSize: '14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '11px', background: '#1463D8', color: '#ffffff', fontWeight: 700, fontSize: '14px', borderRadius: '8px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'background 0.2s', marginTop: '6px' }}
          >
            {loading ? 'Creating account…' : 'Create Student Account'}
          </button>
        </form>

        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px' }}>
          <span style={{ color: '#64748b' }}>Already have an account? </span>
          <Link to="/login" style={{ color: '#1463D8', fontWeight: 600, textDecoration: 'none' }}>
            Sign in
          </Link>
        </div>
      </div>
      <p className="login-footer">A brighter campus starts with a connected community.</p>
    </div>
  );
}

export function StudentCheckEmail() {
  const [params] = useSearchParams();
  const email = params.get('email') || '';
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    setMessage(null);
    try {
      await api('/auth/resend-verification', 'POST', { email });
      setMessage('A fresh verification link has been dispatched to your email.');
    } catch {
      setMessage('If an eligible account exists, a verification email has been sent.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: '440px', textAlign: 'center' }}>
        <Link className="brand" to="/login">
          <WorkspaceLogo />
        </Link>
        <div style={{ width: '56px', height: '56px', background: '#eff6ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '16px auto 8px', color: '#1463D8' }}>
          <Mail size={28} />
        </div>
        <h1>Check your email</h1>
        <p className="muted" style={{ margin: '8px 0 16px' }}>
          We sent a verification link to {email ? <strong>{email}</strong> : 'your email address'}. Please check your inbox and click the link to activate your student account.
        </p>

        {message && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#166534', margin: '14px 0' }}>
            {message}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
          {email && (
            <button
              onClick={handleResend}
              disabled={resending}
              style={{ width: '100%', padding: '10px', background: '#f1f5f9', color: '#1e293b', fontWeight: 600, fontSize: '13px', borderRadius: '8px', border: '1px solid #cbd5e1', cursor: resending ? 'not-allowed' : 'pointer' }}
            >
              {resending ? 'Sending…' : 'Resend verification email'}
            </button>
          )}

          <Link
            to="/login"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#1463D8', fontSize: '13px', fontWeight: 600, textDecoration: 'none', padding: '8px' }}
          >
            <ArrowLeft size={15} /> Back to sign in
          </Link>
        </div>
      </div>
      <p className="login-footer">A brighter campus starts with a connected community.</p>
    </div>
  );
}

export function StudentVerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState<'verifying' | 'success' | 'failure'>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const verifiedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState('failure');
      setErrorMsg('No verification token provided.');
      return;
    }

    if (verifiedTokenRef.current === token) return;
    verifiedTokenRef.current = token;

    api('/auth/verify-email', 'POST', { token })
      .then(() => {
        setState('success');
      })
      .catch((err: any) => {
        setState('failure');
        setErrorMsg(err?.message || 'This verification link is invalid or has expired.');
      });
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) return;
    setResending(true);
    setResendMsg(null);
    try {
      await api('/auth/resend-verification', 'POST', { email: resendEmail });
      setResendMsg('If an eligible account exists, a new verification link was sent.');
    } catch {
      setResendMsg('If an eligible account exists, a new verification link was sent.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: '440px', textAlign: 'center' }}>
        <Link className="brand" to="/login">
          <WorkspaceLogo />
        </Link>

        {state === 'verifying' && (
          <div style={{ padding: '24px 0' }}>
            <Loader2 size={36} className="animate-spin" style={{ margin: '0 auto 16px', color: '#1463D8' }} />
            <h1>Verifying your email…</h1>
            <p className="muted">Please wait while we confirm your account details.</p>
          </div>
        )}

        {state === 'success' && (
          <div>
            <div style={{ width: '56px', height: '56px', background: '#ecfdf5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '16px auto 8px', color: '#059669' }}>
              <CheckCircle2 size={32} />
            </div>
            <h1>Email verified successfully</h1>
            <p className="muted" style={{ margin: '8px 0 20px' }}>
              Your email address has been verified. You can now sign in to your Student Workspace.
            </p>
            <Link
              to="/login"
              style={{ display: 'block', width: '100%', padding: '11px', background: '#1463D8', color: '#ffffff', fontWeight: 700, fontSize: '14px', borderRadius: '8px', textDecoration: 'none', textAlign: 'center', boxSizing: 'border-box' }}
            >
              Sign in to Student Workspace
            </Link>
          </div>
        )}

        {state === 'failure' && (
          <div>
            <div style={{ width: '56px', height: '56px', background: '#fef2f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '16px auto 8px', color: '#dc2626' }}>
              <AlertCircle size={32} />
            </div>
            <h1>Verification failed</h1>
            <p className="muted" style={{ margin: '8px 0 16px' }}>
              {errorMsg || 'This verification link is invalid or has expired.'}
            </p>

            {resendMsg && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#166534', margin: '14px 0' }}>
                {resendMsg}
              </div>
            )}

            <form onSubmit={handleResend} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', textAlign: 'left' }}>
              <label htmlFor="resend-email" style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>
                Resend verification email
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  id="resend-email"
                  type="email"
                  required
                  placeholder="Your email address"
                  value={resendEmail}
                  onChange={e => setResendEmail(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                />
                <button
                  type="submit"
                  disabled={resending}
                  style={{ padding: '8px 14px', background: '#1463D8', color: '#ffffff', fontWeight: 600, fontSize: '13px', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  {resending ? 'Sending…' : 'Resend'}
                </button>
              </div>
            </form>

            <div style={{ marginTop: '18px' }}>
              <Link to="/login" style={{ color: '#64748b', fontSize: '13px', textDecoration: 'none' }}>
                ← Back to sign in
              </Link>
            </div>
          </div>
        )}
      </div>
      <p className="login-footer">A brighter campus starts with a connected community.</p>
    </div>
  );
}
