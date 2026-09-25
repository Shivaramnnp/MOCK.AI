import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Lock,
  Mail,
  User,
  Phone,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  GraduationCap,
  School,
  BookOpen,
  ChevronRight,
  Sun,
  Moon,
  Check,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import { supabaseService } from '../services/supabase';
import { UserProfile, UserRole } from '../types';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';

interface AuthScreenProps {
  onAuthSuccess: (user: UserProfile) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'verify_otp'>('login');

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneWarning, setPhoneWarning] = useState<string | null>(null);
  const [phoneChecking, setPhoneChecking] = useState(false);
  const [role, setRole] = useState<UserRole>('LEARNER');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Status & Feedback State
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'github' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // OTP Verification State
  const [otpCode, setOtpCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [isOtpLoading, setIsOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSuccess, setOtpSuccess] = useState<string | null>(null);
  const [otpCooldown, setOtpCooldown] = useState(0);

  // Forgot Password Modal State (retained for backward compatibility)
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState<string | null>(null);
  const [isForgotLoading, setIsForgotLoading] = useState(false);

  // Theme State
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  // Resend cooldown timer countdown
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const interval = setInterval(() => {
      setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [otpCooldown]);

  // Debounced real-time phone uniqueness check (signup mode only)
  useEffect(() => {
    if (mode !== 'signup' || !phone.trim() || phone.replace(/\D/g, '').length < 7) {
      setPhoneWarning(null);
      setPhoneChecking(false);
      return;
    }
    setPhoneChecking(true);
    setPhoneWarning(null);
    const timer = setTimeout(async () => {
      try {
        const { exists } = await supabaseService.checkPhoneExists(phone);
        if (exists) {
          setPhoneWarning('⚠️ This mobile number is already registered. Please use a different number or sign in.');
        } else {
          setPhoneWarning(null);
        }
      } catch {
        setPhoneWarning(null);
      } finally {
        setPhoneChecking(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [phone, mode]);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  };

  // Password strength calculation
  const getPasswordStrength = () => {
    if (!password) return { level: 0, label: '', color: '' };
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 2) return { level: 1, label: 'Weak', color: 'bg-red-500' };
    if (score <= 4) return { level: 2, label: 'Moderate', color: 'bg-amber-500' };
    return { level: 3, label: 'Strong', color: 'bg-emerald-500' };
  };

  const strength = getPasswordStrength();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { user } = await supabaseService.signIn(email.trim(), password);
      onAuthSuccess(user);
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('email not confirmed')) {
        setPendingEmail(email.trim());
        setMode('verify_otp');
        setOtpCooldown(60);
        try {
          await supabaseService.resendOtp(email.trim(), 'signup');
        } catch {}
        return;
      }
      setErrorMessage(err.message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please fill in your email and password.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }
    if (confirmPassword && password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify your password.');
      return;
    }
    // Phone field: required and must be valid
    if (!phone.trim()) {
      setErrorMessage('Please enter your mobile number.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setErrorMessage('Please enter a valid 10-digit mobile number.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    // Inline phone uniqueness check (authoritative, not relying on debounced state)
    try {
      const { exists } = await supabaseService.checkPhoneExists(phone.trim());
      if (exists) {
        setErrorMessage('This mobile number is already registered. Please use a different number or sign in to your existing account.');
        setIsLoading(false);
        return;
      }
    } catch {
      // Non-fatal — let signUp itself catch duplicates via DB constraint
    }

    try {
      const { user, confirmationRequired } = await supabaseService.signUp(email.trim(), password, {
        fullName: fullName.trim(),
        role,
        phone: phone.trim(),
      });

      if (confirmationRequired) {
        setPendingEmail(email.trim());
        setMode('verify_otp');
        setOtpCooldown(60);
        setOtpError(null);
        setOtpSuccess(`A confirmation code has been sent to ${email.trim()}. Check your inbox (and spam folder).`);
      } else {
        onAuthSuccess(user);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create account.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = otpCode.trim();
    if (cleanCode.length < 6) {
      setOtpError('Please enter the full verification code.');
      return;
    }

    setIsOtpLoading(true);
    setOtpError(null);

    try {
      const { user } = await supabaseService.verifyEmailOtp(pendingEmail || email, cleanCode, 'signup');
      setOtpSuccess('Email verified successfully!');
      setTimeout(() => {
        onAuthSuccess(user);
      }, 500);
    } catch (err: any) {
      setOtpError(err.message || 'Invalid or expired verification code. Please check your email or request a new code.');
    } finally {
      setIsOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpCooldown > 0 || isOtpLoading) return;
    setIsOtpLoading(true);
    setOtpError(null);

    try {
      await supabaseService.resendOtp(pendingEmail || email, 'signup');
      setOtpCooldown(60);
      setOtpSuccess('A fresh verification code has been dispatched to your email.');
    } catch (err: any) {
      setOtpError(err.message || 'Failed to resend code. Please try again.');
    } finally {
      setIsOtpLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    setOauthLoading(provider);
    setErrorMessage(null);
    try {
      const res = await supabaseService.signInWithOAuth(provider);
      if (res.user) {
        onAuthSuccess(res.user);
      }
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to sign in with ${provider}.`);
    } finally {
      setOauthLoading(null);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    setIsForgotLoading(true);
    try {
      const res = await supabaseService.resetPassword(forgotEmail.trim());
      setForgotStatus(res.message);
    } catch (err: any) {
      setForgotStatus(err.message || 'Failed to send reset link.');
    } finally {
      setIsForgotLoading(false);
    }
  };

  if (mode === 'forgot') {
    return (
      <ForgotPasswordScreen
        initialEmail={email}
        onBackToLogin={() => setMode('login')}
        onPasswordResetSuccess={() => setMode('login')}
      />
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col lg:grid lg:grid-cols-12 bg-surface dark:bg-[#0A0C13] text-surface-text dark:text-darkSurface-text selection:bg-brand-primary selection:text-white transition-colors duration-200">
      {/* ── Theme Toggle Button (Top Right) ──────────────────────────── */}
      <button
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="absolute top-5 right-5 z-30 p-2.5 rounded-2xl border border-surface-border dark:border-white/10 bg-white/80 dark:bg-white/5 backdrop-blur-md text-surface-muted hover:text-surface-text shadow-sm hover:scale-105 transition-all"
        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
      </button>

      {/* ── Left Hero Panel (Desktop Branding) ───────────────────────── */}
      <div className="hidden lg:flex lg:col-span-5 relative flex-col justify-between p-12 bg-gradient-to-br from-[#0F1322] via-[#141A30] to-[#1C2342] text-white border-r border-white/10 overflow-hidden">
        {/* Ambient Light Orbs */}
        <div className="absolute top-0 -left-20 w-96 h-96 bg-brand-primary/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-0 w-80 h-80 bg-brand-variant/20 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Header */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-primary to-brand-variant flex items-center justify-center text-white font-black text-2xl shadow-glow">
              M
            </div>
            <div>
              <span className="font-display font-black text-2xl tracking-tight bg-gradient-to-r from-brand-primary via-purple-300 to-brand-variant bg-clip-text text-transparent">
                MOCK.AI
              </span>
              <span className="text-[10px] ml-2 font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-brand-primary/20 text-blue-300 border border-brand-primary/30">
                PRO STUDIO
              </span>
              <p className="text-xs text-gray-400">Focused Scholar AI Platform</p>
            </div>
          </div>

          <div className="mt-12 space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-blue-200">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Next-Gen Competitive Exam Engine</span>
            </div>
            <h1 className="text-3xl xl:text-4xl font-display font-extrabold leading-tight text-white">
              Turn Any Study Material Into Verified Mock Exams
            </h1>
            <p className="text-sm text-gray-300 leading-relaxed max-w-md">
              Ingest textbooks, PDFs, lecture audio, or YouTube links. Get adaptive questions, instant LaTeX derivations, and classroom management backed by high-availability cloud infrastructure.
            </p>
          </div>
        </div>

        {/* Feature Badges */}
        <div className="relative z-10 space-y-3.5 my-8">
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10">
            <div className="w-9 h-9 rounded-xl bg-brand-primary/20 flex items-center justify-center text-blue-400 font-bold">
              📄
            </div>
            <div className="text-xs">
              <p className="font-bold text-white">10 Multi-Source Pipelines</p>
              <p className="text-gray-400">PDF, Word, YouTube, Camera Scan, Voice & Topics</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
              🎯
            </div>
            <div className="text-xs">
              <p className="font-bold text-white">Adaptive Learning Analytics</p>
              <p className="text-gray-400">Weak spot detection, LaTeX math formulas & streak tracking</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold">
              🏫
            </div>
            <div className="text-xs">
              <p className="font-bold text-white">Teacher & Student Classrooms</p>
              <p className="text-gray-400">Class codes, homework assignments & live grading</p>
            </div>
          </div>
        </div>

        {/* Footer Guarantee */}
        <div className="relative z-10 pt-6 border-t border-white/10 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>256-Bit SSL Encrypted & Protected</span>
          </div>
          <span className="font-mono text-[11px] text-gray-500">Enterprise Edition</span>
        </div>
      </div>

      {/* ── Right Authentication Panel ───────────────────────────────── */}
      <div className="flex-1 lg:col-span-7 flex flex-col justify-center items-center p-4 sm:p-8 lg:p-12">
        {/* Mobile Brand Top Header */}
        <div className="lg:hidden flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-primary to-brand-variant flex items-center justify-center text-white font-black text-xl shadow-glow">
            M
          </div>
          <div>
            <span className="font-display font-black text-xl bg-gradient-to-r from-brand-primary to-brand-variant bg-clip-text text-transparent">
              MOCK.AI
            </span>
            <span className="text-[10px] ml-1.5 font-bold uppercase px-2 py-0.5 rounded bg-brand-primary/10 text-brand-primary">
              PRO
            </span>
          </div>
        </div>

        {/* ── Card Container ─────────────────────────────────────────── */}
        <div className="w-full max-w-md bg-white dark:bg-[#111420]/90 border border-surface-border dark:border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-xl dark:shadow-2xl space-y-5">
          {mode === 'verify_otp' ? (
            <div className="space-y-5">
              {/* Header */}
              <div className="text-center space-y-2">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shadow-inner">
                  <KeyRound className="w-7 h-7" />
                </div>
                <h2 className="text-2xl font-display font-extrabold text-surface-text dark:text-darkSurface-text tracking-tight">
                  Verify Your Email
                </h2>
                <p className="text-xs sm:text-sm text-surface-muted dark:text-darkSurface-muted leading-relaxed">
                  We sent a confirmation code to{' '}
                  <span className="font-semibold text-brand-primary break-all">{pendingEmail || email}</span>. Enter the code below to complete your registration.
                </p>
              </div>

              {/* Info notice about email delivery delays */}
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Didn't receive the code? Check your <strong>spam/junk</strong> folder. Delivery may take 1–2 minutes. If it never arrives, use <strong>Resend</strong> below or try <strong>Continue with Google</strong>.
                </span>
              </div>

              {/* Error & Success Feedback Alerts */}
              {otpError && (
                <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/25 text-brand-red text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{otpError}</span>
                </div>
              )}

              {otpSuccess && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-brand-green text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{otpSuccess}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-2 text-center">
                    Verification Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoFocus
                    required
                    value={otpCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setOtpCode(val);
                      if (otpError) setOtpError(null);
                    }}
                    placeholder="• • • • • •"
                    className="w-full text-center text-2xl tracking-[0.4em] font-mono py-3 px-4 rounded-2xl border-2 border-surface-border dark:border-white/10 bg-white dark:bg-white/[0.03] text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all shadow-sm font-bold"
                  />
                  <p className="text-[11px] text-surface-muted text-center mt-2">
                    Check your spam/junk folder if the code doesn't appear within 1 minute.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isOtpLoading || otpCode.trim().length < 6}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-brand-primary to-brand-variant text-white font-bold text-sm shadow-glow hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isOtpLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Verify & Complete Signup</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Resend & Back actions */}
              <div className="pt-2 border-t border-surface-border dark:border-white/10 flex flex-col gap-2.5 text-center text-xs">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={otpCooldown > 0 || isOtpLoading}
                  className="inline-flex items-center justify-center gap-1.5 font-bold text-brand-primary hover:text-brand-variant disabled:text-surface-muted transition-colors py-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isOtpLoading ? 'animate-spin' : ''}`} />
                  {otpCooldown > 0
                    ? `Resend code in ${otpCooldown}s`
                    : 'Resend Verification Code'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setEmail(pendingEmail || email);
                    setOtpCode('');
                    setOtpError(null);
                    setOtpSuccess(null);
                    setErrorMessage(null);
                  }}
                  className="inline-flex items-center justify-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold hover:underline transition-colors py-1"
                >
                  Already confirmed? Try signing in →
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setOtpCode('');
                    setOtpError(null);
                    setOtpSuccess(null);
                  }}
                  className="text-surface-muted hover:text-surface-text transition-colors py-1"
                >
                  ← Change email address or go back
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Header Title */}
              <div>
                <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-surface-text dark:text-darkSurface-text tracking-tight">
                  {mode === 'login' ? 'Welcome Back, Scholar' : 'Create Your Account'}
                </h2>
                <p className="text-xs sm:text-sm text-surface-muted dark:text-darkSurface-muted mt-1.5">
                  {mode === 'login'
                    ? 'Sign in with your credentials to access your mock exams and classes.'
                    : 'Join thousands of students and teachers accelerating their exam mastery.'}
                </p>
              </div>

          {/* Mode Switcher Tabs */}
          <div className="flex p-1 rounded-2xl bg-surface-elev2 dark:bg-white/[0.04] border border-surface-border dark:border-white/10">
            <button
              onClick={() => {
                setMode('login');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                mode === 'login'
                  ? 'bg-white dark:bg-darkSurface-elev2 text-brand-primary shadow-sm'
                  : 'text-surface-muted hover:text-surface-text'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setMode('signup');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                mode === 'signup'
                  ? 'bg-white dark:bg-darkSurface-elev2 text-brand-primary shadow-sm'
                  : 'text-surface-muted hover:text-surface-text'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Error & Success Feedback Alerts */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/25 text-brand-red text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-brand-green text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* ── Form ─────────────────────────────────────────────────── */}
          <form onSubmit={mode === 'login' ? handleSignIn : handleSignUp} className="space-y-3.5">
            {/* Full Name (Sign Up only) */}
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1">
                  Full Name:
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-surface-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-surface-border dark:border-white/10 bg-white dark:bg-white/[0.03] text-sm text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary transition-colors shadow-sm"
                  />
                </div>
              </div>
            )}

            {/* Email Field */}
            <div>
              <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1">
                Email Address:
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-surface-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-surface-border dark:border-white/10 bg-white dark:bg-white/[0.03] text-sm text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary transition-colors shadow-sm"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider">
                  Password:
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email);
                      setShowForgotModal(true);
                    }}
                    className="text-xs text-brand-primary hover:text-brand-variant font-semibold"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>

              <div className="relative">
                <Lock className="w-4 h-4 text-surface-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder={mode === 'login' ? '••••••••' : 'At least 6 characters'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-11 py-2.5 rounded-2xl border border-surface-border dark:border-white/10 bg-white dark:bg-white/[0.03] text-sm text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary transition-colors shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-surface-muted hover:text-surface-text p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password Strength Indicator (Sign Up only) */}
              {mode === 'signup' && password && (
                <div className="mt-1.5 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-surface-muted">Password strength:</span>
                    <span className="font-bold">{strength.label}</span>
                  </div>
                  <div className="h-1.5 w-full bg-surface-elev2 dark:bg-white/10 rounded-full overflow-hidden flex gap-1">
                    <div className={`h-full flex-1 rounded-full ${strength.level >= 1 ? strength.color : 'bg-transparent'}`} />
                    <div className={`h-full flex-1 rounded-full ${strength.level >= 2 ? strength.color : 'bg-transparent'}`} />
                    <div className={`h-full flex-1 rounded-full ${strength.level >= 3 ? strength.color : 'bg-transparent'}`} />
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password Field (Sign Up only) */}
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1">
                  Confirm Password:
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-surface-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-11 py-2.5 rounded-2xl border border-surface-border dark:border-white/10 bg-white dark:bg-white/[0.03] text-sm text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary transition-colors shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-surface-muted hover:text-surface-text p-1"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && (
                  <div className="mt-1 flex items-center gap-1 text-[11px]">
                    {password === confirmPassword ? (
                      <span className="text-emerald-500 flex items-center gap-1 font-medium">
                        <Check className="w-3.5 h-3.5" /> Passwords match
                      </span>
                    ) : (
                      <span className="text-red-500 font-medium">Passwords do not match</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Mobile Number Field (Sign Up only) */}
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mb-1">
                  Mobile Number: <span className="text-brand-red normal-case font-semibold">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-surface-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => {
                      // Allow digits, spaces, +, -, ()
                      const val = e.target.value.replace(/[^\d\s\+\-\(\)]/g, '').slice(0, 15);
                      setPhone(val);
                    }}
                    className={`w-full pl-10 pr-9 py-2.5 rounded-2xl border text-sm text-surface-text dark:text-darkSurface-text bg-white dark:bg-white/[0.03] focus:outline-none transition-colors shadow-sm ${
                      phoneWarning
                        ? 'border-amber-400 dark:border-amber-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20'
                        : 'border-surface-border dark:border-white/10 focus:border-brand-primary'
                    }`}
                  />
                  {/* Spinner while checking */}
                  {phoneChecking && (
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                  )}
                  {/* Green tick when valid and unique */}
                  {!phoneChecking && !phoneWarning && phone.replace(/\D/g, '').length >= 10 && (
                    <Check className="w-3.5 h-3.5 text-emerald-500 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  )}
                </div>
                {/* Duplicate warning */}
                {phoneWarning && (
                  <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{phoneWarning}</span>
                  </div>
                )}
              </div>
            )}

            {/* Role Selection Cards (Sign Up only) */}
            {mode === 'signup' && (
              <div className="space-y-1.5 pt-1">
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider">
                  Select Your Primary Role:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('LEARNER')}
                    className={`p-2 rounded-2xl border text-center transition-all ${
                      role === 'LEARNER'
                        ? 'border-brand-primary bg-brand-primary/10 text-brand-primary font-bold shadow-sm'
                        : 'border-surface-border dark:border-white/10 bg-white dark:bg-white/[0.02] text-surface-muted hover:border-brand-primary/40'
                    }`}
                  >
                    <span className="text-lg block">📖</span>
                    <span className="text-xs font-bold block mt-0.5">Learner</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('STUDENT')}
                    className={`p-2 rounded-2xl border text-center transition-all ${
                      role === 'STUDENT'
                        ? 'border-brand-primary bg-brand-primary/10 text-brand-primary font-bold shadow-sm'
                        : 'border-surface-border dark:border-white/10 bg-white dark:bg-white/[0.02] text-surface-muted hover:border-brand-primary/40'
                    }`}
                  >
                    <span className="text-lg block">🎓</span>
                    <span className="text-xs font-bold block mt-0.5">Student</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('TEACHER')}
                    className={`p-2 rounded-2xl border text-center transition-all ${
                      role === 'TEACHER'
                        ? 'border-brand-primary bg-brand-primary/10 text-brand-primary font-bold shadow-sm'
                        : 'border-surface-border dark:border-white/10 bg-white dark:bg-white/[0.02] text-surface-muted hover:border-brand-primary/40'
                    }`}
                  >
                    <span className="text-lg block">👨‍🏫</span>
                    <span className="text-xs font-bold block mt-0.5">Teacher</span>
                  </button>
                </div>
              </div>
            )}

            {/* Remember Me Checkbox (Login mode) */}
            {mode === 'login' && (
              <div className="flex items-center gap-2 pt-0.5">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-surface-border text-brand-primary focus:ring-brand-primary w-4 h-4 cursor-pointer"
                />
                <label htmlFor="remember" className="text-xs text-surface-muted select-none cursor-pointer">
                  Remember my session on this device
                </label>
              </div>
            )}

            {/* Terms of Service & Privacy Policy Notice */}
            <p className="text-[11px] text-center text-surface-muted dark:text-darkSurface-muted leading-relaxed pt-1">
              By continuing, you agree to MOCK.AI's{' '}
              <a href="#" onClick={(e) => e.preventDefault()} className="text-brand-primary hover:underline font-medium">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="#" onClick={(e) => e.preventDefault()} className="text-brand-primary hover:underline font-medium">
                Privacy Policy
              </a>.
            </p>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-brand-primary to-brand-variant text-white font-bold text-sm shadow-glow hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* ── Social OAuth (Continue with Google & GitHub) ──────────── */}
          <div className="space-y-3 pt-1 border-t border-surface-border dark:border-white/10">
            <div className="relative flex py-0.5 items-center">
              <div className="flex-grow border-t border-surface-border dark:border-white/10" />
              <span className="flex-shrink mx-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-surface-muted">
                Or continue with
              </span>
              <div className="flex-grow border-t border-surface-border dark:border-white/10" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleOAuthLogin('google')}
                disabled={oauthLoading !== null}
                className="w-full py-2.5 px-3.5 rounded-2xl border border-surface-border dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-surface-elev2 dark:hover:bg-white/[0.08] text-xs font-semibold text-surface-text dark:text-darkSurface-text transition-all shadow-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              >
                {oauthLoading === 'google' ? (
                  <div className="w-4 h-4 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                )}
                <span>Continue with Google</span>
              </button>

              <button
                type="button"
                onClick={() => handleOAuthLogin('github')}
                disabled={oauthLoading !== null}
                className="w-full py-2.5 px-3.5 rounded-2xl border border-surface-border dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-surface-elev2 dark:hover:bg-white/[0.08] text-xs font-semibold text-surface-text dark:text-darkSurface-text transition-all shadow-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              >
                {oauthLoading === 'github' ? (
                  <div className="w-4 h-4 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4 shrink-0 fill-current text-surface-text dark:text-white" viewBox="0 0 24 24">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    />
                  </svg>
                )}
                <span>Continue with GitHub</span>
              </button>
            </div>

            {/* ── Switch Mode Prompt ──────────────────────────────────── */}
            <div className="pt-2 text-center text-xs text-surface-muted dark:text-darkSurface-muted">
              {mode === 'login' ? (
                <span>
                  Don't have an account yet?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="font-bold text-brand-primary hover:text-brand-variant transition-colors"
                  >
                    Create an account
                  </button>
                </span>
              ) : (
                <span>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="font-bold text-brand-primary hover:text-brand-variant transition-colors"
                  >
                    Sign in to your account
                  </button>
                </span>
              )}
            </div>
          </div>
          </>
        )}
        </div>

        {/* ── Production Trust & Compliance Footer ───────────────────── */}
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-surface-muted/70">
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-surface-text transition-colors">
              Privacy Policy
            </a>
            <span>•</span>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-surface-text transition-colors">
              Terms of Service
            </a>
            <span>•</span>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-surface-text transition-colors">
              System Status
            </a>
            <span>•</span>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-surface-text transition-colors">
              Security Compliance
            </a>
          </div>
          <p className="text-[11px] text-surface-muted/50">
            © {new Date().getFullYear()} MOCK.AI Inc. All rights reserved.
          </p>
        </div>
      </div>

      {/* ── Forgot Password Modal ────────────────────────────────────── */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-[#151928] rounded-3xl border border-surface-border dark:border-white/10 p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-xl text-surface-text dark:text-darkSurface-text">
              Reset Your Password
            </h3>
            <p className="text-xs text-surface-muted">
              Enter your registered email address to receive secure recovery instructions.
            </p>

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-surface-muted uppercase tracking-wider mb-1">
                  Email Address:
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-surface-border dark:border-white/10 bg-surface-elev2 dark:bg-white/[0.04] text-sm text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
                />
              </div>

              {forgotStatus && (
                <p className="text-xs font-medium text-brand-primary">{forgotStatus}</p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-surface-muted hover:text-surface-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isForgotLoading}
                  className="px-5 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold shadow-md hover:brightness-110 disabled:opacity-50"
                >
                  {isForgotLoading ? 'Sending...' : 'Send Recovery Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
