import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowRight, Menu, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
// import ParticleWaves from '../components/ParticleWaves';
// import LiquidGradientBackground from '../components/LiquidGradientBackground'; // Removed as requested
import { SectionBackground } from '../components/ui/SectionBackground';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import CoreServiceMatrix from '../components/CoreServiceMatrix';
import {
  ServiceProcessSection,
  FlipCardReplicaSection,
} from '../components/LandingSections';
import { leakRadarApi } from '../api/leakRadar';
import Footer from '../components/layout/Footer';

const homeEase = [0.22, 1, 0.36, 1] as const;

const heroShellVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.08,
    },
  },
};

const heroItemVariants = {
  hidden: {
    opacity: 0,
    y: 28,
    scale: 0.985,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.9,
      ease: homeEase,
    },
  },
};

const sectionRevealVariants = {
  hidden: {
    opacity: 0,
    y: 40,
    scale: 0.985,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.85,
      ease: homeEase,
    },
  },
};

// 综合数据仪表盘组件
const DataDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>({
    leaks: { total: 0, today: 0, this_week: 0, this_month: 0 },
    raw_lines: { total: 0 }
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await leakRadarApi.getStats();
        
        // 计算包含raw_lines的总数
        if (data.leaks && data.raw_lines) {
          data.leaks.total = data.leaks.total + data.raw_lines.total;
          data.leaks.today = data.leaks.today + data.raw_lines.today;
          data.leaks.this_week = data.leaks.this_week + data.raw_lines.this_week;
          data.leaks.this_month = data.leaks.this_month + data.raw_lines.this_month;
        }
        
        setStats(data);

        // 处理图表数据
        if (data.leaks && data.leaks.per_week) {
          const rawLinesData = data.raw_lines?.per_week || [];
          const formattedData = data.leaks.per_week.map((week: any) => {
            const rawLineItem = rawLinesData.find((r: any) => r.week === week.week);
            return {
              date: week.week,
              total: week.count + (rawLineItem ? rawLineItem.count : 0),
              'url:user:pass': week.count,
              'raw_lines': rawLineItem ? rawLineItem.count : 0
            };
          });
          setChartData(formattedData);
        } else {
          setChartData([]);
        }
      } catch (error) {
        console.error('获取数据失败:', error);
        // API连接失败时生成模拟数据，确保图表有内容展示（演示用）
        const mockData = Array.from({ length: 12 }).map((_, i) => {
          const week = `2024-W${(i + 1).toString().padStart(2, '0')}`;
          const baseCount = 100000 + Math.random() * 50000;
          return {
            date: week,
            total: Math.floor(baseCount * 2.5),
            'url:user:pass': Math.floor(baseCount),
            'raw_lines': Math.floor(baseCount * 1.5)
          };
        });
        setChartData(mockData);
        setStats({
          leaks: { total: 125890000, today: 12500, this_week: 85000, this_month: 350000 },
          raw_lines: { total: 0 } // Included in leaks.total for display logic
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatNumber = (num: number) => num.toLocaleString();
  
  const formatYAxis = (value: number) => {
    if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)} B`;
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)} M`;
    return `${value.toLocaleString()}`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="console-panel rounded-lg border-accent/20 p-4 text-white shadow-[0_0_14px_rgba(0,224,255,0.12)]">
          <p className="font-data mb-2 text-accent">{payload[0].payload.date}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="font-data my-1 flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="console-subtle">{entry.name}:</span>
              <span className="text-white">{formatYAxis(entry.value)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[500px]">
        <div className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl lg:max-w-7xl mx-auto px-4 sm:px-6">
      {/* 仪表盘主容器 - 优化响应式网格布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        
        {/* 左侧：核心指标卡片 */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="lg:col-span-1 flex flex-col gap-3 sm:gap-4"
        >
          {/* 总数卡片 - 赛博风格 */}
          <div className="console-panel flex flex-1 flex-col justify-center rounded-2xl border-accent/20 p-4 sm:p-6 md:p-8">
            <h3 className="text-label console-subtle mb-3 sm:mb-4 sm:text-sm">{'\u6cc4\u9732\u603b\u6570'}</h3>
            <div className="flex items-end gap-3">
              <p className="font-data break-all text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl lg:text-5xl xl:text-6xl">
                {formatNumber(stats.leaks.total)}
              </p>
              <span className="text-label console-subtle pb-1">indexed</span>
            </div>
            <p className="console-muted mt-4 text-sm sm:mt-5">
              {'\u5408\u5e76 URL:USER:PASS \u4e0e raw lines \u6cc4\u9732\u8bb0\u5f55\uff0c\u7528\u4e8e\u5feb\u901f\u8bc4\u4f30\u66b4\u9732\u9762\u89c4\u6a21\u3002'}
            </p>
          </div>

          {/* 小指标卡片网格 */}
          <div className="grid grid-cols-1 gap-3 sm:gap-4">
            {[
              { label: "Today", value: stats.leaks.today, color: "text-emerald-400", border: "border-emerald-500/30" },
              { label: "This Week", value: stats.leaks.this_week, color: "text-blue-400", border: "border-blue-500/30" },
              { label: "This Month", value: stats.leaks.this_month, color: "text-cyan-400", border: "border-cyan-500/30" }
            ].map((item, idx) => (
              <div key={idx} className={`console-panel border ${item.border} flex items-center justify-between rounded-xl p-3 transition-colors hover:bg-white/[0.04] sm:p-4`}>
                <div>
                  <span className="text-label console-subtle block sm:text-xs">{item.label}</span>
                  <span className="console-muted mt-1 block text-[11px]">{'\u65b0\u589e\u6536\u5f55'}</span>
                </div>
                <span className={`font-data text-lg font-semibold sm:text-xl ${item.color}`}>+{formatNumber(item.value)}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* 右侧：趋势图表 */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="console-panel relative overflow-hidden rounded-2xl p-4 sm:p-6 lg:col-span-2"
        >
          {/* 装饰性网格背景 */}
          {/* <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" /> */}
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-8 relative z-10 gap-2 sm:gap-4">
            <h3 className="font-display flex items-center gap-2 text-base font-semibold text-white sm:text-lg">
              <span className="w-1 h-5 sm:h-6 bg-accent rounded-full" />
              泄露数据增长趋势
            </h3>
            <div className="flex gap-2 sm:gap-4 flex-wrap">
               {[
                { name: 'Total', color: '#38BDF8' }, // Ice Blue
                { name: 'Verified', color: '#ec4899' }, // Pink
                { name: 'Raw', color: '#06b6d4' } // Cyan
              ].map((item, i) => (
                <div key={i} className="font-data console-subtle flex items-center gap-2 text-[10px] sm:text-xs">
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: item.color }} />
                  {item.name}
                </div>
              ))}
            </div>
          </div>

          <div className="h-[250px] sm:h-[300px] md:h-[350px] w-full relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0095d9" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#0095d9" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradVerified" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradRaw" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="rgba(255, 255, 255, 0.3)" 
                  tick={{ fontSize: 10, fontFamily: 'monospace' }} 
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis 
                  stroke="rgba(255, 255, 255, 0.3)" 
                  tick={{ fontSize: 10, fontFamily: 'monospace' }} 
                  tickFormatter={formatYAxis}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="raw_lines" stroke="#06b6d4" strokeWidth={2} fill="url(#gradRaw)" />
                <Area type="monotone" dataKey="url:user:pass" stroke="#ec4899" strokeWidth={2} fill="url(#gradVerified)" />
                <Area type="monotone" dataKey="total" stroke="#0095d9" strokeWidth={3} fill="url(#gradTotal)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  // const [currentSection, setCurrentSection] = useState(0);

  return (
    <div className="min-h-screen relative overflow-hidden text-white">
      {/* 液体渐变背景 - 固定在底层 - 仅在第一页显示 */}
      {/* 移除全局的 LiquidGradientBackground，因为它现在只在第一屏使用 */}
      
      {/* 导航栏 - 固定在顶层，优化响应式设计 */}
      <div className="fixed top-0 left-0 w-full z-50 border-transparent bg-gradient-to-b from-[#04070d]/85 via-[#04070d]/45 to-transparent transition-all duration-500">
        <nav className="container mx-auto flex items-center justify-between px-4 py-3 sm:px-6 md:py-4">
          <div className="flex items-center gap-2">
            <img 
              src="/Lysir-w.png" 
              alt="Product Logo" 
              className="h-8 sm:h-10 md:h-12 w-auto object-contain" 
            />
          </div>
          
          {/* 桌面端导航 */}
          <div className="hidden md:flex items-center gap-4 lg:gap-6">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="text-white/80 hover:text-white transition-colors text-sm lg:text-base"
            >
              产品
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="text-white/80 hover:text-white transition-colors text-sm lg:text-base"
            >
              解决方案
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="text-white/80 hover:text-white transition-colors text-sm lg:text-base"
            >
              关于我们
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              className="glass-button flex min-h-11 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white hover:bg-white/18 hover:text-white lg:px-6 lg:py-3 lg:text-base"
              onClick={() => navigate('/login')}
            >
              登录
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>

          {/* 移动端菜单按钮 */}
          <button
            type="button"
            className="md:hidden min-h-11 min-w-11 text-white p-2"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
            aria-expanded={isMobileMenuOpen}
          >
            <AnimatePresence mode="wait">
              {isMobileMenuOpen ? (
                <motion.div
                  key="close"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <X className="w-6 h-6" />
                </motion.div>
              ) : (
                <motion.div
                  key="menu"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Menu className="w-6 h-6" />
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </nav>

        {/* 移动端菜单 */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="border-b border-white/10 bg-black/95 backdrop-blur-xl md:hidden"
            >
              <div className="container mx-auto flex flex-col gap-3 px-4 py-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="min-h-11 text-white/80 hover:text-white transition-colors text-left py-2 text-base"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                  }}
                >
                  产品
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="min-h-11 text-white/80 hover:text-white transition-colors text-left py-2 text-base"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                  }}
                >
                  解决方案
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="min-h-11 text-white/80 hover:text-white transition-colors text-left py-2 text-base"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                  }}
                >
                  关于我们
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="glass-button flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-medium text-white hover:bg-white/18 hover:text-white"
                  onClick={() => {
                    navigate('/login');
                    setIsMobileMenuOpen(false);
                  }}
                >
                  登录
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 内容包裹器：负责遮挡页脚 */}
      <div className="relative z-20 mb-[220px] bg-[#080C12] sm:mb-[240px] lg:mb-[260px]">
        {/* 底部阴影，增强视觉效果 */}
        <div className="absolute bottom-0 left-0 w-full h-20 bg-gradient-to-t from-black to-transparent"></div>
          {/* 第一屏：英雄区域 - 优化响应式布局 */}
          <motion.div 
            className="relative z-20 flex min-h-screen items-center justify-center overflow-hidden pt-24 sm:pt-28"
            initial={shouldReduceMotion ? false : "hidden"}
            whileInView={shouldReduceMotion ? undefined : "visible"}
            viewport={{ once: true, margin: "-8% 0px -8% 0px" }}
            variants={shouldReduceMotion ? undefined : sectionRevealVariants}
          >
            {/* 背景图片 */}
            <div 
              className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
              style={{ 
                backgroundImage: 'url(/background/banner-1.jpg)',
                filter: 'brightness(0.6)' // 稍微压暗背景，确保文字清晰
              }}
            />
            {/* 渐变遮罩，增强底部融合 */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/80 z-0 pointer-events-none" />
            {!shouldReduceMotion && (
              <>
                <motion.div
                  aria-hidden="true"
                  className="absolute left-[8%] top-[18%] z-0 h-28 w-28 rounded-full bg-accent/12 blur-3xl"
                  animate={{ y: [-8, 12, -8], opacity: [0.28, 0.45, 0.28] }}
                  transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                  aria-hidden="true"
                  className="absolute bottom-[16%] right-[12%] z-0 h-36 w-36 rounded-full bg-cyan-400/10 blur-3xl"
                  animate={{ y: [10, -10, 10], x: [-6, 10, -6], opacity: [0.2, 0.36, 0.2] }}
                  transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
                />
              </>
            )}
            
            <section className="container relative z-10 mx-auto flex flex-col items-center px-4 text-center sm:px-6 lg:px-8">
              <motion.div
                initial={shouldReduceMotion ? false : "hidden"}
                animate={shouldReduceMotion ? undefined : "visible"}
                variants={shouldReduceMotion ? undefined : heroShellVariants}
                className="max-w-4xl lg:max-w-5xl xl:max-w-6xl flex flex-col items-center w-full"
              >
                <motion.img 
                  src="/diewei-w.png" 
                  alt="Diewei Logo" 
                  variants={shouldReduceMotion ? undefined : heroItemVariants}
                  className="mb-4 h-10 w-auto object-contain opacity-90 sm:mb-6 sm:h-14 md:h-16" 
                />
                <motion.h1 variants={shouldReduceMotion ? undefined : heroItemVariants} className="font-display mb-4 px-2 text-3xl font-bold leading-[1.06] tracking-[-0.04em] text-white sm:mb-6 sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl">
                  {'\u6d1e\u6089\u6570\u5b57\u6697\u6d41'} <span className="text-accent">{'\u667a\u7b51\u5b89\u5168\u7a79\u9876'}</span>
                </motion.h1>
                <motion.p variants={shouldReduceMotion ? undefined : heroItemVariants} className="mx-auto mb-6 max-w-3xl px-2 text-sm leading-relaxed text-white/80 sm:mb-8 sm:px-4 sm:text-lg md:mb-10 md:text-xl lg:max-w-4xl lg:text-2xl">
                  {'\u8c0d\u536b\uff5c\u6697\u7f51\u4e0e\u4e92\u8054\u7f51\u6cc4\u9732\u60c5\u62a5\u76d1\u6d4b\u5e73\u53f0\uff0c\u5168\u9762\u5b88\u62a4\u4f01\u4e1a\u6570\u5b57\u8d44\u4ea7'}
                </motion.p>
                <motion.div variants={shouldReduceMotion ? undefined : heroItemVariants} className="flex w-full flex-col items-stretch justify-center gap-3 px-2 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
                  <motion.button
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.035, y: -2, boxShadow: "0 14px 30px -12px rgba(255, 255, 255, 0.22)" }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.985 }}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/14 bg-white/[0.08] px-6 py-3 text-base font-medium text-white backdrop-blur-sm transition-all hover:bg-white/[0.12] sm:w-auto sm:px-8 sm:py-4 sm:text-lg"
                    onClick={() => navigate('/login')}
                  >
                    立即开始
                    <ArrowRight className="w-4 sm:w-5 h-4 sm:h-5" />
                  </motion.button>
                  <motion.button
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.03, y: -2 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.985 }}
                    className="min-h-12 w-full rounded-full border border-white/20 bg-white/10 px-6 py-3 text-base font-medium text-white hover:bg-white/20 sm:w-auto sm:px-8 sm:py-4 sm:text-lg"
                  >
                    了解更多
                  </motion.button>
                </motion.div>
                {!shouldReduceMotion && (
                  <motion.div
                    variants={heroItemVariants}
                    className="mt-8 flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-white/40 sm:mt-10"
                  >
                    <motion.span
                      className="block h-px w-14 bg-gradient-to-r from-transparent via-accent/80 to-transparent"
                      animate={{ opacity: [0.35, 1, 0.35], scaleX: [0.86, 1.08, 0.86] }}
                      transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    Threat Intelligence Flow
                    <motion.span
                      className="block h-px w-14 bg-gradient-to-r from-transparent via-accent/80 to-transparent"
                      animate={{ opacity: [0.35, 1, 0.35], scaleX: [0.86, 1.08, 0.86] }}
                      transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
                    />
                  </motion.div>
                )}
              </motion.div>
            </section>
          </motion.div>

          {/* 第二屏：核心服务矩阵 */}
          <motion.div
            initial={shouldReduceMotion ? false : "hidden"}
            whileInView={shouldReduceMotion ? undefined : "visible"}
            viewport={{ once: true, margin: "-8% 0px -8% 0px" }}
            variants={shouldReduceMotion ? undefined : sectionRevealVariants}
            className="min-h-screen relative"
          >
            <SectionBackground zIndex={0} />
            <div className="relative z-10 h-full flex items-center justify-center">
              <CoreServiceMatrix />
            </div>
          </motion.div>

          {/* 第三屏：核心技术壁垒 */}
          <motion.div
            initial={shouldReduceMotion ? false : "hidden"}
            whileInView={shouldReduceMotion ? undefined : "visible"}
            viewport={{ once: true, margin: "-8% 0px -8% 0px" }}
            variants={shouldReduceMotion ? undefined : sectionRevealVariants}
            className="min-h-screen relative"
          >
            <SectionBackground zIndex={0} />
            <div className="relative z-10 h-full flex items-center justify-center">
              <FlipCardReplicaSection />
            </div>
          </motion.div>

          {/* 第五屏：服务流程 */}
          <motion.div
            initial={shouldReduceMotion ? false : "hidden"}
            whileInView={shouldReduceMotion ? undefined : "visible"}
            viewport={{ once: true, margin: "-8% 0px -8% 0px" }}
            variants={shouldReduceMotion ? undefined : sectionRevealVariants}
            className="relative z-10 mb-20 flex min-h-[100vh] flex-col overflow-hidden sm:mb-24 lg:mb-32 lg:min-h-[120vh]"
          >
            <div className="relative z-10 flex-1">
              <ServiceProcessSection />
            </div>
          </motion.div>

          {/* 第六屏：合作案例展示区 */}
          {/* <div className="h-screen relative z-10 flex items-center justify-center bg-gray-900">
            <div className="relative z-10 w-full">
              <PartnersSection />
            </div>
          </div> */}

          {/* 第七屏：数据统计区域 */}
          <motion.div 
            className="min-h-screen flex items-center justify-center relative z-20"
            initial={shouldReduceMotion ? false : "hidden"}
            whileInView={shouldReduceMotion ? undefined : "visible"}
            viewport={{ once: true, margin: "-8% 0px -8% 0px" }}
            variants={shouldReduceMotion ? undefined : sectionRevealVariants}
          >
            <section className="container mx-auto px-4 sm:px-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <h2 className="font-display mb-8 text-center text-2xl font-bold leading-[1.1] tracking-[-0.03em] text-white sm:mb-10 sm:text-3xl md:mb-12 md:text-4xl">
                  {'\u5df2\u7ecf\u7d22\u5f15\u7684'} <span className="text-accent">{'\u6cc4\u9732\u603b\u6570'}</span>
                </h2>
                
                <DataDashboard />
              </motion.div>
            </section>
          </motion.div>

          {/* 第八屏：行动召唤与页脚 */}
          <div className="w-full">
            <section className="relative flex w-full flex-col items-center justify-center overflow-hidden py-20 text-center sm:py-28 md:py-32 lg:py-40">
              {/* 背景图片层 */}
              <div className="absolute inset-0 z-0">
                <img src="/mimi.jpg" alt="Background" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50" />
              </div>
              
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6 }}
                className="relative z-10 mx-auto max-w-4xl px-4"
              >
                <h2 className="font-display mb-4 text-2xl font-bold leading-[1.08] tracking-[-0.03em] text-white sm:mb-6 sm:text-3xl md:text-4xl lg:text-5xl">
                  准备好保护您的数据了吗？
                </h2>
                <p className="mx-auto mb-6 max-w-2xl text-sm text-white/88 sm:mb-8 sm:text-lg md:mb-10 md:text-xl">
                  让安全，从被动防御升级为情报驱动的主动防御。
                </p>
                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: "0 10px 25px -5px rgba(255, 255, 255, 0.2)" }}
                  whileTap={{ scale: 0.98 }}
                  className="mx-auto flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-accent px-6 py-3 text-base font-medium text-white shadow-xl hover:bg-accent/90 sm:w-auto sm:px-8 sm:py-4 sm:text-lg md:px-10 md:py-5"
                  onClick={() => navigate('/login')}
                >
                  登录并开始使用
                  <ArrowRight className="w-4 sm:w-5 h-4 sm:h-5" />
                </motion.button>
              </motion.div>
            </section>
          </div>
          
          {/* 页脚遮挡层，确保页脚始终被遮挡，直到滚动到页面底部 */}
          <div className="relative z-10 h-[220px] w-full bg-[#080C12] sm:h-[240px] lg:h-[260px]"></div>
      </div>

      {/* Parallax Footer */}
      <div className="fixed bottom-0 left-0 z-0 h-[220px] w-full sm:h-[240px] lg:h-[260px]">
        <Footer />
      </div>
    </div>
  );
};

export default Home;
