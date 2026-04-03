import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Search,
  ChevronDown,
  Activity,
  Pin,
  LogOut,
  User,
  Bot,
  Database,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';

const dieLogo = '/diewei.png';
const GROUP_DISCOVERY = '\u60c5\u62a5\u68c0\u7d22';

const menuGroups = [
  {
    name: GROUP_DISCOVERY,
    icon: Search,
    items: [
      { name: '\u6cc4\u9732\u603b\u89c8', path: '/dashboard' },
      { name: '\u90ae\u7bb1 / \u7528\u6237\u540d\u641c\u7d22', path: '/email-username-search' },
      { name: '\u6697\u7f51\u60c5\u62a5', path: '/darkweb' },
      { name: '\u4ee3\u7801\u6cc4\u9732', path: '/code-leak' },
      { name: '\u6587\u4ef6\u6cc4\u9732', path: '/file-leak' },
      { name: '\u8d44\u4ea7\u5931\u9677', path: '/asset-compromise' },
    ],
  },
  {
    name: 'AI \u7814\u5224',
    icon: Bot,
    items: [
      { name: '\u8206\u60c5\u5206\u6790', path: '/opinion' },
      { name: 'AI \u7814\u5224\u52a9\u624b', path: '/opinion-ai' },
    ],
  },
  {
    name: 'IOC',
    icon: Database,
    items: [
      { name: 'IOC \u67e5\u8be2', path: '/dns' },
      { name: '\u6d3b\u52a8\u8ffd\u8e2a', path: '/activity' },
    ],
  },
];

