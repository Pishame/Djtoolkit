import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ENABLE_SERVER_AUTH, apiGetGoogleStartUrl, apiSignIn, apiSignUp, apiTrace } from '../lib/apiClient';

interface LoginViewProps {
  onLogin: (payload: { email: string; remember: boolean }) => void;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVerificationSent, setShowVerificationSent] = useState(false);

  useEffect(() => {
    if (error) setError(null);
  }, [email, password, fullName, confirmPassword, isRegistering]);

  const handleGoogleLogin = async () => {
    apiTrace('auth.ui.google.click', {
      mode: isRegistering ? 'register' : 'signin',
      serverAuthEnabled: ENABLE_SERVER_AUTH,
    });
    try {
      setIsLoading(true);
      setError(null);
      if (!ENABLE_SERVER_AUTH) {
        apiTrace('auth.ui.google.blocked', { reason: 'server_auth_disabled' });
        setError('Server auth is disabled. Enable it in frontend env.');
        return;
      }
      const { url } = await apiGetGoogleStartUrl(window.location.origin);
      if (!url) throw new Error('Google login URL was not provided by server.');
      apiTrace('auth.ui.google.redirect', { hasUrl: Boolean(url), origin: window.location.origin });
      window.location.href = url;
    } catch (err) {
      apiTrace('auth.ui.google.error', {
        error: err instanceof Error ? err.message : String(err || 'unknown_error'),
      });
      setError(err instanceof Error ? err.message : 'Failed to initialize Google login.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    apiTrace('auth.ui.submit', {
      mode: isRegistering ? 'register' : 'signin',
      emailDomain: email.includes('@') ? email.split('@')[1] : '',
      serverAuthEnabled: ENABLE_SERVER_AUTH,
    });
    if (isRegistering && password !== confirmPassword) {
      apiTrace('auth.ui.validation_error', { reason: 'password_mismatch' });
      setError('Passwords do not match.');
      return;
    }
    if (!ENABLE_SERVER_AUTH) {
      apiTrace('auth.ui.validation_error', { reason: 'server_auth_disabled' });
      setError('Server auth is disabled. Enable it in frontend env.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      if (isRegistering) {
        await apiSignUp(email.trim(), password, fullName.trim());
        apiTrace('auth.ui.signup.success', { emailDomain: email.includes('@') ? email.split('@')[1] : '' });
        setShowVerificationSent(true);
      } else {
        await apiSignIn(email.trim(), password);
        apiTrace('auth.ui.signin.success', { emailDomain: email.includes('@') ? email.split('@')[1] : '' });
        onLogin({ email: email.trim(), remember });
      }
    } catch (err) {
      apiTrace('auth.ui.submit.error', {
        mode: isRegistering ? 'register' : 'signin',
        error: err instanceof Error ? err.message : String(err || 'auth_failed'),
      });
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen bg-background-light dark:bg-background-dark flex flex-col items-center justify-center p-6 relative overflow-hidden font-display">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>

      <motion.div
        key={isRegistering ? 'register' : 'login'}
        initial={{ opacity: 0, y: 20 }}
        animate={error ? { opacity: 1, y: 0, x: [0, -10, 10, -10, 10, 0] } : { opacity: 1, y: 0, x: 0 }}
        transition={error ? { duration: 0.4, ease: 'easeInOut' } : { duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-[340px] z-10"
      >
        <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-[2rem] p-5 shadow-2xl space-y-3 relative">
          {showVerificationSent ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-4 space-y-4">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-emerald-500 text-2xl">mark_email_read</span>
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-black dark:text-white uppercase tracking-tighter">Check your email</h2>
                <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 px-4">
                  We've sent a verification link to <span className="text-primary font-bold">{email}</span>. Please click the link to activate your account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowVerificationSent(false);
                  setIsRegistering(false);
                  setError(null);
                }}
                className="text-[9px] font-black uppercase tracking-widest text-primary hover:brightness-110 transition-all"
              >
                Back to Sign In
              </button>
            </motion.div>
          ) : (
            <>
              {isRegistering && (
                <button
                  type="button"
                  onClick={() => setIsRegistering(false)}
                  className="absolute top-4 left-5 flex items-center gap-2 text-slate-400 hover:text-primary transition-all group"
                  title="Back to Login"
                >
                  <div className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-50 dark:bg-white/5 group-hover:bg-primary/10 transition-all">
                    <span className="material-symbols-outlined text-[10px] group-hover:-translate-x-1 transition-transform">arrow_back</span>
                  </div>
                </button>
              )}

              <div className="text-center space-y-0.5">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20 mx-auto mb-1.5">
                  <span className="material-symbols-outlined text-white text-lg">graphic_eq</span>
                </div>
                <h1 className="text-lg font-black dark:text-white uppercase tracking-tighter">
                  {isRegistering ? 'Create Account' : 'Welcome Back'}
                </h1>
                <p className="text-[9px] font-medium text-slate-500 dark:text-slate-400">
                  {isRegistering ? 'Join the professional DJ neural network' : 'Access your professional DJ toolkit'}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-2.5">
                <div className="space-y-1.5">
                  {isRegistering && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-0.5">
                      <label className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2.5">Full Name</label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">person</span>
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="John Doe"
                          className="w-full bg-slate-50 dark:bg-white/5 border-2 border-transparent focus:border-primary/20 rounded-lg pl-9 pr-3 py-1.5 text-[11px] dark:text-white placeholder:text-slate-500 transition-all"
                        />
                      </div>
                    </motion.div>
                  )}

                  <div className="space-y-0.5">
                    <label className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2.5">Email Address</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">mail</span>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full bg-slate-50 dark:bg-white/5 border-2 border-transparent focus:border-primary/20 rounded-lg pl-9 pr-3 py-1.5 text-[11px] dark:text-white placeholder:text-slate-500 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <label className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2.5">Password</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">lock</span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-50 dark:bg-white/5 border-2 border-transparent focus:border-primary/20 rounded-lg pl-9 pr-10 py-1.5 text-[11px] dark:text-white placeholder:text-slate-500 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-xs">{showPassword ? 'visibility_off' : 'visibility'}</span>
                      </button>
                    </div>
                  </div>

                  {isRegistering && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-0.5">
                      <label className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2.5">Confirm Password</label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">lock_reset</span>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-slate-50 dark:bg-white/5 border-2 border-transparent focus:border-primary/20 rounded-lg pl-9 pr-10 py-1.5 text-[11px] dark:text-white placeholder:text-slate-500 transition-all"
                        />
                      </div>
                    </motion.div>
                  )}
                </div>

                {!isRegistering && (
                  <div className="flex items-center justify-between px-1">
                    <label className="flex items-center gap-1.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="w-2.5 h-2.5 rounded border-slate-300 dark:border-white/10 bg-transparent text-primary focus:ring-primary/20"
                      />
                      <span className="text-[7px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-400 transition-colors">Remember</span>
                    </label>
                    <button type="button" className="text-[7px] font-black uppercase tracking-widest text-primary hover:brightness-110 transition-all">Forgot?</button>
                  </div>
                )}

                {error && (
                  <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <span className="material-symbols-outlined text-red-500 text-[9px]">error</span>
                    <span className="text-[7px] font-black uppercase tracking-widest text-red-500 leading-tight">{error}</span>
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 bg-primary text-white rounded-lg font-black uppercase tracking-widest text-[9px] shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <span className="material-symbols-outlined animate-spin text-xs">sync</span>
                  ) : (
                    <>
                      {isRegistering ? 'Register' : 'Sign In'}
                      <span className="material-symbols-outlined text-[10px]">{isRegistering ? 'person_add' : 'login'}</span>
                    </>
                  )}
                </button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-[5px] font-black uppercase tracking-[0.3em]">
                  <span className="bg-white dark:bg-surface-dark px-2 text-slate-400">OR</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full py-2 bg-white dark:bg-white/5 border-2 border-slate-200 dark:border-white/10 rounded-lg font-black uppercase tracking-widest text-[7px] dark:text-white hover:bg-slate-50 dark:hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google
              </button>

              <div className="pt-1 text-center">
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                  {isRegistering ? 'Have an account?' : 'New here?'}{' '}
                  <button type="button" onClick={() => setIsRegistering(!isRegistering)} className="text-primary hover:brightness-110 transition-all">
                    {isRegistering ? 'Sign In' : 'Join'}
                  </button>
                </p>
              </div>
            </>
          )}
        </div>

        <div className="mt-3 flex items-center justify-center gap-3 opacity-30">
          <span className="text-[6px] font-black uppercase tracking-[0.3em] text-slate-500">Secure</span>
          <div className="w-0.5 h-0.5 bg-slate-500 rounded-full"></div>
          <span className="text-[6px] font-black uppercase tracking-[0.3em] text-slate-500">Neural Auth</span>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginView;
