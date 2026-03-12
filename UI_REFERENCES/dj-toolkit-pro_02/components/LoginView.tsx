
import React, { useState } from 'react';
import { motion } from 'motion/react';

interface LoginViewProps {
  onLogin: () => void;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      onLogin();
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Accents */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md z-10"
      >
        <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-[3rem] p-10 shadow-2xl space-y-8">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-xl shadow-primary/20 mx-auto mb-6">
              <span className="material-symbols-outlined text-white text-3xl">graphic_eq</span>
            </div>
            <h1 className="text-3xl font-black dark:text-white uppercase tracking-tighter">Welcome Back</h1>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Access your professional DJ toolkit
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-4">Email Address</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">mail</span>
                  <input 
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full bg-slate-50 dark:bg-white/5 border-2 border-transparent focus:border-primary/20 rounded-2xl pl-12 pr-6 py-4 text-sm dark:text-white placeholder:text-slate-500 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-4">Password</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">lock</span>
                  <input 
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 dark:bg-white/5 border-2 border-transparent focus:border-primary/20 rounded-2xl pl-12 pr-6 py-4 text-sm dark:text-white placeholder:text-slate-500 transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" className="w-4 h-4 rounded border-slate-300 dark:border-white/10 bg-transparent text-primary focus:ring-primary/20" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-400 transition-colors">Remember me</span>
              </label>
              <button type="button" className="text-[10px] font-black uppercase tracking-widest text-primary hover:brightness-110 transition-all">Forgot Password?</button>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full py-5 bg-primary text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-3"
            >
              {isLoading ? (
                <span className="material-symbols-outlined animate-spin">sync</span>
              ) : (
                <>
                  Sign In
                  <span className="material-symbols-outlined text-sm">login</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Don't have an account? <button className="text-primary hover:brightness-110 transition-all">Create Account</button>
            </p>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-8 opacity-50">
          <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-500">Secure Encryption</span>
          <div className="w-1 h-1 bg-slate-500 rounded-full"></div>
          <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-500">Neural Auth V2</span>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginView;
