import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Mail,
  Lock,
  User as UserIcon,
  Phone,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

type AuthMode = 'login' | 'register' | 'reset';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthModal({
  isOpen,
  initialMode = 'login',
  onClose,
  onAuthSuccess,
}: {
  isOpen: boolean;
  initialMode?: AuthMode;
  onClose: () => void;
  onAuthSuccess?: () => void;
}) {
  const {
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    sendResetPassword,
    authError,
    clearAuthError,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [registeredPendingVerify, setRegisteredPendingVerify] = useState(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setInfoMsg(null);
      setLocalError(null);
      setShowPassword(false);
      setRegisteredPendingVerify(false);
      clearAuthError();
    }
  }, [isOpen, initialMode, clearAuthError]);

  if (!isOpen) return null;

  const switchMode = (next: AuthMode) => {
    clearAuthError();
    setLocalError(null);
    setInfoMsg(null);
    setShowPassword(false);
    setRegisteredPendingVerify(false);
    setMode(next);
  };

  const validateForm = (): string | null => {
    const trimmedEmail = email.trim();

    if (mode === 'register' && name.trim().length < 2) {
      return 'Please enter your full name (at least 2 characters).';
    }
    if (!trimmedEmail) {
      return 'Please enter your email address.';
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return 'Please enter a valid email address (for example, name@example.com).';
    }
    if (mode !== 'reset') {
      if (!password) {
        return 'Please enter your password.';
      }
      if (password.length < 6) {
        return 'Password must be at least 6 characters long.';
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current || submitting || googleLoading) return;
    setLocalError(null);
    setInfoMsg(null);
    clearAuthError();

    const validationError = validateForm();
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    inFlightRef.current = true;
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const ok = await loginWithEmail(email, password);
        if (ok) {
          onClose();
          onAuthSuccess?.();
        }
      } else if (mode === 'register') {
        const ok = await registerWithEmail(name, email, password, phone);
        if (ok) {
          setRegisteredPendingVerify(true);
          setInfoMsg(
            `Account created! A verification email was sent to ${email.trim()}. Verify your email to unlock service bookings and your dashboard.`
          );
        }
      } else {
        const ok = await sendResetPassword(email);
        if (ok) {
          setInfoMsg(
            `Password reset instructions have been sent to ${email.trim()}. Please check your inbox and spam folder.`
          );
        }
      }
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    if (inFlightRef.current || submitting || googleLoading) return;
    setLocalError(null);
    setInfoMsg(null);
    clearAuthError();
    inFlightRef.current = true;
    setGoogleLoading(true);
    try {
      const ok = await loginWithGoogle();
      if (ok) {
        onClose();
        onAuthSuccess?.();
      }
    } finally {
      inFlightRef.current = false;
      setGoogleLoading(false);
    }
  };

  const displayedError = localError || authError;
  const isBusy = submitting || googleLoading;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full overflow-hidden shadow-xl">
        <div className="bg-[#0B132B] px-6 py-5 flex items-center justify-between text-white">
          <div>
            <h2 className="text-lg font-bold tracking-tight">
              {mode === 'login'
                ? 'Sign in to AutoCare Garage'
                : mode === 'register'
                  ? 'Create Customer Account'
                  : 'Reset Password'}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              {mode === 'register'
                ? 'Default registration creates a customer profile'
                : 'Customers, Mechanics, Garage Managers & Super Admin'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="text-slate-300 hover:text-white p-1 rounded disabled:opacity-50"
            aria-label="Close authentication modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {displayedError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{displayedError}</span>
            </div>
          )}

          {infoMsg && (
            <div
              role="status"
              className="space-y-2.5 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800"
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{infoMsg}</span>
              </div>
              {registeredPendingVerify && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onAuthSuccess?.();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-md transition-colors"
                >
                  <span>Continue to Email Verification</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {mode !== 'reset' && (
            <>
              <button
                type="button"
                disabled={isBusy}
                onClick={handleGoogle}
                className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors disabled:opacity-60"
              >
                {googleLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#0B132B]" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                    />
                  </svg>
                )}
                <span>{googleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
              </button>

              <div className="relative flex items-center">
                <div className="flex-grow border-t border-slate-200" />
                <span className="shrink mx-3 text-xs text-slate-400">or use email</span>
                <div className="flex-grow border-t border-slate-200" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
            {mode === 'register' && (
              <>
                <div>
                  <label htmlFor="auth-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      id="auth-name"
                      type="text"
                      autoComplete="name"
                      disabled={isBusy}
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (localError) setLocalError(null);
                      }}
                      placeholder="Aarav Sharma"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B132B] disabled:bg-slate-50"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="auth-phone" className="block text-xs font-medium text-slate-700 mb-1">
                    Phone Number (Optional)
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      id="auth-phone"
                      type="tel"
                      autoComplete="tel"
                      disabled={isBusy}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B132B] disabled:bg-slate-50"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  disabled={isBusy}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (localError) setLocalError(null);
                  }}
                  placeholder="you@example.com"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B132B] disabled:bg-slate-50"
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="auth-password" className="block text-xs font-medium text-slate-700">
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => switchMode('reset')}
                      className="text-xs text-red-600 hover:underline font-medium disabled:opacity-50"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    disabled={isBusy}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (localError) setLocalError(null);
                    }}
                    placeholder="Minimum 6 characters"
                    className="w-full pl-9 pr-10 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B132B] disabled:bg-slate-50"
                  />
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-2 p-0.5 text-slate-400 hover:text-slate-700 focus:outline-none"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isBusy}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {mode === 'login'
                      ? 'Signing In...'
                      : mode === 'register'
                        ? 'Creating Account...'
                        : 'Sending Reset Link...'}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    {mode === 'login'
                      ? 'Sign In'
                      : mode === 'register'
                        ? 'Create Customer Account'
                        : 'Send Reset Link'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-100 text-center text-xs text-slate-600">
            {mode === 'login' ? (
              <>
                New to AutoCare Garage?{' '}
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => switchMode('register')}
                  className="text-[#0B132B] font-semibold hover:underline disabled:opacity-50"
                >
                  Register as Customer
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => switchMode('login')}
                  className="text-[#0B132B] font-semibold hover:underline disabled:opacity-50"
                >
                  Back to Sign In
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