interface SidebarProps {
  isPinned: boolean;
  setIsPinned: (value: boolean) => void;
  isDesktop: boolean;
  isMobileOpen: boolean;
  setIsMobileOpen: (value: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  isPinned,
  setIsPinned,
  isDesktop,
  isMobileOpen,
  setIsMobileOpen,
}) => {
  const [openMenus, setOpenMenus] = useState<string[]>([GROUP_DISCOVERY]);
  const [isHovered, setIsHovered] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const { logout } = useAuth();

  const getUserInfo = () => {
    const userJson = localStorage.getItem('leakradar_user');
    if (userJson) {
      try {
        return JSON.parse(userJson);
      } catch {
        return null;
      }
    }
    return null;
  };

  const user = getUserInfo();
  const effectiveCollapsed = isDesktop ? !isPinned && !isHovered : false;

  const handleMouseEnter = () => {
    if (isDesktop) {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    if (isDesktop) {
      setIsHovered(false);
    }
  };

  const togglePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newPinned = !isPinned;
    setIsPinned(newPinned);
    localStorage.setItem('sidebarPinned', JSON.stringify(newPinned));
  };

  const toggleMenu = (name: string) => {
    if (effectiveCollapsed) {
      return;
    }

    setOpenMenus((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name],
    );
  };

  const handleNavigate = () => {
    if (!isDesktop) {
      setIsMobileOpen(false);
    }
  };

  const smoothTransition = {
    duration: 0.35,
    ease: [0.4, 0, 0.2, 1] as const,
  };

  const navSpring = shouldReduceMotion
    ? { duration: 0.01 }
    : { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.75 };

  return (
    <motion.aside
      initial={false}
      animate={{ x: isDesktop ? 0 : isMobileOpen ? 0 : -320 }}
      transition={smoothTransition}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'console-shell fixed left-0 top-0 z-50 flex h-screen flex-col overflow-hidden border-r shadow-2xl backdrop-blur-xl',
        isDesktop ? (effectiveCollapsed ? 'group/sidebar lg:w-20' : 'group/sidebar lg:w-64') : 'w-[86vw] max-w-[320px]',
        !isDesktop && 'shadow-black/50',
      )}
    >
      <div className="console-divider relative flex h-28 shrink-0 items-center justify-center overflow-hidden border-b px-4 lg:h-32">
        <AnimatePresence>
          {!effectiveCollapsed && (
            <>
              {!isDesktop && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={smoothTransition}
                  onClick={() => setIsMobileOpen(false)}
                  className="console-control absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl"
                  aria-label={'\u5173\u95ed\u5bfc\u822a'}
                >
                  <X className="h-4 w-4" />
                </motion.button>
              )}

              {isDesktop && (
                <motion.button
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0, rotate: isPinned ? 45 : 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={smoothTransition}
                  onClick={togglePin}
                  className={cn(
                    'absolute right-6 top-4 rounded-lg p-2 transition-all duration-300',
                    isPinned
                      ? 'console-accent-soft shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_18%,transparent)]'
                      : 'console-control console-muted',
                  )}
                  title={isPinned ? '\u53d6\u6d88\u56fa\u5b9a\u4fa7\u680f' : '\u56fa\u5b9a\u4fa7\u680f'}
                >
                  <Pin className="h-4 w-4" />
                </motion.button>
              )}
            </>
          )}
        </AnimatePresence>

        <img src={dieLogo} alt="Product Logo" className="h-20 w-20 object-contain lg:h-28 lg:w-28" />
      </div>

      <nav className="custom-scrollbar flex-1 overflow-x-hidden overflow-y-auto px-3 py-3">
        <div className="space-y-1">
          {menuGroups.map((group) => {
            const Icon = group.icon;
            const isOpen = openMenus.includes(group.name);

            return (
              <div key={group.name} className="space-y-1">
                <div className={cn('w-full', effectiveCollapsed && 'px-[10px]')}>
                  <button
                    id={`button-${group.name}`}
                    type="button"
                    onClick={() => toggleMenu(group.name)}
                    aria-expanded={isOpen}
                    aria-controls={`menu-${group.name}`}
                    className={cn(
                      'font-display group flex w-full items-center overflow-hidden whitespace-nowrap rounded-xl text-sm font-medium tracking-[0.06em] transition-all duration-300',
                      effectiveCollapsed ? 'justify-center py-3' : 'justify-between px-3 py-3',
                      isOpen
                        ? 'console-panel text-white shadow-lg'
                        : 'border border-transparent console-subtle hover:bg-white/5 hover:text-white',
                    )}
                  >
                    <motion.div
                      className="flex min-w-0 items-center"
                      animate={isOpen && !shouldReduceMotion ? { x: 2 } : { x: 0 }}
                      transition={navSpring}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0 transition-transform duration-300',
                          isOpen ? 'scale-110 text-accent' : 'group-hover:scale-110',
                        )}
                      />
                      <AnimatePresence mode="popLayout">
                        {!effectiveCollapsed && (
                          <motion.span
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            transition={smoothTransition}
                            className="ml-3 truncate font-semibold tracking-[0.04em]"
                          >
                            {group.name}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.div>

                    <AnimatePresence mode="popLayout">
                      {!effectiveCollapsed && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1, rotate: isOpen ? 180 : 0 }}
                          exit={{ opacity: 0, scale: 0 }}
                          transition={smoothTransition}
                        >
                          <ChevronDown className="ml-2 h-3 w-3 opacity-50" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {!effectiveCollapsed && isOpen && (
                    <motion.div
                      id={`menu-${group.name}`}
                      role="region"
                      aria-labelledby={`button-${group.name}`}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={smoothTransition}
                      className="console-panel overflow-hidden rounded-xl"
                    >
                      <div className="space-y-1 px-3 py-2 lg:pl-10 lg:pr-4">
                        {group.items.map((item) => (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={handleNavigate}
                            className={({ isActive }) =>
                              cn(
                                'font-display block rounded-lg px-3 py-2.5 text-xs tracking-[0.06em] transition-all duration-300 whitespace-normal break-words',
                                isActive
                                  ? 'console-accent-soft font-bold shadow-[inset_0_0_10px_color-mix(in_srgb,var(--accent)_10%,transparent)]'
                                  : 'console-muted hover:bg-white/5 hover:text-white',
                              )
                            }
                          >
                            {({ isActive }) => (
                              <div className="relative overflow-hidden">
                                {isActive && !shouldReduceMotion && (
                                  <motion.span
                                    layoutId="sidebar-active-indicator"
                                    className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_16px_color-mix(in_srgb,var(--accent)_45%,transparent)]"
                                    transition={navSpring}
                                  />
                                )}
                                <motion.span
                                  className={cn('block pl-0', isActive && !effectiveCollapsed && 'pl-3')}
                                  animate={
                                    shouldReduceMotion
                                      ? undefined
                                      : isActive
                                        ? { x: 2, opacity: 1 }
                                        : { x: 0, opacity: 0.86 }
                                  }
                                  transition={navSpring}
                                >
                                  {item.name}
                                </motion.span>
                              </div>
                            )}
                          </NavLink>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          <div className="py-2">
            <div className={cn('w-full', effectiveCollapsed && 'px-[10px]')}>
              <NavLink
                to="/monitor"
                onClick={handleNavigate}
                className={({ isActive }) =>
                  cn(
                    'font-display flex w-full items-center overflow-hidden whitespace-nowrap rounded-xl py-3 text-sm font-bold tracking-[0.06em] shadow-lg transition-all duration-300',
                    effectiveCollapsed ? 'justify-center' : 'px-3',
                    isActive
                      ? 'scale-[1.01] bg-gradient-to-r from-accent to-accent/80 text-white shadow-accent/20'
                      : 'console-subtle hover:bg-white/5 hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <motion.div
                      className="relative flex items-center"
                      animate={isActive && !shouldReduceMotion ? { x: 2 } : { x: 0 }}
                      transition={navSpring}
                    >
                      <Activity className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-110" />
                      {isActive && !shouldReduceMotion && !effectiveCollapsed && (
                        <motion.span
                          layoutId="sidebar-monitor-indicator"
                          className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_16px_color-mix(in_srgb,var(--accent)_45%,transparent)]"
                          transition={navSpring}
                        />
                      )}
                    </motion.div>
                    <AnimatePresence mode="popLayout">
                      {!effectiveCollapsed && (
                        <motion.span
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          transition={smoothTransition}
                          className="ml-3"
                        >
                          {'\u76d1\u63a7\u603b\u89c8'}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </NavLink>
            </div>
          </div>
        </div>
      </nav>

      <div className="mt-auto shrink-0 p-4">
        <motion.div
          layout
          className={cn(
            'flex min-h-[48px] items-center overflow-hidden rounded-xl border border-white/5 bg-gradient-to-br from-brand/20 to-transparent',
            effectiveCollapsed ? 'justify-center px-2' : 'justify-between px-4',
          )}
        >
          <AnimatePresence mode="wait">
            {!effectiveCollapsed ? (
              <motion.div
                key="full-user-area"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={smoothTransition}
                className="flex w-full items-center justify-between gap-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent/70 text-white">
                    <User className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-display block truncate text-xs font-medium tracking-[0.04em] text-white">
                      {user?.name || user?.email || '\u5f53\u524d\u7528\u6237'}
                    </span>
                    <span className="font-data console-subtle block truncate text-xs">
                      {user?.email || ''}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={logout}
                  className="console-subtle rounded-lg p-2 transition-all duration-300 hover:bg-white/10 hover:text-white"
                  title={'\u9000\u51fa\u767b\u5f55'}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="collapsed-user-area"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={smoothTransition}
                className="flex items-center"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent/70 text-white">
                  <User className="h-4 w-4" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
