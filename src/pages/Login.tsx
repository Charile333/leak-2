import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const { loginWithCredentials } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const validateEmail = (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  };

  const validateForm = (): boolean => {
    let isValid = true;

    setEmailError('');
    setPasswordError('');
    setError('');

    if (!email.trim()) {
      setEmailError('\u8bf7\u8f93\u5165\u90ae\u7bb1\u5730\u5740');
      isValid = false;
    } else if (!validateEmail(email)) {
      setEmailError('\u90ae\u7bb1\u683c\u5f0f\u4e0d\u6b63\u786e\uff0c\u8bf7\u8f93\u5165\u7c7b\u4f3c name@example.com \u7684\u5730\u5740');
      isValid = false;
    }

    if (!password.trim()) {
      setPasswordError('\u8bf7\u8f93\u5165\u5bc6\u7801');
      isValid = false;
    }

    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      if (!validateForm()) {
        setIsLoading(false);
        return;
      }

      const trimmedEmail = email.trim();

      if (rememberMe) {
        localStorage.setItem('rememberedEmail', trimmedEmail);
      } else {
        localStorage.removeItem('rememberedEmail');
      }

      const result = await loginWithCredentials(trimmedEmail, password);
      if (!result.success) {
        setError(result.message || '\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u8d26\u53f7\u6216\u5bc6\u7801');
      } else {
        setSuccess('\u767b\u5f55\u6210\u529f\uff0c\u6b63\u5728\u8fdb\u5165\u5de5\u4f5c\u53f0...');
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || '\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-20 sm:p-6 lg:p-8">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: 'url(/background/login-bg.jpg)',
        }}
      />
      <div className="absolute inset-0 z-0 bg-black/50" />

      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="absolute left-4 top-4 z-20 sm:left-6 sm:top-6 md:left-10 md:top-10 lg:left-16 lg:top-16"
      >
        <button
          type="button"
          onClick={() => window.history.back()}
          className="font-display flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-medium tracking-[0.06em] text-white shadow-lg backdrop-blur-md transition-all duration-300 hover:border-white/20 hover:bg-white/[0.1] hover:shadow-xl hover:shadow-accent/10 sm:px-6 sm:py-3"
          aria-label={'\u8fd4\u56de\u4e0a\u4e00\u9875'}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {'\u8fd4\u56de\u9996\u9875'}
        </button>
      </motion.div>

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center justify-center">
        <img
          src="/diewei-w.png"
          alt="Product Logo"
          className="h-36 w-36 object-contain sm:h-48 sm:w-48 lg:h-64 lg:w-64"
          style={{ position: 'relative', zIndex: 1000 }}
        />

        <motion.div
          className="glass-card mx-auto mt-[-1rem] w-full max-w-md rounded-[1.75rem] border border-white/10 p-5 shadow-xl shadow-black/20 sm:mt-[-1.5rem] sm:p-6 lg:mt-[-2rem] lg:p-8"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2.5">
              <div className="flex flex-col items-start justify-between gap-1.5 sm:flex-row sm:items-center">
                <label htmlFor="email" className="text-label block text-gray-300">
                  {'\u90ae\u7bb1'}
                </label>
                {emailError && (
                  <motion.div
                    className="font-data flex items-center gap-1 text-xs text-red-400"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <HelpCircle className="h-3 w-3" />
                    {emailError}
                  </motion.div>
                )}
              </div>
              <div className="relative">
                <motion.input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={'\u8bf7\u8f93\u5165\u90ae\u7bb1\u5730\u5740'}
                  className={`w-full rounded-xl border bg-white/5 px-4 py-3.5 text-[15px] text-white transition-all placeholder:text-white/35 focus:outline-none focus:ring-2 ${emailError ? 'border-red-500/70 focus:ring-red-500' : 'border-white/10 focus:ring-accent'}`}
                  disabled={isLoading}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6, duration: 0.4 }}
                />
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              <div className="flex flex-col items-start justify-between gap-1.5 sm:flex-row sm:items-center">
                <label htmlFor="password" className="text-label block text-gray-300">
                  {'\u5bc6\u7801'}
                </label>
                {passwordError && (
                  <motion.div
                    className="font-data flex items-center gap-1 text-xs text-red-400"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <HelpCircle className="h-3 w-3" />
                    {passwordError}
                  </motion.div>
                )}
              </div>
              <div className="relative">
                <motion.input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={'\u8bf7\u8f93\u5165\u767b\u5f55\u5bc6\u7801'}
                  className={`w-full rounded-xl border bg-white/5 px-4 py-3.5 text-[15px] text-white transition-all placeholder:text-white/35 focus:outline-none focus:ring-2 ${passwordError ? 'border-red-500/70 focus:ring-red-500' : 'border-white/10 focus:ring-accent'}`}
                  disabled={isLoading}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7, duration: 0.4 }}
                />
              </div>
            </div>

            <div className="mt-2 flex items-center text-sm">
              <motion.div
                className="flex items-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.4 }}
              >
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-5 w-5 rounded border-white/10 bg-white/5 text-accent focus:ring-accent"
                  disabled={isLoading}
                />
                <label htmlFor="rememberMe" className="ml-2 text-sm text-gray-400 tracking-[0.02em]">
                  {'\u8bb0\u4f4f\u90ae\u7bb1'}
                </label>
              </motion.div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -10 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                aria-live="polite"
                className="font-data flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-sm text-red-400"
              >
                <HelpCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            {success && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -10 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                aria-live="polite"
                className="font-data flex items-start gap-2 rounded-xl border border-green-500/20 bg-green-500/10 p-3.5 text-sm text-green-400"
              >
                <HelpCircle className="h-4 w-4 flex-shrink-0" />
                <span>{success}</span>
              </motion.div>
            )}

            <motion.button
              whileHover={{ scale: 1.02, boxShadow: '0 10px 25px -5px rgba(109, 40, 217, 0.3)' }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isLoading}
              className="font-display flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent/80 px-4 py-3.5 text-white tracking-[0.06em] shadow-[0_12px_30px_rgba(109,40,217,0.18)] transition-all hover:from-accent/90 hover:to-accent/70 disabled:scale-100 disabled:cursor-not-allowed disabled:opacity-70"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.4 }}
            >
              {isLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  {'\u767b\u5f55'}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </motion.button>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
