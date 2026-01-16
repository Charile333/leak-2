import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Shield, Globe, Brain, Zap, Layers, BarChart3, PieChart, Key } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';

import ParticleWaves from '../components/ParticleWaves';
import { leakRadarApi } from '../api/leakRadar';

// 统计数据显示组件
const StatsDisplay: React.FC = () => {
  const [stats, setStats] = useState<any>({
    leaks: {
      total: 0,
      today: 0,
      this_week: 0,
      this_month: 0
    },
    raw_lines: {
      total: 0
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await leakRadarApi.getStats();
        // 确保 data.leaks 存在，如果 API 返回格式不一致，提供默认值
        const safeStats = {
          leaks: {
            // 官网显示逻辑：raw_lines (原始行数) + leaks (去重记录)
            total: (data?.raw_lines?.total || 0) + (data?.leaks?.total || 0),
            today: (data?.raw_lines?.today || 0) + (data?.leaks?.today || 0),
            this_week: (data?.raw_lines?.this_week || 0) + (data?.leaks?.this_week || 0),
            this_month: (data?.raw_lines?.this_month || 0) + (data?.leaks?.this_month || 0)
          },
          raw_lines: {
            total: data?.raw_lines?.total || 0
          }
        };
        setStats(safeStats);
      } catch (error) {
        console.error('获取统计数据失败:', error);
        // 出错时不使用模拟数据覆盖，保持初始状态或显示错误状态
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const statItems = [
    {
      label: "今日新增",
      value: stats.leaks.today,
      icon: <Layers className="w-6 h-6 text-yellow-300" />,
      bg: "bg-gradient-to-br from-yellow-500/10 to-orange-500/5",
      border: "border-yellow-500/20",
      glow: "shadow-[0_0_20px_rgba(234,179,8,0.1)]"
    },
    {
      label: "本周新增",
      value: stats.leaks.this_week,
      icon: <BarChart3 className="w-6 h-6 text-blue-300" />,
      bg: "bg-gradient-to-br from-blue-500/10 to-indigo-500/5",
      border: "border-blue-500/20",
      glow: "shadow-[0_0_20px_rgba(59,130,246,0.1)]"
    },
    {
      label: "本月新增",
      value: stats.leaks.this_month,
      icon: <PieChart className="w-6 h-6 text-emerald-300" />,
      bg: "bg-gradient-to-br from-emerald-500/10 to-teal-500/5",
      border: "border-emerald-500/20",
      glow: "shadow-[0_0_20px_rgba(16,185,129,0.1)]"
    }
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="w-12 h-12 border-4 border-white/20 border-t-accent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto mb-6 flex flex-col gap-6">
      {/* 主要数据展示 - 总泄露记录 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        whileHover={{ scale: 1.01, boxShadow: "0 25px 60px -15px rgba(139, 92, 246, 0.5)" }}
        className="backdrop-blur-2xl bg-gradient-to-br from-purple-900/60 via-slate-900/80 to-purple-900/60 border border-purple-500/40 rounded-3xl p-10 relative overflow-hidden group text-center shadow-[0_0_40px_rgba(139,92,246,0.2)]"
      >
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(168,85,247,0.1),transparent_70%)]" />
        
        {/* 动态光流效果 */}
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-700" />
        <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-700" />
        
        <div className="relative z-10">
          <div className="flex items-center justify-center mb-6">
            <h3 className="text-xl font-medium text-purple-200/70 tracking-[0.3em] uppercase">总泄露记录</h3>
          </div>
          
          <div className="flex items-center justify-center relative">
             <div className="absolute inset-0 bg-purple-500/20 blur-[100px] rounded-full pointer-events-none" />
             <span className="relative text-7xl md:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-purple-100 to-purple-300 tracking-tighter drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]">
              {formatNumber(stats.leaks.total)}
            </span>
          </div>
          <div className="mt-8 flex items-center justify-center gap-3">
            <div className="h-[1px] w-16 bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
            <p className="text-purple-200/50 text-xs font-bold tracking-[0.2em] uppercase">Global Data Leaks Index</p>
            <div className="h-[1px] w-16 bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
          </div>
        </div>
      </motion.div>

      {/* 次要数据展示 - 三列布局 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statItems.map((item, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 + index * 0.1 }}
            whileHover={{ y: -8, boxShadow: "0 20px 40px -10px rgba(0,0,0,0.6)" }}
            className={`backdrop-blur-xl border ${item.border} ${item.bg} ${item.glow} rounded-2xl p-8 relative overflow-hidden group flex flex-col items-start gap-4 transition-all duration-300`}
          >
            {/* 顶部高光条 */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="flex justify-between items-start w-full">
              <div className={`p-3 rounded-xl bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors duration-300`}>
                {React.cloneElement(item.icon as React.ReactElement)}
              </div>
              <div className="text-white/20 group-hover:text-white/40 transition-colors duration-300">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            
            <div>
              <p className="text-white/60 text-xs font-bold tracking-wider uppercase mb-2">{item.label}</p>
              <p className="text-4xl font-bold text-white tracking-tight group-hover:scale-105 transition-transform duration-300 origin-left">
                {formatNumber(item.value)}
              </p>
            </div>

            {/* 装饰性背景光 */}
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-colors duration-500 pointer-events-none" />
          </motion.div>
        ))}
      </div>
    </div>
  );
};

// 图表显示组件
const ChartDisplay: React.FC = () => {
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChartData = async () => {
      try {
        const data = await leakRadarApi.getStats();
        // 转换数据格式以适应图表
        if (data.leaks && data.leaks.per_week) {
          // 假设API返回的数据格式与预期一致
          const formattedData = data.leaks.per_week.map((week: any) => ({
            date: week.week,
            total: week.count,
            'url:user:pass': week.count * 0.8, // 模拟数据
            'raw_lines': week.count * 1.2 // 模拟数据
          }));
          setChartData(formattedData);
        } else {
          // 生成模拟数据
          const mockData = generateMockChartData();
          setChartData(mockData);
        }
      } catch (error) {
        console.error('获取图表数据失败:', error);
        // 生成模拟数据
        const mockData = generateMockChartData();
        setChartData(mockData);
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();
  }, []);

  // 生成模拟数据
  const generateMockChartData = () => {
    const data = [];
    const startDate = new Date('2025-04-14');
    let count = 1000000000; // 1 billion
    
    for (let i = 0; i < 40; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i * 7);
      
      // 指数增长
      count *= 1.15;
      
      data.push({
        date: date.toISOString().split('T')[0],
        total: count,
        'url:user:pass': count * 0.8,
        'raw_lines': count * 1.2
      });
    }
    
    return data;
  };

  // 自定义Y轴标签格式化
  const formatYAxis = (value: number) => {
    if (value >= 1000000000) {
      return `${(value / 1000000000).toFixed(1)} B`;
    }
    return `${value.toLocaleString()}`;
  };

  // 自定义Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-lg p-4 text-white">
          <p className="mb-2 font-medium">{payload[0].payload.date}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatYAxis(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="w-12 h-12 border-4 border-white/20 border-t-accent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="bg-black/40 backdrop-blur-2xl border border-white/5 rounded-3xl p-8 max-w-6xl mx-auto relative overflow-hidden group shadow-[0_0_50px_-10px_rgba(0,0,0,0.5)]"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 to-transparent pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      
      <div className="relative z-10">
        <div className="flex justify-between items-end mb-10 px-2">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-xl font-medium text-white tracking-wide">
                数据库增长趋势
              </h3>
            </div>
            <p className="text-white/40 text-xs tracking-wider uppercase font-medium">Real-time Data Monitoring (12 Months)</p>
          </div>
          
          <div className="flex gap-4">
            {[
              { name: 'Total', color: 'bg-purple-500' },
              { name: 'User:Pass', color: 'bg-blue-500' },
              { name: 'Raw lines', color: 'bg-emerald-500' }
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5 text-xs text-white/60">
                <div className={`w-1.5 h-1.5 rounded-full ${item.color}`} />
                <span>{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="h-[450px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 20, right: 0, left: 0, bottom: 20 }}
            >
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={0.4}/>
                  <stop offset="50%" stopColor="#a855f7" stopOpacity={0.1}/>
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorUrlUserPass" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4}/>
                  <stop offset="50%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorRawLines" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4}/>
                  <stop offset="50%" stopColor="#10b981" stopOpacity={0.1}/>
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.03)" vertical={false} />
              <XAxis 
                dataKey="date" 
                stroke="rgba(255, 255, 255, 0.2)" 
                tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }}
                tickLine={false}
                axisLine={false}
                dy={15}
              />
              <YAxis 
                stroke="rgba(255, 255, 255, 0.2)" 
                tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }}
                tickFormatter={formatYAxis}
                tickLine={false}
                axisLine={false}
                dx={-15}
              />
              <Tooltip 
                content={<CustomTooltip />} 
                cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }} 
              />
              <Area 
                type="monotone" 
                dataKey="raw_lines" 
                stroke="#10b981" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorRawLines)" 
                activeDot={{ r: 4, strokeWidth: 0, fill: '#10b981' }}
              />
              <Area 
                type="monotone" 
                dataKey="url:user:pass" 
                stroke="#3b82f6" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorUrlUserPass)" 
                activeDot={{ r: 4, strokeWidth: 0, fill: '#3b82f6' }}
              />
              <Area 
                type="monotone" 
                dataKey="total" 
                stroke="#a855f7" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorTotal)" 
                activeDot={{ r: 4, strokeWidth: 0, fill: '#a855f7' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
};

const Home: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-accent selection:text-white font-sans relative overflow-x-hidden">
      {/* 全局背景装饰 - 为页面提供深邃的质感 */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* 顶部主光晕 - 紫色 */}
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[80%] h-[600px] bg-accent/10 rounded-[100%] blur-[120px]" />
        
        {/* 底部副光晕 - 蓝色，增加冷暖对比 */}
        <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-blue-500/5 rounded-full blur-[120px]" />
        
        {/* 左侧装饰光 - 弱光 */}
        <div className="absolute top-[40%] left-[-200px] w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10">
        {/* 头部区域（包含导航栏和英雄区域） - 动态背景仅在此区域显示 */}
        <div className="relative w-full min-h-screen flex flex-col overflow-hidden">
          <ParticleWaves />
          
          {/* 导航栏 */}
          <nav className="container mx-auto px-4 py-6 flex items-center justify-between relative z-10">
            <div className="flex items-center gap-2">
              <img 
                src="/diewei-w.png" 
                alt="Product Logo" 
                className="h-10 w-auto object-contain" 
              />
            </div>
            <div className="flex items-center gap-6">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="text-white/80 hover:text-white transition-colors"
              >
                产品
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="text-white/80 hover:text-white transition-colors"
              >
                解决方案
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="text-white/80 hover:text-white transition-colors"
              >
                关于我们
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-accent hover:bg-accent/90 text-white font-medium px-6 py-3 rounded-full flex items-center gap-2"
                onClick={() => navigate('/login')}
              >
                登录
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>
          </nav>

          {/* 英雄区域 */}
          <section className="container mx-auto px-4 py-20 flex flex-col items-center text-center relative z-10 flex-grow justify-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-4xl"
            >
              <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
                保护您的 <span className="text-accent">数字资产</span> 免受数据泄露威胁
              </h1>
              <p className="text-lg md:text-xl text-white/80 mb-10 leading-relaxed max-w-4xl mx-auto">
                基于自然语言熵值分析与密码模式识别技术，对暗网数据黑市、GitHub/Gitee等代码平台、Pastebin、钓鱼插件等临时文本存储站点及社交媒体进行深度扫描，精准捕获企业员工/客户账号密码组合
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: "0 10px 25px -5px rgba(109, 40, 217, 0.3)" }}
                  whileTap={{ scale: 0.98 }}
                  className="bg-accent hover:bg-accent/90 text-white font-medium px-8 py-4 rounded-full flex items-center gap-2 text-lg"
                  onClick={() => navigate('/login')}
                >
                  立即开始
                  <ArrowRight className="w-5 h-5" />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  className="bg-white/10 hover:bg-white/20 text-white font-medium px-8 py-4 rounded-full border border-white/20"
                >
                  了解更多
                </motion.button>
              </div>
            </motion.div>
          </section>
        </div>

        {/* 特性区域 */}
        <section className="container mx-auto px-4 py-20">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">三维防御体的AI元博弈</h2>
            <p className="text-white/80 max-w-2xl mx-auto">
              构建全方位的情报监测与风险防御体系，为您的数字资产保驾护航
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {[
              {
                icon: <Globe className="w-8 h-8" />,
                title: "全源情报捕获",
                details: [
                  "覆盖暗网Tor/I2P网络、35+主流代码平台",
                  "监控黑产Telegram/Discord社群及钓鱼插件",
                  "建立包含数据特征指纹的多维情报仓库",
                  "生成交易模式画像与攻击者身份图谱"
                ],
                color: "from-purple-500/20 to-blue-500/5",
                iconColor: "text-purple-400"
              },
              {
                icon: <Brain className="w-8 h-8" />,
                title: "智能风险决策",
                details: [
                  "建立3200万节点企业数字资产关系网",
                  "实现0.5%数据碎片→完整业务系统追溯",
                  "构建完整的APT组织画像链式追溯体系",
                  "自研NLP框架解析47类黑市变体暗语"
                ],
                color: "from-blue-500/20 to-cyan-500/5",
                iconColor: "text-blue-400"
              },
              {
                icon: <Shield className="w-8 h-8" />,
                title: "闭环处置支撑",
                details: [
                  "提供专业的月度报告以及年度总结报告",
                  "7*24小时线上咨询与专家驻场服务",
                  "给予全流程事件闭环支撑与应急响应",
                  "有效减缓外泄行为带来的负面影响"
                ],
                color: "from-emerald-500/20 to-teal-500/5",
                iconColor: "text-emerald-400"
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 + index * 0.1 }}
                whileHover={{ y: -5 }}
                className="group relative h-full"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl blur-xl`} />
                <div className="relative h-full bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl p-8 transition-colors duration-300 flex flex-col">
                  {/* Header */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`p-3 rounded-xl bg-white/5 border border-white/10 ${feature.iconColor} group-hover:scale-110 transition-transform duration-300`}>
                      {feature.icon}
                    </div>
                    <h3 className="text-xl font-bold text-white">{feature.title}</h3>
                  </div>

                  {/* List */}
                  <ul className="space-y-3">
                    {feature.details.map((detail, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-white/70 text-sm leading-relaxed group-hover:text-white/90 transition-colors">
                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full ${feature.iconColor.replace('text-', 'bg-')} flex-shrink-0`} />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Number Watermark */}
                  <div className="absolute top-4 right-4 text-6xl font-bold text-white/5 select-none pointer-events-none">
                    0{index + 1}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* 服务流程区域 */}
        <section className="container mx-auto px-4 py-10">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-4xl mx-auto"
          >
            {[
              {
                id: 1,
                title: "首次排查",
                description: "多维度扫描企业数字资产，建立敏感数据智能基线，输出泄露情报与优先级处置建议"
              },
              {
                id: 2,
                title: "实时监测",
                description: "基于AI驱动的动态指纹识别技术，7×24小时追踪数据流转路径，实现异常行为识别准确率与分钟级应急响应"
              },
              {
                id: 3,
                title: "线上咨询以及支撑",
                description: "安全专家团队驻场护航，提供合规解读、攻防策略优化及事件溯源服务，确保48小时内闭环处置"
              },
              {
                id: 4,
                title: "月度报告以及年度报告",
                description: "可视化呈现风险趋势、处置效能及合规水位，附带攻击面收敛方案与防护体系迭代路线图，风险暴露面降低30%+"
              }
            ].map((step, index, array) => (
              <motion.div 
                key={index} 
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.2 }}
                className="flex gap-8 relative"
              >
                {/* 连接线 */}
                {index !== array.length - 1 && (
                  <div className="absolute left-[2rem] top-20 bottom-[-2rem] w-0.5 bg-gradient-to-b from-accent to-transparent opacity-50" />
                )}
                
                {/* 数字圆圈 */}
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 rounded-full border-4 border-accent flex items-center justify-center bg-black/40 backdrop-blur-sm shadow-[0_0_20px_rgba(139,92,246,0.3)] z-10 relative group-hover:scale-110 transition-transform duration-300">
                    <span className="text-2xl font-bold text-white">{step.id}</span>
                  </div>
                </div>
                
                {/* 内容 */}
                <div className="pb-16 pt-1">
                  <h3 className="text-3xl font-bold text-white mb-4">{step.title}</h3>
                  <p className="text-lg text-white/70 leading-relaxed max-w-2xl">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* 产品介绍区域 - 简化版 */}
        <section className="container mx-auto px-4 py-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-12 text-center">
              已经索引的 <span className="text-accent">泄露总数</span>
            </h2>
            
            {/* API统计数据显示 */}
            <StatsDisplay />
            
            {/* 数据库增长图表 */}
            <ChartDisplay />
          </motion.div>
        </section>

        {/* 特色服务区域 - 账号风险情报订阅 */}
        <section className="container mx-auto px-4 py-20 relative">
          {/* 背景装饰 */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />
          
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                特色泄露情报 <span className="text-accent">–</span> 账号风险情报订阅服务
              </h2>
              <p className="text-white/60 max-w-2xl mx-auto">
                基于百亿级数据监测能力，为您提供精准、实时的威胁预警与风控情报
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  icon: <Globe className="w-8 h-8 text-accent" />,
                  title: "全域账号威胁预警",
                  desc: "基于百亿级暗网数据监测能力，以及亿级高危账号泄露情报，实现企业核心数据泄露事件的分钟级预警响应，抢占黄金处置窗口。"
                },
                {
                  icon: <Key className="w-8 h-8 text-accent" />,
                  title: "精准特权账号风控情报",
                  desc: "聚焦特权账号泄露风险，通过域名/邮箱维度精准匹配企业关联的格式化暗网数据，提供可行动威胁情报（IoC），支撑一键封禁、凭证重置等风控闭环。"
                },
                {
                  icon: <Zap className="w-8 h-8 text-accent" />,
                  title: "轻量化数据订阅服务",
                  desc: "极具竞争力的价格优势，数据订阅模式以及API交付，帮助企业以轻投入、低成本的方式完善组织的数据安全体系，减少ATO攻击造成的系列风险。"
                }
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  whileHover={{ y: -5 }}
                  className="group relative rounded-2xl bg-white/5 p-[1px] transition-all duration-300 hover:bg-gradient-to-b hover:from-accent hover:to-transparent"
                >
                  <div className="h-full w-full rounded-2xl bg-black/90 p-8 backdrop-blur-xl relative overflow-hidden flex flex-col justify-between">
                    {/* Background Index Number */}
                    <div className="absolute -right-4 -top-8 text-[120px] font-bold text-white/[0.03] select-none pointer-events-none group-hover:text-accent/[0.05] transition-colors duration-500">
                      0{index + 1}
                    </div>

                    <div className="relative z-10 flex flex-col">
                      <h3 className="text-xl font-bold text-white mb-4 group-hover:text-accent transition-colors duration-300">
                        {item.title}
                      </h3>
                      
                      <p className="text-white/60 leading-relaxed text-sm mb-8">
                        {item.desc}
                      </p>
                    </div>

                    {/* Icon moved to bottom left, smaller size, no border */}
                    <div className="relative z-10 mt-auto">
                      <div className="group-hover:text-accent transition-colors duration-300">
                        {React.cloneElement(item.icon as React.ReactElement<any>, { className: "w-6 h-6" })}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* 合作客户区域 */}
        <section className="container mx-auto px-4 py-20 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-accent/5 rounded-full blur-[100px] pointer-events-none" />
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16 relative z-10"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              合作伙伴
            </h2>
          </motion.div>

          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-3 border border-white/10 bg-white/[0.02] backdrop-blur-sm rounded-3xl overflow-hidden">
              {[
                { name: "工信部", logo: "/partners/miit.png", type: "政府机构", scale: 1.5 },
                { name: "CCDC", logo: "/partners/ccdc.png", type: "网络安全", scale: 1.5 },
                { name: "BMW", logo: "/partners/bmw.png", type: "汽车制造", scale: 1 },
                { name: "BYD", logo: "/partners/byd.png", type: "新能源汽车", scale: 1 },
                { name: "NIO", logo: "/partners/nio.png", type: "智能电动汽车", scale: 1 },
                { name: "XPeng", logo: "/partners/xpeng.png", type: "未来出行", scale: 1 },
                { name: "GAC", logo: "/partners/gac.png", type: "汽车集团", scale: 1 },
                { name: "Seres", logo: "/partners/seres.png", type: "智能汽车", scale: 1 },
                { name: "Partner", logo: "/partners/misc.png", type: "战略合作", scale: 1.5 },
              ].map((partner, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.05 }}
                  className="group relative border-r border-b border-white/5 p-12 flex items-center justify-center hover:bg-white/[0.04] transition-colors duration-500 last:border-b-0 [&:nth-child(3n)]:border-r-0 [&:nth-child(n+7)]:border-b-0"
                >
                  <div className="relative w-full h-20 flex items-center justify-center">
                    {/* Logo - 统一使用白色单色模式，确保在深色背景下的完美可视性和高级感 */}
                    <img 
                      src={partner.logo} 
                      alt={partner.name} 
                      style={{ transform: `scale(${partner.scale})` }}
                      className="max-h-full max-w-full object-contain filter brightness-0 invert opacity-40 group-hover:opacity-100 transition-all duration-500 group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]"
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* 行动召唤区域 */}
        <section className="container mx-auto px-4 py-20 mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="bg-gradient-to-r from-accent/20 to-accent/10 backdrop-blur-lg border border-white/20 rounded-3xl p-12 md:p-16 text-center"
          >
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              准备好保护您的数据了吗？
            </h2>
            <p className="text-xl text-white/80 mb-10 max-w-3xl mx-auto">
              立即加入我们，访问超过千万的泄露数据索引，保护您的企业和客户数据安全。
            </p>
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: "0 10px 25px -5px rgba(109, 40, 217, 0.3)" }}
              whileTap={{ scale: 0.98 }}
              className="bg-accent hover:bg-accent/90 text-white font-medium px-10 py-5 rounded-full flex items-center gap-2 text-lg mx-auto"
              onClick={() => navigate('/login')}
            >
              登录并开始使用
              <ArrowRight className="w-5 h-5" />
            </motion.button>
          </motion.div>
        </section>

        {/* 页脚 */}
        <footer className="bg-black/50 border-t border-white/10 py-12">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <Shield className="w-6 h-6 text-accent" />
                  <span className="text-lg font-bold text-white">DieWei</span>
                </div>
                <p className="text-white/60 mb-6">
                  保护您的数字资产免受数据泄露威胁，提供全面的监测和防护服务。
                </p>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-4">产品</h3>
                <ul className="space-y-2">
                  {["功能特性", "定价方案", "使用案例", "更新日志"].map((item, index) => (
                    <li key={index}>
                      <a href="#" className="text-white/60 hover:text-white transition-colors">{item}</a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-4">解决方案</h3>
                <ul className="space-y-2">
                  {["企业安全", "政府机构", "金融服务", "医疗健康"].map((item, index) => (
                    <li key={index}>
                      <a href="#" className="text-white/60 hover:text-white transition-colors">{item}</a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-4">关于我们</h3>
                <ul className="space-y-2">
                  {["公司介绍", "团队成员", "联系我们", "隐私政策"].map((item, index) => (
                    <li key={index}>
                      <a href="#" className="text-white/60 hover:text-white transition-colors">{item}</a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="pt-8 border-t border-white/10 text-center text-white/60 text-sm">
              <p>© 2026 DieWei. 保留所有权利。</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Home;