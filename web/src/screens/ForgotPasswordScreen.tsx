import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  Sun,
  Moon,
  KeyRound,
  Check,
} from 'lucide-react';
import { supabaseService } from '../services/supabase';

interface ForgotPasswordScreenProps {
  onBackToLogin: () => void;
  onPasswordResetSuccess?: () => void;
  initialEmail?: string;
  forcedMode?: 'request' | 'update';
}

export const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({
  onBackToLogin,
  onPasswordResetSuccess,
  initialEmail = '',
  forcedMode,
}) => {
  // Determine if URL indicates we are in recovery mode (user clicked email link)
  const isRecoveryUrl =
    typeof window !== 'undefined' &&
    (window.location.hash.includes('type=recovery') ||
      window.location.hash.includes('reset-password') ||
      window.location.search.includes('type=recovery'));

  const [mode, setMode] = useState<'request' | 'update'>(
    forcedMode || (isRecoveryUrl ? 'update' : 'request')
  );

  // Request mode state
  const [email, setEmail] = useState(initialEmail);
  const [isRequestLoading, setIsRequestLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Update mode state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isUpdateLoading, setIsUpdateLoading] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Theme State
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true
  );

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  };

  // Resend cooldown timer countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // Password strength calculation
  const getPasswordStrength = () => {
    if (!newPassword) return { score: 0, label: '', color: '' };
    let score = 0;
    if (newPassword.length >= 6) score++;
    if (newPassword.length >= 8) score++;
    if (/[A-Z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;

    if (score <= 2) return { score, label: 'Weak', color: 'bg-red-500 text-red-500' };
    if (score <= 4) return { score, label: 'Moderate', color: 'bg-amber-500 text-amber-500' };
    return { score, label: 'Strong', color: 'bg-emerald-500 text-emerald-500' };
  };

  const strength = getPasswordStrength();
  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;

  // Handle Send Reset Email
  const handleSendRecoveryEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setRequestError('Please enter a valid email address.');
      return;
    }

    setIsRequestLoading(true);
    setRequestError(null);

    try {
      await supabaseService.resetPassword(cleanEmail);
      setRequestSent(true);
      setResendCooldown(60);
    } catch (err: any) {
      setRequestError(err.message || 'Failed to dispatch password recovery link. Please try again.');
    } finally {
      setIsRequestLoading(false);
    }
  };

  // Handle Set New Password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setUpdateError('Password must contain at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setUpdateError('Passwords do not match.');
      return;
    }

    setIsUpdateLoading(true);
    setUpdateError(null);

    try {
      await supabaseService.updatePassword(newPassword);
      setUpdateSuccess(true);
    } catch (err: any) {
      setUpdateError(err.message || 'Failed to update password. Your reset link may have expired.');
    } finally {
      setIsUpdateLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between text-slate-100 relative overflow-hidden font-sans selection:bg-brand-primary selection:text-white">
      {/* Background Glow Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-600/15 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-brand-primary/15 blur-[120px] pointer-events-none" />
      <div className="absolute top-[35%] right-[20%] w-[350px] h-[350px] rounded-full bg-purple-600/10 blur-[100px] pointer-events-none" />

      {/* Top Navigation Bar */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-primary via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-brand-primary/25 border border-white/10">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              MOCK.AI
            </h1>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block -mt-1">
              Smart Exam Engine
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            aria-label="Toggle Theme"
            className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800/80 backdrop-blur-md transition-all"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-300" />}
          </button>
          <button
            onClick={onBackToLogin}
            className="inline-flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800/80 backdrop-blur-md transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sign In</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800/90 backdrop-blur-2xl rounded-3xl p-8 shadow-2xl shadow-black/80 relative">
          
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* MODE 1: REQUEST RECOVERY EMAIL                                     */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {mode === 'request' && (
            <div>
              {!requestSent ? (
                <>
                  <div className="text-center mb-7">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 text-brand-primary mb-4 shadow-inner">
                      <KeyRound className="w-7 h-7" />
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
                      Reset Your Password
                    </h2>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                      Enter the email address registered with your account and we'll dispatch an instant password reset link.
                    </p>
                  </div>

                  {requestError && (
                    <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2.5 text-red-400 text-xs animate-shake">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{requestError}</span>
                    </div>
                  )}

                  <form onSubmit={handleSendRecoveryEmail} className="space-y-5">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@example.com"
                          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-700/80 bg-slate-800/80 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isRequestLoading || !email.trim()}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-brand-primary to-indigo-600 hover:from-brand-primary/90 hover:to-indigo-500 active:scale-[0.98] text-white font-semibold text-sm shadow-lg shadow-brand-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                    >
                      {isRequestLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Sending Recovery Email...</span>
                        </>
                      ) : (
                        <>
                          <span>Send Recovery Email</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    <div className="flex items-center justify-between pt-2">
                      <button
                        type="button"
                        onClick={onBackToLogin}
                        className="text-xs text-slate-400 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode('update')}
                        className="text-xs text-brand-primary hover:text-brand-accent transition-colors font-medium"
                      >
                        Already have a reset token?
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                /* Success Feedback View */
                <div className="text-center py-2">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-5">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Check Your Inbox</h3>
                  <p className="text-xs text-slate-300 mb-2 leading-relaxed">
                    We've sent a password reset link to:
                  </p>
                  <p className="text-sm font-semibold text-brand-primary bg-slate-800/80 py-1.5 px-3 rounded-lg border border-slate-700/60 inline-block mb-4">
                    {email}
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed mb-6">
                    Click the link in the email to set a new password. If you don't see it within a minute, check your spam folder.
                  </p>

                  <div className="space-y-3">
                    <button
                      type="button"
                      disabled={resendCooldown > 0 || isRequestLoading}
                      onClick={() => handleSendRecoveryEmail()}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-xs font-semibold text-slate-200 border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRequestLoading ? 'animate-spin' : ''}`} />
                      <span>
                        {resendCooldown > 0 ? `Resend email in ${resendCooldown}s` : 'Resend Recovery Email'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={onBackToLogin}
                      className="w-full py-2.5 px-4 rounded-xl bg-brand-primary/10 hover:bg-brand-primary/20 text-xs font-semibold text-brand-primary border border-brand-primary/20 transition-all"
                    >
                      Return to Sign In
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* MODE 2: SET NEW PASSWORD (RECOVERY CALLBACK)                       */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {mode === 'update' && (
            <div>
              {!updateSuccess ? (
                <>
                  <div className="text-center mb-7">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-4 shadow-inner">
                      <ShieldCheck className="w-7 h-7" />
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
                      Set New Password
                    </h2>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                      Choose a strong, unique password to secure your MOCK.AI account.
                    </p>
                  </div>

                  {updateError && (
                    <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2.5 text-red-400 text-xs animate-shake">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{updateError}</span>
                    </div>
                  )}

                  <form onSubmit={handleUpdatePassword} className="space-y-4">
                    {/* New Password */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                        New Password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="At least 6 characters"
                          className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-700/80 bg-slate-800/80 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                          {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>

                      {/* Strength Indicator */}
                      {newPassword && (
                        <div className="mt-2 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">Security strength:</span>
                            <span className={`font-semibold ${strength.color.split(' ')[1]}`}>
                              {strength.label}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex gap-1">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                strength.score >= 1 ? strength.color.split(' ')[0] : 'bg-slate-700'
                              }`}
                              style={{ width: '33.33%' }}
                            />
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                strength.score >= 3 ? strength.color.split(' ')[0] : 'bg-slate-700'
                              }`}
                              style={{ width: '33.33%' }}
                            />
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                strength.score >= 5 ? strength.color.split(' ')[0] : 'bg-slate-700'
                              }`}
                              style={{ width: '33.33%' }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Confirm Password */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter your new password"
                          className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-700/80 bg-slate-800/80 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>

                      {confirmPassword && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                          {passwordsMatch ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400 font-medium">Passwords match</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                              <span className="text-red-400 font-medium">Passwords do not match</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isUpdateLoading || !passwordsMatch || newPassword.length < 6}
                      className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 active:scale-[0.98] text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                    >
                      {isUpdateLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Updating Password...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>Save & Sign In</span>
                        </>
                      )}
                    </button>

                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => setMode('request')}
                        className="text-xs text-slate-400 hover:text-white transition-colors"
                      >
                        Request another link instead
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                /* Update Success View */
                <div className="text-center py-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-5">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Password Successfully Updated!</h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-6 max-w-xs mx-auto">
                    Your account has been secured with your new password. You can now continue your learning journey.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      if (onPasswordResetSuccess) {
                        onPasswordResetSuccess();
                      } else {
                        onBackToLogin();
                      }
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-brand-primary to-indigo-600 hover:from-brand-primary/90 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-brand-primary/25 transition-all flex items-center justify-center gap-2"
                  >
                    <span>Continue to MOCK.AI</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto px-6 py-6 text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} MOCK.AI — All-in-One AI Exam & Test Preparation Platform.
      </footer>
    </div>
  );
};
