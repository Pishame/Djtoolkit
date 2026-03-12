import React, { useEffect, useState } from 'react';
import { ENABLE_SERVER_AUTH, apiGetGoogleStartUrl, apiSignIn, apiSignUp } from '../lib/apiClient';

interface LoginViewProps {
  onLogin: (payload: { email: string; remember: boolean }) => void;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVerificationSent, setShowVerificationSent] = useState(false);

  useEffect(() => {
    if (error) setError(null);
  }, [email, password, fullName, confirmPassword, isRegistering]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const run = async () => {
      try {
        if (ENABLE_SERVER_AUTH) {
          await apiSignIn(email.trim(), password);
        }
        onLogin({ email: email.trim(), remember });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign in failed.');
      } finally {
        setIsLoading(false);
      }
    };
    void run();
  };

  const handleSignupPreview = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSignupLoading(true);
    const run = async () => {
      try {
        if (ENABLE_SERVER_AUTH) {
          await apiSignUp(email.trim(), password, fullName.trim());
        }
        setShowVerificationSent(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Create account failed.');
      } finally {
        setSignupLoading(false);
      }
    };
    void run();
  };

  const onToggleMode = () => {
    setError(null);
    setShowVerificationSent(false);
    setIsRegistering((prev) => !prev);
  };

  const handleGoogleLogin = () => {
    const run = async () => {
      try {
        setError(null);
        if (!ENABLE_SERVER_AUTH) {
          setError('Google login requires server auth mode.');
          return;
        }
        const { url } = await apiGetGoogleStartUrl(window.location.origin);
        if (url) {
          window.location.href = url;
          return;
        }
        setError('Google login URL was not provided by server.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Google login failed.');
      }
    };
    void run();
  };

  return (
    <div className="h-screen bg-background-light dark:bg-background-dark flex flex-col items-center justify-center p-6 relative overflow-hidden font-display">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>

      <div className={`w-full max-w-[340px] z-10 transition-all duration-300 ${error ? 'animate-[loginShake_0.35s_ease-in-out]' : ''}`}>
        <div className="relative bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-[2rem] p-5 shadow-2xl space-y-3">
          {showVerificationSent ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-emerald-500 text-2xl">mark_email_read</span>
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-black dark:text-white uppercase tracking-tighter">Check your email</h2>
                <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 px-4">
                  We've sent a verification link to <span className="text-primary font-bold">{email || 'your account'}</span>. Please click the link to activate your account.
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
            </div>
          ) : (
            <>
              {isRegistering && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setIsRegistering(false);
                  }}
                  className="absolute top-4 left-5 flex items-center gap-2 text-slate-400 hover:text-primary transition-all group"
                  aria-label="Back to Sign In"
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

              {!isRegistering ? (
                <form onSubmit={handleSubmit} className="space-y-2.5">
                  <div className="space-y-1.5">
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
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors"
                        >
                          <span className="material-symbols-outlined text-xs">{showPassword ? 'visibility_off' : 'visibility'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-1">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-300 dark:border-white/10 bg-transparent text-primary focus:ring-primary/20"
                      />
                      <span className="text-[7px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-400 transition-colors">Remember</span>
                    </label>
                    <button type="button" className="text-[7px] font-black uppercase tracking-widest text-primary hover:brightness-110 transition-all">Forgot?</button>
                  </div>

                  {error && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <span className="material-symbols-outlined text-red-500 text-[9px]">error</span>
                      <span className="text-[7px] font-black uppercase tracking-widest text-red-500 leading-tight">{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 bg-primary text-white rounded-lg font-black uppercase tracking-widest text-[9px] shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {isLoading ? <span className="material-symbols-outlined animate-spin text-sm">sync</span> : <><span>Sign In</span><span className="material-symbols-outlined text-xs">login</span></>}
                  </button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200 dark:border-white/10"></div>
                    </div>
                    <div className="relative flex justify-center text-[5px] font-black uppercase tracking-[0.3em]">
                      <span className="bg-white dark:bg-surface-dark px-2 text-slate-400">OR</span>
                    </div>
                  </div>

                  <button type="button" className="w-full py-2 bg-white dark:bg-white/5 border-2 border-slate-200 dark:border-white/10 rounded-lg font-black uppercase tracking-widest text-[7px] dark:text-white hover:bg-slate-50 dark:hover:bg-white/10 transition-all flex items-center justify-center gap-2" onClick={handleGoogleLogin}>
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Google
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSignupPreview} className="space-y-2.5">
                  <div className="space-y-1.5">
                    <div className="space-y-0.5">
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
                    </div>

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
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors"
                        >
                          <span className="material-symbols-outlined text-xs">{showPassword ? 'visibility_off' : 'visibility'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <label className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2.5">Confirm Password</label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">lock_reset</span>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-slate-50 dark:bg-white/5 border-2 border-transparent focus:border-primary/20 rounded-lg pl-9 pr-3 py-1.5 text-[11px] dark:text-white placeholder:text-slate-500 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={signupLoading}
                    className="w-full py-2.5 bg-primary text-white rounded-lg font-black uppercase tracking-widest text-[9px] shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {signupLoading ? <span className="material-symbols-outlined animate-spin text-sm">sync</span> : <><span>Register</span><span className="material-symbols-outlined text-xs">person_add</span></>}
                  </button>

                  {error && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <span className="material-symbols-outlined text-red-500 text-[9px]">error</span>
                      <span className="text-[7px] font-black uppercase tracking-widest text-red-500 leading-tight">{error}</span>
                    </div>
                  )}
                </form>
              )}

              <div className="pt-1 text-center">
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                  {isRegistering ? 'Have an account?' : 'New here?'}{' '}
                  <button type="button" onClick={onToggleMode} className="text-primary hover:brightness-110 transition-all">
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
      </div>

      <style>{`@keyframes loginShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-6px)} 80%{transform:translateX(6px)} }`}</style>
    </div>
  );
};

export default LoginView;
