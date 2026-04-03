import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import Header from './Header';
import { cn } from '../../lib/utils';

interface MainLayoutProps {
  children: React.ReactNode;
}

const DESKTOP_BREAKPOINT = 1024;

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();
  const [isPinned, setIsPinned] = React.useState(() => {
    const saved = localStorage.getItem('sidebarPinned');
    return saved ? JSON.parse(saved) : false;
  });
  const [isDesktop, setIsDesktop] = React.useState(() => window.innerWidth >= DESKTOP_BREAKPOINT);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    const syncLayoutMode = (event: MediaQueryList | MediaQueryListEvent) => {
      const desktop = event.matches;
      setIsDesktop(desktop);
      if (desktop) {
        setIsMobileSidebarOpen(false);
      }
    };

    syncLayoutMode(mediaQuery);
    const listener = (event: MediaQueryListEvent) => syncLayoutMode(event);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  React.useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  React.useEffect(() => {
    if (!isMobileSidebarOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isMobileSidebarOpen]);

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white flex overflow-hidden relative functional-theme">
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-accent/5 blur-[100px] rounded-full" />
        <div className="absolute top-[20%] right-[10%] w-[25%] h-[25%] bg-brand/5 blur-[130px] rounded-full" />
      </div>

      <div className="fixed top-4 right-4 z-50 lg:top-8 lg:right-8">
        <img
          src="/Lysir.png"
          alt="Lysirsec Logo"
          className="h-9 w-auto object-contain brightness-110 sm:h-10 lg:h-12"
        />
      </div>

      <Sidebar
        isPinned={isPinned}
        setIsPinned={setIsPinned}
        isDesktop={isDesktop}
        isMobileOpen={isMobileSidebarOpen}
        setIsMobileOpen={setIsMobileSidebarOpen}
      />

      <AnimatePresence>
        {!isDesktop && isMobileSidebarOpen && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-[#04070d]/75 backdrop-blur-sm lg:hidden"
            aria-label="Close navigation"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <div
        className={cn(
          'relative z-10 flex min-h-screen w-full flex-1 flex-col',
          isDesktop && (isPinned ? 'lg:pl-64' : 'lg:pl-20'),
        )}
      >
        {!isDesktop && (
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: -12 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="sticky top-0 z-30 border-b border-white/5 bg-[#080c12]/90 backdrop-blur-xl px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden"
          >
            <div className="flex items-center justify-between gap-4">
              <motion.button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10"
                aria-label="Open navigation"
                whileHover={shouldReduceMotion ? undefined : { scale: 1.04, y: -1 }}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
              >
                <Menu className="h-5 w-5" />
              </motion.button>
              <div className="min-w-0 flex-1 pr-12">
                <p className="font-data text-[11px] uppercase tracking-[0.28em] text-accent/80">Threat Console</p>
                <p className="font-display truncate text-sm font-semibold tracking-[0.04em] text-white/90">Operational Workspace</p>
              </div>
            </div>
          </motion.div>
        )}

        <Header />
        <main className="flex-1 overflow-y-auto px-4 pb-6 pt-4 sm:px-6 sm:pb-8 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 18, scale: 0.992, filter: 'blur(10px)' }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -14, scale: 1.006, filter: 'blur(8px)' }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
