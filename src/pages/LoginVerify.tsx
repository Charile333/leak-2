import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import dieLogo from '../assets/diep.png';
import purpleLogo from '../assets/紫色2.png';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';

const LoginVerify: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [isVerifying, setIsVerifying] = useState(true);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { verifyLoginLink } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const verifyLogin = async () => {
      try {
        const token = searchParams.get('token');
        if (!token) {
          throw new Error('缺少登录令牌');
        }

        setIsVerifying(true);
        const result = await verifyLoginLink(token);
        
        if (result.success) {
          setVerificationSuccess(true);
          // 验证成功后，延迟跳转到首页
          setTimeout(() => {
            navigate('/');
          }, 2000);
        } else {
          throw new Error(result.message || '登录验证失败');
        }
      } catch (error: any) {
        setVerificationSuccess(false);
        setErrorMessage(error.message || '登录验证失败，请重新请求登录');
      } finally {
        setIsVerifying(false);
      }
    };

    verifyLogin();
  }, [searchParams, verifyLoginLink, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* 动态背景 */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#000000] to-[#0d0d1a]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(109,40,217,0.15),transparent_70%)] animate-pulse-slow"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_100%,rgba(236,72,153,0.1),transparent_70%)] animate-pulse-slow delay-700"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_100%,rgba(59,130,246,0.1),transparent_70%)] animate-pulse-slow delay-1400"></div>
      </div>
      
      {/* 右上角logo */}
      <div className="absolute top-4 right-4 z-10">
        <motion.img
          src={purpleLogo}
          alt="Purple Logo"
          className="h-16 w-auto object-contain opacity-60"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 0.6, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        />
      </div>
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5, type: "spring", stiffness: 100 }}
            className="flex items-center justify-center mb-4"
          >
            <img 
              src={dieLogo} 
              alt="Product Logo" 
              className="h-32 w-32 object-contain rounded-full" 
            />
          </motion.div>
        </div>

        {/* Verification Result */}
        <motion.div
          className="glass-card p-8 border border-white/10 rounded-2xl shadow-xl text-center"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          {isVerifying ? (
            <div className="space-y-6">
              <motion.div
                className="flex justify-center"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.5 }}
              >
                <div className="w-20 h-20 border-4 border-white/20 border-t-accent rounded-full animate-spin"></div>
              </motion.div>
              <h2 className="text-2xl font-bold text-white">正在验证登录链接...</h2>
              <p className="text-gray-400">请稍候，我们正在验证您的登录请求</p>
            </div>
          ) : verificationSuccess ? (
            <div className="space-y-6">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.5 }}
              >
                <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-10 h-10 text-green-400" />
                </div>
              </motion.div>
              <h2 className="text-2xl font-bold text-white">登录验证成功！</h2>
              <p className="text-gray-400">您的登录请求已验证，正在为您跳转到首页...</p>
              <div className="mt-4">
                <Loader2 className="w-6 h-6 text-accent animate-spin mx-auto" />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.5 }}
              >
                <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
                  <XCircle className="w-10 h-10 text-red-400" />
                </div>
              </motion.div>
              <h2 className="text-2xl font-bold text-white">登录验证失败</h2>
              <p className="text-gray-400">{errorMessage}</p>
              <button
                onClick={() => navigate('/login')}
                className="mt-6 px-6 py-3 bg-accent hover:bg-accent/80 text-white font-medium rounded-xl transition-all"
              >
                返回登录页
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
};

export default LoginVerify;