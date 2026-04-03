import React, { Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import Home from '../pages/Home';
import Login from '../pages/Login';
import LoginVerify from '../pages/LoginVerify';
import DarkWeb from '../pages/DarkWeb';
import { useAuth } from '../context/AuthContext';

const Dashboard = lazy(() => import('../pages/Dashboard'));
const DomainMonitor = lazy(() => import('../pages/DomainMonitor'));
const Activity = lazy(() => import('../pages/Activity'));
const OpinionAnalysis = lazy(() => import('../pages/OpinionAnalysis'));
const OpinionAI = lazy(() => import('../pages/OpinionAI'));
const EmailUsernameSearch = lazy(() => import('../pages/EmailUsernameSearch'));
const IocSearch = lazy(() => import('../pages/IocSearch'));
const CodeLeak = lazy(() => import('../pages/CodeLeak'));
const FileLeak = lazy(() => import('../pages/FileLeak'));
const AssetCompromise = lazy(() => import('../pages/AssetCompromise'));

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const pageVariants = {
  initial: {
    opacity: 0,
    y: 20,
    scale: 0.98,
  },
  in: {
    opacity: 1,
    y: 0,
    scale: 1,
  },
  out: {
    opacity: 0,
    y: -20,
    scale: 1.02,
  },
};

const pageTransition = {
  type: 'tween',
  ease: 'anticipate',
  duration: 0.5,
} as const;

const RouteFrame = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial="initial"
    animate="in"
    exit="out"
    variants={pageVariants}
    transition={pageTransition}
    className="h-full w-full"
  >
    {children}
  </motion.div>
);

const RouteFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center px-6 py-12">
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="glass-card flex min-w-[240px] flex-col items-center justify-center rounded-2xl border border-white/10 px-6 py-5 text-sm text-white/70"
    >
      <div className="mb-3 flex items-center gap-2">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className="h-2 w-2 rounded-full bg-accent/80"
            animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0], scale: [0.9, 1.08, 0.9] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: index * 0.12 }}
          />
        ))}
      </div>
      <div className="font-data text-[11px] uppercase tracking-[0.28em] text-accent/75">
        {'\u60c5\u62a5\u6d41\u52a0\u8f7d\u4e2d'}
      </div>
      <div className="mt-2 text-sm text-white/70">{'\u6b63\u5728\u52a0\u8f7d\u9875\u9762...'}</div>
    </motion.div>
  </div>
);

const withSuspense = (element: React.ReactNode) => (
  <Suspense fallback={<RouteFallback />}>{element}</Suspense>
);

const withPrivateLayout = (element: React.ReactNode) => (
  <PrivateRoute>
    <MainLayout>
      <RouteFrame>{withSuspense(element)}</RouteFrame>
    </MainLayout>
  </PrivateRoute>
);

const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path="/"
          element={
            <RouteFrame>
              <Home />
            </RouteFrame>
          }
        />
        <Route
          path="/login"
          element={
            <RouteFrame>
              <Login />
            </RouteFrame>
          }
        />
        <Route
          path="/login/verify"
          element={
            <RouteFrame>
              <LoginVerify />
            </RouteFrame>
          }
        />

        <Route path="/dashboard" element={withPrivateLayout(<Dashboard />)} />
        <Route path="/monitor" element={withPrivateLayout(<DomainMonitor />)} />
        <Route path="/opinion" element={withPrivateLayout(<OpinionAnalysis />)} />
        <Route
          path="/alerts"
          element={withPrivateLayout(
            <div className="p-8 text-center text-gray-400">{'\u544a\u8b66\u4e2d\u5fc3\u5373\u5c06\u4e0a\u7ebf\u3002'}</div>,
          )}
        />
        <Route path="/activity" element={withPrivateLayout(<Activity />)} />
        <Route path="/dns" element={withPrivateLayout(<IocSearch />)} />
        <Route
          path="/email-username-search"
          element={withPrivateLayout(<EmailUsernameSearch />)}
        />
        <Route path="/opinion-ai" element={withPrivateLayout(<OpinionAI />)} />
        <Route path="/darkweb" element={withPrivateLayout(<DarkWeb />)} />
        <Route path="/code-leak" element={withPrivateLayout(<CodeLeak />)} />
        <Route path="/file-leak" element={withPrivateLayout(<FileLeak />)} />
        <Route
          path="/asset-compromise"
          element={withPrivateLayout(<AssetCompromise />)}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
};

export default AnimatedRoutes;
