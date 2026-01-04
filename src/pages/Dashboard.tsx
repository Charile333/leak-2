import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import { 
  Search, 
  Bug, 
  Key, 
  Zap as Bolt,
  Download,
  Shield,
  User,
  Users,
  Briefcase,
  LayoutGrid,
  Globe,
  Calendar,
  Link as LinkIcon,
  Loader2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  ChevronLeft,
  UserCheck,
  ShieldAlert,
  UserMinus,
  Activity
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { cn } from '../lib/utils';
import { dataService } from '../services/dataService';
import type { LeakedCredential, DomainSearchSummary } from '../services/dataService';
import { leakRadarApi } from '../api/leakRadar';
import { otxApi } from '../api/otxApi';

const AnimatedNumber = ({ value }: { value: string }) => {
  const numericValue = parseInt(value.replace(/,/g, '')) || 0;
  const count = useSpring(0, {
    mass: 1,
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });
  const display = useTransform(count, (latest) => 
    Math.floor(latest).toLocaleString()
  );

  useEffect(() => {
    count.set(numericValue);
  }, [numericValue, count]);

  return <motion.span>{display}</motion.span>;
};

const Dashboard = () => {
  const location = useLocation();
  const isDnsPage = location.pathname === '/dns';
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [activeTab, setActiveTab] = useState('报告');
  const [filterType, setFilterType] = useState<'All' | 'Email' | 'Username'>('All');
  const [innerSearchQuery, setInnerSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [results, setResults] = useState<{ summary: DomainSearchSummary, credentials: LeakedCredential[] } | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const autoUnlock = true; // 固定开启自动解锁
  const [totalLeaks, setTotalLeaks] = useState<string>('---,---,---,---');
  const [weeklyGrowth, setWeeklyGrowth] = useState<any[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize] = useState(100);
  // 保存各个分类的数据，避免替换原始完整数据
  const [categoryCredentials, setCategoryCredentials] = useState<Record<string, LeakedCredential[]>>({});
  // 控制骨架屏显示
  const [isLoadingCategory, setIsLoadingCategory] = useState(false);
  
  // 当页签切换时，滚动到结果区域顶部
  useEffect(() => {
    // 只有当 showResults 为 true 且不是初始化状态时才触发
    if (showResults && activeTab) {
      // 避免在此副作用中重置状态导致无限循环
      // setFilterType('All'); 
      // setInnerSearchQuery(''); 
      // setCurrentPage(0); 

      const resultElement = document.getElementById('search-results');
      if (resultElement) {
        // 延迟执行以确保内容已开始渲染
        const timer = setTimeout(() => {
          resultElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
        return () => clearTimeout(timer);
      }
    }
  }, [activeTab, showResults]);

  // 当 Tab 变化时，重置筛选和页码 (独立副作用)
  useEffect(() => {
    if (showResults) {
      setFilterType('All');
      setInnerSearchQuery('');
      setCurrentPage(0);
    }
  }, [activeTab]);
  
  // 当标签页切换到URLs或Subdomains时，如果没有缓存数据，自动加载数据
  useEffect(() => {
    if (showResults && activeTab && searchQuery) {
      const categoryMap: Record<string, string> = {
        '员工': 'employees',
        '客户': 'customers',
        '第三方': 'third_parties',
        'URLs': 'urls',
        '子域名': 'subdomains'
      };
      const currentCategory = categoryMap[activeTab];
      
      // 对于URLs和Subdomains标签页，如果没有缓存数据，自动加载
      if (currentCategory && (currentCategory === 'urls' || currentCategory === 'subdomains') && !categoryCredentials[currentCategory]) {
        handleSearch(undefined, 'default', 0);
      }
    }
  }, [activeTab, showResults, categoryCredentials, searchQuery]);
  
  // Fetch global stats
  React.useEffect(() => {
    const fetchStats = async () => {
      try {
        setIsLoadingStats(true);
        const stats = await leakRadarApi.getStats();
        
        const safeNumber = (val: any) => {
          const n = Number(val);
          return isNaN(n) ? 0 : n;
        };

        if (stats) {
          const statsObj = (stats as any).data || (stats as any).stats || stats;
          const rawTotal = safeNumber(statsObj.raw_lines?.total || statsObj.total_lines);
          const leaksTotal = safeNumber(statsObj.leaks?.total || statsObj.total_leaks);
          const total = safeNumber(statsObj.total_indexed || (rawTotal + leaksTotal) || statsObj.total);

          if (total > 0) {
            setTotalLeaks(total.toLocaleString());
          }

          const leaksWeekly = statsObj.leaks?.per_week || [];
          const rawWeekly = statsObj.raw_lines?.per_week || [];
          const maxLen = Math.max(leaksWeekly.length, rawWeekly.length);

          if (maxLen > 0) {
            let runningTotal = total;
            const currentLeaksTotal = safeNumber(statsObj.leaks?.total || (total * 0.19));
            const currentRawTotal = safeNumber(statsObj.raw_lines?.total || (total * 0.81));
            
            let runningLeaks = currentLeaksTotal;
            let runningRaw = currentRawTotal;

            const growthData = Array.from({ length: maxLen }, (_, i) => {
              const lIdx = leaksWeekly.length - 1 - i;
              const rIdx = rawWeekly.length - 1 - i;
              const leaksInc = lIdx >= 0 ? safeNumber(leaksWeekly[lIdx].count) : 0;
              const rawInc = rIdx >= 0 ? safeNumber(rawWeekly[rIdx].count) : 0;
              const weeklyInc = leaksInc + rawInc;
              
              const weekDate = leaksWeekly[lIdx]?.week || rawWeekly[rIdx]?.week;
              const dateStr = weekDate ? `Week of ${weekDate}` : `Week -${i}`;

              const previousTotal = runningTotal - weeklyInc;
              const growthRate = previousTotal > 0 ? ((weeklyInc / previousTotal) * 100).toFixed(1) : '0';

              const dp = {
                date: dateStr,
                displayDate: i === 0 ? '本周' : (i % 8 === 0 ? (weekDate || '') : ''),
                total: Math.floor(runningTotal),
                leaks: Math.floor(runningLeaks),
                raw: Math.floor(runningRaw),
                weeklyTotal: Math.floor(weeklyInc),
                growth: growthRate
              };

              // 逆向递减，生成历史轨迹
              runningTotal -= weeklyInc;
              runningLeaks -= leaksInc;
              runningRaw -= rawInc;
              
              return dp;
            }).reverse();

            if (growthData.length < 52) {
              const paddingCount = 52 - growthData.length;
              const firstDate = new Date(Date.now() - (growthData.length - 1) * 7 * 24 * 60 * 60 * 1000);
              const padded = Array.from({ length: paddingCount }, (_, i) => {
                const weekNum = i + 1;
                const d = new Date(firstDate.getTime() - weekNum * 7 * 24 * 60 * 60 * 1000);
                const day = d.getDay() || 7;
                const monday = new Date(d);
                monday.setDate(d.getDate() - day + 1);
                const dateStr = `Week of ${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
                
                // 向前补全使用 0 填充，确保不产生虚假历史数据
                const dp = {
                  date: dateStr,
                  displayDate: (growthData.length + weekNum - 1) % 8 === 0 ? monday.toLocaleDateString() : '',
                  total: 0,
                  leaks: 0,
                  raw: 0,
                  weeklyTotal: 0,
                  growth: '0'
                };
                return dp;
              }).reverse();
              setWeeklyGrowth([...padded, ...growthData]);
            } else {
              setWeeklyGrowth(growthData.slice(-52));
            }
          } else {
            // No weekly data from API
            setWeeklyGrowth([]);
          }
        } else {
          // API failed to return any stats
          setTotalLeaks('0');
          setWeeklyGrowth([]);
        }
      } catch (error) {
        console.error('[Dashboard] Error fetching stats:', error);
        setTotalLeaks('0');
        setWeeklyGrowth([]);
      } finally {
        setIsLoadingStats(false);
      }
    };

    // 移除 generateFallbackData 函数
    
    fetchStats();
  }, []);
  
  // Filter states
  const [sortField] = useState<keyof LeakedCredential>('leaked_at');
  const [sortOrder] = useState<'asc' | 'desc'>('desc');

  const [dnsResults, setDnsResults] = useState<any>(null);
  const [dnsActiveSubTab, setDnsActiveSubTab] = useState('Subdomains');

  // Fix Recharts width error by ensuring container is visible and has size
  useEffect(() => {
    // 增加多次触发，确保在不同渲染阶段都能捕捉到容器尺寸
    const timers = [100, 500, 1000, 2000].map(delay => 
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, delay)
    );
    return () => timers.forEach(t => clearTimeout(t));
  }, [results, activeTab]);

  const handleSearch = async (e?: React.FormEvent, type: 'ipv4' | 'domain' | 'url' | 'cve' | 'search' | 'activity' | 'default' = 'default', page: number = 0) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || isSearching) return;

    setIsSearching(true);
    
    if (isDnsPage) {
      setShowResults(false);
      try {
        let data: any;
        let otxSection = 'general';
        
        if (type === 'default') {
          // 默认检测输入类型并选择合适的API
          if (searchQuery.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
            type = 'ipv4';
          } else if (searchQuery.startsWith('https://') || searchQuery.startsWith('http://')) {
            type = 'url';
          } else if (searchQuery.match(/^CVE-\d{4}-\d{4,7}$/i)) {
            type = 'cve';
          } else {
            type = 'domain';
          }
        }
        
        if (type === 'ipv4') {
          data = await otxApi.getIpInfo(searchQuery, otxSection);
          setDnsResults({ ipv4: data });
          setDnsActiveSubTab('IPv4');
        } else if (type === 'domain') {
          // 获取威胁评分数据 - OTX API中威胁评分通常在general部分
          const generalData = await otxApi.getDomainInfo(searchQuery, 'general');
          // 获取被动DNS记录
          const passiveDnsData = await otxApi.getDomainInfo(searchQuery, 'passive_dns');
          
          // 合并所有数据，确保包含威胁评分
          const mergedData = {
            // 基础信息
            indicator: generalData.indicator || searchQuery,
            // 威胁评分，从general数据中提取
            reputation: generalData.reputation || 0,
            // 被动DNS记录
            passive_dns: {
              results: passiveDnsData.results || []
            }
          };
          
          setDnsResults({ domain: mergedData });
          setDnsActiveSubTab('Domain');
        } else if (type === 'url') {
          data = await otxApi.getUrlInfo(searchQuery, otxSection);
          setDnsResults({ url: data });
          setDnsActiveSubTab('URL');
        } else if (type === 'cve') {
          data = await otxApi.getCveInfo(searchQuery, otxSection);
          setDnsResults({ cve: data });
          setDnsActiveSubTab('CVE');
        } else if (type === 'search') {
          data = await otxApi.searchPulses(searchQuery);
          setDnsResults({ search: data });
          setDnsActiveSubTab('Search');
        } else if (type === 'activity') {
          data = await otxApi.getActivity();
          setDnsResults({ activity: data });
          setDnsActiveSubTab('Activity');
        }
        
        setShowResults(true);
      } catch (error) {
        console.error('OTX Search Error:', error);
        alert('OTX 查询失败，请检查网络或 API Key 设置。');
      } finally {
        setIsSearching(false);
      }
      return;
    }

    if (page === 0) {
      setShowResults(false);
      setCurrentPage(0);
    }
    
    try {
      if (page > 0 || (activeTab === 'URLs' || activeTab === '子域名')) {
        // 分页逻辑：如果当前在特定分类下，只请求该分类的数据
        let category: 'employees' | 'customers' | 'third_parties' | 'urls' | 'subdomains' | null = null;
        if (activeTab === '员工') category = 'employees';
        else if (activeTab === '客户') category = 'customers';
        else if (activeTab === '第三方') category = 'third_parties';
        else if (activeTab === 'URLs') category = 'urls';
        else if (activeTab === '子域名') category = 'subdomains';

        if (category) {
          setIsLoadingCategory(true);
          const newCredentials = await dataService.searchCategory(searchQuery, category, pageSize, page * pageSize);
          // 保存当前分类的数据到 categoryCredentials，不替换原始完整数据
          setCategoryCredentials(prev => ({
            ...prev,
            [category]: newCredentials
          }));
          setIsSearching(false);
          setIsLoadingCategory(false);
          setCurrentPage(page);
          // 确保结果区域显示
          setShowResults(true);
          return;
        }
      }

      const data = await dataService.searchDomain(searchQuery, pageSize, page * pageSize);
      setResults(data);
      setIsSearching(false);
      setShowResults(true);
      setCurrentPage(page);
      
      if (page === 0) {
        setTimeout(() => {
          const resultElement = document.getElementById('search-results');
          if (resultElement) {
            const rect = resultElement.getBoundingClientRect();
            // 如果结果区域的顶部不在视图内（被遮挡或在下方），则滚动到结果区域
            if (rect.top < 0 || rect.top > window.innerHeight * 0.8) {
              resultElement.scrollIntoView({ behavior: 'smooth' });
            }
          }
        }, 100);
      }
    } catch (error) {
      console.error('Search failed:', error);
      setIsSearching(false);
      setIsLoadingCategory(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    handleSearch(undefined, 'default', newPage);
  };

  const filteredCredentials = useMemo(() => {
    if (!results) return [];
    
    // 根据当前活动标签页选择数据源
    let list: LeakedCredential[];
    const categoryMap: Record<string, string> = {
      '员工': 'employees',
      '客户': 'customers',
      '第三方': 'third_parties',
      'URLs': 'urls',
      '子域名': 'subdomains'
    };
    
    const currentCategory = categoryMap[activeTab];
    
    // 对于URLs和子域名标签页，只能从categoryCredentials获取数据
    if (activeTab === 'URLs' || activeTab === '子域名') {
      // 如果没有缓存数据，返回空数组
      if (currentCategory && categoryCredentials[currentCategory]) {
        list = [...categoryCredentials[currentCategory]];
      } else {
        // 返回空数组，等待数据加载
        list = [];
      }
    } else {
      // 对于其他标签页，使用原始数据并过滤
      list = [...results.credentials];
      
      // Tab filtering
      if (activeTab === '报告') {
        // 报告标签页显示所有数据，不需要过滤
      } else if (activeTab === '员工') {
        list = list.filter(c => c.type === 'Employee');
      } else if (activeTab === '第三方') {
        list = list.filter(c => c.type === 'Third-Party');
      } else if (activeTab === '客户') {
        list = list.filter(c => c.type === 'Customer');
      }
    }

    // Category filtering
    if (filterType === 'Email') {
      list = list.filter(c => c.email?.includes('@'));
    } else if (filterType === 'Username') {
      list = list.filter(c => c.email && !c.email.includes('@'));
    }

    // Inner search filtering
    if (innerSearchQuery.trim()) {
      const query = innerSearchQuery.toLowerCase();
      list = list.filter(c => 
        c.email?.toLowerCase().includes(query) || 
        c.website?.toLowerCase().includes(query) ||
        c.password_plaintext?.toLowerCase().includes(query)
      );
    }

    // Sorting
    list.sort((a, b) => {
      // If we are in URLs/子域名 tab, we might want to sort by count
    if ((activeTab === 'URLs' || activeTab === '子域名') && (sortField as string) === 'count') {
        return sortOrder === 'asc' ? (a.count || 0) - (b.count || 0) : (b.count || 0) - (a.count || 0);
      }

      const valA = a[sortField] || '';
      const valB = b[sortField] || '';
      
      // 特殊处理强度排序
      if (sortField === 'strength') {
        const order = { 'Strong': 3, 'Medium': 2, 'Weak': 1, 'Very Weak': 0 };
        const sA = order[a.strength as keyof typeof order] || 0;
        const sB = order[b.strength as keyof typeof order] || 0;
        return sortOrder === 'asc' ? sA - sB : sB - sA;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [results, activeTab, sortField, sortOrder, filterType, innerSearchQuery, categoryCredentials]);

  // 格式化日期为 YYYY/MM/DD
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
    } catch (e) {
      return dateStr;
    }
  };

  const togglePassword = (id: string) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const tabs = [
    { name: '报告', icon: LayoutGrid, count: results?.summary.total ?? 0 },
    { name: '员工', icon: User, count: results?.summary.employees.count ?? 0 },
    { name: '第三方', icon: Briefcase, count: results?.summary.third_parties.count ?? 0 },
    { name: '客户', icon: Users, count: results?.summary.customers.count ?? 0 },
    { name: 'URLs', icon: LinkIcon, count: results?.summary.urls_count ?? 0 },
    { name: '子域名', icon: Globe, count: results?.summary.subdomains_count ?? 0 },
  ];

  const StrengthBar = ({ strength }: { strength: any }) => {
    const total = (strength.strong || 0) + (strength.medium || 0) + (strength.weak || 0) + (strength.very_weak || 0);
    if (total === 0) return <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden" />;
    
    const p1 = ((strength.strong || 0) / total) * 100;
    const p2 = ((strength.medium || 0) / total) * 100;
    const p3 = ((strength.weak || 0) / total) * 100;
    const p4 = ((strength.very_weak || 0) / total) * 100;

    return (
      <div className="h-2 w-full flex rounded-full overflow-hidden">
        <div style={{ width: `${p1}%` }} className="bg-emerald-500" />
        <div style={{ width: `${p2}%` }} className="bg-blue-500" />
        <div style={{ width: `${p3}%` }} className="bg-orange-500" />
        <div style={{ width: `${p4}%` }} className="bg-red-500" />
      </div>
    );
  };

  const fetchDnsSubTab = async (tab: string) => {
    if (!searchQuery) return;

    // 立即更新活动子标签，确保UI响应
    setDnsActiveSubTab(tab);
    setIsSearching(true);
    try {
      let data: any;
      let otxSection = 'general';
      
      switch (tab) {
        case 'IPv4':
          otxSection = 'general';
          data = await otxApi.getIpInfo(searchQuery, otxSection);
          setDnsResults((prev: any) => ({ ...prev, ipv4: data }));
          break;
        case 'Domain':
          // 获取威胁评分数据 - OTX API中威胁评分通常在general部分
          const generalData = await otxApi.getDomainInfo(searchQuery, 'general');
          // 获取被动DNS记录
          const passiveDnsData = await otxApi.getDomainInfo(searchQuery, 'passive_dns');
          
          // 合并所有数据，确保包含威胁评分
          const mergedData = {
            // 基础信息
            indicator: generalData.indicator || searchQuery,
            // 威胁评分，从general数据中提取
            reputation: generalData.reputation || 0,
            // 被动DNS记录
            passive_dns: {
              results: passiveDnsData.results || []
            }
          };
          
          setDnsResults((prev: any) => ({ ...prev, domain: mergedData }));
          break;
        case 'URL':
          otxSection = 'general';
          data = await otxApi.getUrlInfo(searchQuery, otxSection);
          setDnsResults((prev: any) => ({ ...prev, url: data }));
          break;
        case 'CVE':
          otxSection = 'general';
          data = await otxApi.getCveInfo(searchQuery, otxSection);
          setDnsResults((prev: any) => ({ ...prev, cve: data }));
          break;
        case 'Search':
          data = await otxApi.searchPulses(searchQuery);
          setDnsResults((prev: any) => ({ ...prev, search: data }));
          break;
        case 'Activity':
          data = await otxApi.getActivity();
          setDnsResults((prev: any) => ({ ...prev, activity: data }));
          break;
      }
    } catch (error) {
      console.error('Fetch OTX SubTab Error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // IP威胁情报展示组件
  const renderIpThreatInfo = (data: any) => {
    return (
      <div className="space-y-8">
        {/* IP基本信息卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
            <h4 className="text-sm text-gray-400 font-bold uppercase tracking-wider mb-3">IP地址</h4>
            <p className="text-2xl font-black text-white">{data?.indicator || searchQuery}</p>
          </div>
          <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
            <h4 className="text-sm text-gray-400 font-bold uppercase tracking-wider mb-3">地理位置</h4>
            <p className="text-lg font-bold text-white">{data?.country_name || '未知'}</p>
            <p className="text-sm text-gray-500 mt-1">{data?.city || '未知城市'}</p>
          </div>
          <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
            <h4 className="text-sm text-gray-400 font-bold uppercase tracking-wider mb-3">威胁评分</h4>
            <div className="flex items-center gap-3">
              <div className="text-2xl font-black text-red-500">{data?.reputation || 0}/100</div>
              <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-red-500 transition-all duration-500"
                  style={{ width: `${data?.reputation || 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
        
        {/* 威胁详情卡片 */}
        <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
          <h4 className="text-lg font-bold text-white mb-4">威胁详情</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h5 className="text-sm text-gray-400 font-bold mb-2">关联域名</h5>
              {data?.passive_dns?.results?.slice(0, 5).map((record: any, index: number) => (
                <div key={index} className="text-sm text-gray-300 mb-1">{record.hostname}</div>
              )) || <div className="text-sm text-gray-500">暂无数据</div>}
            </div>
            <div>
              <h5 className="text-sm text-gray-400 font-bold mb-2">恶意标签</h5>
              {data?.pulse_info?.tags?.slice(0, 5).map((tag: string, index: number) => (
                <span key={index} className="inline-block bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-xs font-medium mr-2 mb-2">{tag}</span>
              )) || <div className="text-sm text-gray-500">暂无数据</div>}
            </div>
          </div>
        </div>
        
        {/* 完整数据展示（可折叠） */}
        <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
          <h4 className="text-lg font-bold text-white mb-4">完整数据</h4>
          <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap break-all max-h-60 overflow-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    );
  };
  
  // 域名关联情报展示组件
  const renderDomainInfo = (data: any) => {
    // 处理API返回的数据结构，提取所需字段
    const domainData = {
      // 从数据中提取基本信息
      indicator: data?.indicator || searchQuery,
      // 威胁评分，默认值为0
      reputation: data?.reputation || 0,
      // 处理passive_dns数据，确保results字段存在
      passive_dns: {
        results: data?.passive_dns?.results || 
                 []
      }
    };

    return (
      <div className="space-y-8">
        {/* 域名基本信息卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
            <h4 className="text-sm text-gray-400 font-bold uppercase tracking-wider mb-3">域名</h4>
            <p className="text-2xl font-black text-white">{domainData.indicator}</p>
          </div>
          <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
            <h4 className="text-sm text-gray-400 font-bold uppercase tracking-wider mb-3">DNS记录数量</h4>
            <p className="text-2xl font-black text-white">{domainData.passive_dns.results.length || 0}</p>
          </div>
          <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
            <h4 className="text-sm text-gray-400 font-bold uppercase tracking-wider mb-3">威胁评分</h4>
            <div className="flex items-center gap-3">
              <div className="text-2xl font-black text-orange-500">{domainData.reputation}/100</div>
              <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-orange-500 transition-all duration-500"
                  style={{ width: `${domainData.reputation}%` }}
                />
              </div>
            </div>
          </div>
        </div>
        
        {/* DNS记录表格 */}
        <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
          <h4 className="text-lg font-bold text-white mb-4">DNS记录</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-sm text-gray-400 font-bold uppercase tracking-wider">记录类型</th>
                  <th className="px-4 py-3 text-sm text-gray-400 font-bold uppercase tracking-wider">值</th>
                  <th className="px-4 py-3 text-sm text-gray-400 font-bold uppercase tracking-wider">首次检测</th>
                  <th className="px-4 py-3 text-sm text-gray-400 font-bold uppercase tracking-wider">最后检测</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(domainData.passive_dns.results) && domainData.passive_dns.results.length > 0 ? (
                  domainData.passive_dns.results.slice(0, 10).map((record: any, index: number) => (
                    <tr key={index} className="border-b border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-4 text-sm font-medium text-white">{record.record_type || 'A'}</td>
                      <td className="px-4 py-4 text-sm text-gray-300">{record.address || record.hostname || 'N/A'}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">{record.first || 'N/A'}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">{record.last || 'N/A'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">暂无DNS记录</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* 完整数据展示（可折叠） */}
        <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
          <h4 className="text-lg font-bold text-white mb-4">完整数据</h4>
          <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap break-all max-h-60 overflow-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    );
  };
  
  // URL威胁检测展示组件
  const renderUrlInfo = (data: any) => {
    return (
      <div className="space-y-8">
        {/* URL基本信息卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
            <h4 className="text-sm text-gray-400 font-bold uppercase tracking-wider mb-3">URL地址</h4>
            <p className="text-lg font-bold text-white break-all">{data?.indicator || searchQuery}</p>
          </div>
          <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
            <h4 className="text-sm text-gray-400 font-bold uppercase tracking-wider mb-3">威胁状态</h4>
            <div className="flex items-center gap-3">
              <div className={`text-xl font-black ${data?.reputation > 50 ? 'text-red-500' : 'text-green-500'}`}>
                {data?.reputation > 50 ? '危险' : '安全'}
              </div>
              <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${data?.reputation > 50 ? 'bg-red-500' : 'bg-green-500'}`}
                  style={{ width: `${data?.reputation || 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
        
        {/* URL详情卡片 */}
        <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
          <h4 className="text-lg font-bold text-white mb-4">URL详情</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h5 className="text-sm text-gray-400 font-bold mb-3">关联域名</h5>
              <p className="text-sm text-white">{data?.hostname || '未知'}</p>
            </div>
            <div>
              <h5 className="text-sm text-gray-400 font-bold mb-3">IP地址</h5>
              <p className="text-sm text-white">{data?.ip || '未知'}</p>
            </div>
            <div>
              <h5 className="text-sm text-gray-400 font-bold mb-3">恶意标签</h5>
              {data?.pulse_info?.tags?.slice(0, 5).map((tag: string, index: number) => (
                <span key={index} className="inline-block bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-xs font-medium mr-2 mb-2">{tag}</span>
              )) || <div className="text-sm text-gray-500">暂无标签</div>}
            </div>
          </div>
        </div>
        
        {/* 完整数据展示（可折叠） */}
        <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
          <h4 className="text-lg font-bold text-white mb-4">完整数据</h4>
          <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap break-all max-h-60 overflow-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    );
  };
  
  // 漏洞相关情报展示组件
  const renderCveInfo = (data: any) => {
    return (
      <div className="space-y-8">
        {/* CVE基本信息卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
            <h4 className="text-sm text-gray-400 font-bold uppercase tracking-wider mb-3">CVE编号</h4>
            <p className="text-2xl font-black text-white">{data?.indicator || searchQuery}</p>
          </div>
          <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
            <h4 className="text-sm text-gray-400 font-bold uppercase tracking-wider mb-3">CVSS评分</h4>
            <div className="flex items-center gap-3">
              <div className="text-2xl font-black text-red-500">{data?.cvss?.base_score || 0.0}</div>
              <div className="text-sm text-gray-500">/10.0</div>
            </div>
          </div>
          <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
            <h4 className="text-sm text-gray-400 font-bold uppercase tracking-wider mb-3">威胁级别</h4>
            <div className={`text-xl font-black ${data?.cvss?.base_score >= 9.0 ? 'text-red-500' : data?.cvss?.base_score >= 7.0 ? 'text-orange-500' : data?.cvss?.base_score >= 4.0 ? 'text-yellow-500' : 'text-green-500'}`}>
              {data?.cvss?.base_score >= 9.0 ? '严重' : data?.cvss?.base_score >= 7.0 ? '高危' : data?.cvss?.base_score >= 4.0 ? '中危' : '低危'}
            </div>
          </div>
        </div>
        
        {/* CVE详情卡片 */}
        <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
          <h4 className="text-lg font-bold text-white mb-4">漏洞描述</h4>
          <p className="text-gray-300 leading-relaxed">{data?.description || '暂无描述'}</p>
        </div>
        
        {/* 漏洞详情表格 */}
        <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
          <h4 className="text-lg font-bold text-white mb-4">漏洞详情</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h5 className="text-sm text-gray-400 font-bold mb-3">发布日期</h5>
              <p className="text-white font-medium">{data?.published || '未知'}</p>
            </div>
            <div>
              <h5 className="text-sm text-gray-400 font-bold mb-3">更新日期</h5>
              <p className="text-white font-medium">{data?.modified || '未知'}</p>
            </div>
            <div>
              <h5 className="text-sm text-gray-400 font-bold mb-3">影响范围</h5>
              {data?.affected_products?.slice(0, 5).map((product: any, index: number) => (
                <div key={index} className="text-sm text-gray-300 mb-1">{product}</div>
              )) || <div className="text-sm text-gray-500">暂无数据</div>}
            </div>
          </div>
        </div>
        
        {/* 完整数据展示（可折叠） */}
        <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
          <h4 className="text-lg font-bold text-white mb-4">完整数据</h4>
          <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap break-all max-h-60 overflow-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    );
  };
  
  // 情报包搜索结果展示组件
  const renderSearchResults = (data: any) => {
    return (
      <div className="space-y-8">
        {/* 搜索结果统计 */}
        <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
          <h4 className="text-lg font-bold text-white mb-4">搜索结果</h4>
          <p className="text-sm text-gray-500">找到 {data?.results?.length || 0} 个情报包</p>
        </div>
        
        {/* 情报包列表 */}
        <div className="space-y-4">
          {data?.results?.slice(0, 10).map((pulse: any, index: number) => (
            <div key={index} className="bg-white/[0.05] border border-white/10 rounded-2xl p-6 hover:bg-white/[0.08] transition-all">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h5 className="text-lg font-bold text-white">{pulse?.name}</h5>
                  <p className="text-sm text-gray-500 mt-1">{pulse?.author_name}</p>
                </div>
                <div className="text-sm text-gray-400">{pulse?.modified}</div>
              </div>
              <p className="text-gray-300 text-sm mb-4 line-clamp-3">{pulse?.description}</p>
              <div className="flex flex-wrap gap-2">
                {pulse?.tags?.slice(0, 5).map((tag: string, tagIndex: number) => (
                  <span key={tagIndex} className="bg-accent/20 text-accent px-3 py-1 rounded-full text-xs font-medium">{tag}</span>
                ))}
              </div>
            </div>
          )) || (
            <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-8 text-center">
              <p className="text-gray-500">暂无搜索结果</p>
            </div>
          )}
        </div>
        
        {/* 完整数据展示（可折叠） */}
        <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
          <h4 className="text-lg font-bold text-white mb-4">完整数据</h4>
          <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap break-all max-h-60 overflow-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    );
  };
  
  // 实时威胁流展示组件
  const renderActivityStream = (data: any) => {
    return (
      <div className="space-y-8">
        {/* 威胁流统计 */}
        <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
          <h4 className="text-lg font-bold text-white mb-4">实时威胁流</h4>
          <p className="text-sm text-gray-500">共 {data?.results?.length || 0} 条威胁记录</p>
        </div>
        
        {/* 威胁流列表 */}
        <div className="space-y-4">
          {data?.results?.slice(0, 10).map((activity: any, index: number) => (
            <div key={index} className="bg-white/[0.05] border border-white/10 rounded-2xl p-6 hover:bg-white/[0.08] transition-all">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <ShieldAlert className="w-6 h-6 text-red-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-lg font-bold text-white">{activity?.name}</h5>
                    <span className="text-sm text-gray-500">{activity?.created}</span>
                  </div>
                  <p className="text-gray-300 text-sm mb-3">{activity?.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {activity?.tags?.slice(0, 5).map((tag: string, tagIndex: number) => (
                      <span key={tagIndex} className="bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-xs font-medium">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )) || (
            <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-8 text-center">
              <p className="text-gray-500">暂无威胁流数据</p>
            </div>
          )}
        </div>
        
        {/* 完整数据展示（可折叠） */}
        <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-6">
          <h4 className="text-lg font-bold text-white mb-4">完整数据</h4>
          <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap break-all max-h-60 overflow-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    );
  };
  
  const renderDnsResults = () => {
    const currentData = dnsResults?.[dnsActiveSubTab.toLowerCase()];

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* OTX 威胁情报子页签 - 优化摆放和响应式设计 */}
        <div className="flex flex-wrap items-center gap-4 mb-12 justify-center">
          {[
            { id: 'IPv4', label: 'IP 威胁情报', icon: Globe, inputType: 'IP地址' },
            { id: 'Domain', label: '域名关联情报', icon: LayoutGrid, inputType: '域名' },
            { id: 'URL', label: 'URL 威胁检测', icon: LinkIcon, inputType: 'URL地址' },
            { id: 'CVE', label: '漏洞相关情报', icon: ShieldAlert, inputType: 'CVE编号' },
            { id: 'Search', label: '情报包搜索', icon: Search, inputType: '关键词' },
            { id: 'Activity', label: '实时威胁流', icon: Activity, inputType: '无需输入' },
          ].map((tab) => (
            <div key={tab.id} className="flex flex-col items-center gap-2">
              <button
                onClick={() => fetchDnsSubTab(tab.id)}
                className={cn(
                  "flex items-center gap-3 px-6 py-3 rounded-[24px] text-sm font-bold transition-all duration-300 ease-in-out group whitespace-nowrap",
                  "hover:scale-105 active:scale-95",
                  dnsActiveSubTab === tab.id
                    ? "bg-white/10 text-accent shadow-2xl border border-white/10"
                    : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                )}
                aria-pressed={dnsActiveSubTab === tab.id}
                title={`${tab.label} - 支持${tab.inputType}`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="tracking-tight">{tab.label}</span>
              </button>
              <span className="text-xs text-gray-600">{tab.inputType}</span>
            </div>
          ))}
        </div>

        {/* OTX 威胁情报结果展示区域 */}
        <div className="bg-[#1a1a20] border border-white/5 rounded-3xl overflow-hidden shadow-2xl p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                <LayoutGrid className="w-5 h-5 text-accent" />
              </div>
              {dnsActiveSubTab === 'IPv4' && 'IP 威胁情报'}
              {dnsActiveSubTab === 'Domain' && '域名关联情报'}
              {dnsActiveSubTab === 'URL' && 'URL 威胁检测'}
              {dnsActiveSubTab === 'CVE' && '漏洞相关情报'}
              {dnsActiveSubTab === 'Search' && '情报包搜索'}
              {dnsActiveSubTab === 'Activity' && '实时威胁流'}
            </h3>
            <div className="text-xs text-gray-500 font-mono">
              API Status: <span className="text-emerald-500 font-bold">Connected</span>
            </div>
          </div>

          {currentData ? (
            <div className="bg-white/[0.02] rounded-2xl p-6 overflow-auto max-h-[800px]">
              {/* 优化结果展示，添加数据类型提示 */}
              <div className="mb-8 text-sm text-gray-500 pb-4 border-b border-white/10">
                <span className="font-bold">查询内容:</span> {searchQuery}
                <span className="mx-2">|</span>
                <span className="font-bold">数据类型:</span> {dnsActiveSubTab}
              </div>
              
              {/* 根据不同的数据类型渲染不同的展示组件 */}
              {dnsActiveSubTab === 'IPv4' && renderIpThreatInfo(currentData)}
              {dnsActiveSubTab === 'Domain' && renderDomainInfo(currentData)}
              {dnsActiveSubTab === 'URL' && renderUrlInfo(currentData)}
              {dnsActiveSubTab === 'CVE' && renderCveInfo(currentData)}
              {dnsActiveSubTab === 'Search' && renderSearchResults(currentData)}
              {dnsActiveSubTab === 'Activity' && renderActivityStream(currentData)}
            </div>
          ) : (
            <div className="min-h-[300px] flex flex-col items-center justify-center text-gray-500 border-2 border-dashed border-white/5 rounded-2xl">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <Search className="w-8 h-8 opacity-20" />
              </div>
              <p className="font-bold">暂无查询结果</p>
              <p className="text-xs opacity-50 mt-1">尝试更换查询关键词或稍后再试</p>
              {/* 添加输入建议 */}
              {dnsActiveSubTab === 'IPv4' && (
                <p className="text-xs opacity-50 mt-2">建议输入格式: 8.8.8.8</p>
              )}
              {dnsActiveSubTab === 'Domain' && (
                <p className="text-xs opacity-50 mt-2">建议输入格式: example.com</p>
              )}
              {dnsActiveSubTab === 'URL' && (
                <p className="text-xs opacity-50 mt-2">建议输入格式: https://example.com</p>
              )}
              {dnsActiveSubTab === 'CVE' && (
                <p className="text-xs opacity-50 mt-2">建议输入格式: CVE-2024-1234</p>
              )}
              {dnsActiveSubTab === 'Search' && (
                <p className="text-xs opacity-50 mt-2">建议输入关键词: ransomware, phishing 等</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };


  const handleExportCSV = async () => {
    if (!results?.summary.domain) return;
    try {
      setIsSearching(true);
      console.log('Starting Frontend CSV Export for:', results.summary.domain, 'Category:', activeTab);
      
      let category: 'employees' | 'customers' | 'third_parties' | 'all' = 'employees';
      if (activeTab === 'Customers') category = 'customers';
      else if (activeTab === 'Third-Parties') category = 'third_parties';
      else if (activeTab === '报告') category = 'all';

      const notification = document.createElement('div');
      notification.className = "fixed bottom-8 right-8 bg-accent text-white px-6 py-3 rounded-xl shadow-2xl z-50 animate-bounce flex items-center gap-2";
      notification.innerHTML = `<span class="animate-spin">⏳</span> 正在从服务器获取完整数据并生成 CSV...`;
      document.body.appendChild(notification);

      // 1. 获取完整 JSON 数据
      const data = await leakRadarApi.getLeaksFull(results.summary.domain, category);
      
      if (!data.items || data.items.length === 0) {
        throw new Error('没有找到可导出的数据');
      }

      // 2. 将 JSON 转换为 CSV
      const headers = [
        'Email', 'Username', 'Password (Plain)', 'Password (Hash)', 'Hash Type', 
        'Website', 'Source', 'URL', 'IP Address', 'First Name', 'Last Name', 
        'Phone', 'City', 'Country', 'Leaked At', 'Added At'
      ];

      const csvRows = [headers.join(',')];

      data.items.forEach(item => {
        const row = [
          `"${(item.email || '').replace(/"/g, '""')}"`,
          `"${(item.username || '').replace(/"/g, '""')}"`,
          `"${(item.password_plaintext || item.password || '').replace(/"/g, '""')}"`,
          `"${(item.password_hash || '').replace(/"/g, '""')}"`,
          `"${(item.hash_type || '').replace(/"/g, '""')}"`,
          `"${(item.website || '').replace(/"/g, '""')}"`,
          `"${(item.source || '').replace(/"/g, '""')}"`,
          `"${(item.url || '').replace(/"/g, '""')}"`,
          `"${(item.ip_address || '').replace(/"/g, '""')}"`,
          `"${(item.first_name || '').replace(/"/g, '""')}"`,
          `"${(item.last_name || '').replace(/"/g, '""')}"`,
          `"${(item.phone || '').replace(/"/g, '""')}"`,
          `"${(item.city || '').replace(/"/g, '""')}"`,
          `"${(item.country || '').replace(/"/g, '""')}"`,
          `"${(item.leaked_at || '').replace(/"/g, '""')}"`,
          `"${(item.added_at || '').replace(/"/g, '""')}"`
        ];
        csvRows.push(row.join(','));
      });

      const csvString = csvRows.join('\n');

      // 3. 触发下载
      const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Leaks_${results.summary.domain}_${category}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      if (document.body.contains(notification)) document.body.removeChild(notification);
      setIsSearching(false);
      
    } catch (error: any) {
      console.error('CSV Export Error:', error);
      alert(error.message || 'CSV 导出失败');
      setIsSearching(false);
      // 清除通知
      const notifications = document.querySelectorAll('.animate-bounce');
      notifications.forEach(n => n.remove());
    }
  };

  const DetailCard = ({ title, icon: Icon, data, colorClass, onClick }: { title: string, icon: any, data: any, colorClass: string, onClick?: () => void }) => (
    <div 
      onClick={onClick}
      className={cn(
        "bg-white/[0.03] border border-white/10 rounded-3xl p-8 hover:bg-white/[0.05] transition-all group",
        onClick && "cursor-pointer hover:border-accent/30 hover:shadow-[0_0_30px_rgba(168,85,247,0.1)]"
      )}
    >
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className={cn("group-hover:scale-110 transition-transform", colorClass)}>
            <Icon className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">{title}</h3>
            <p className="text-[10px] text-gray-500 mt-1 max-w-[200px] leading-tight">
              {title === 'Employees' ? "网站和邮箱域名均匹配搜索域名。" : 
               title === 'Third Parties' ? "邮箱域名匹配，但网站域名不匹配。" : 
               "网站域名匹配，但邮箱域名不匹配。"}
            </p>
          </div>
        </div>
        {onClick && (
          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-accent/20 group-hover:text-accent transition-colors">
            <ChevronRight className="w-4 h-4" />
          </div>
        )}
      </div>
      
      <div className="mb-8">
        <p className="text-xs text-gray-500 mb-1 font-bold uppercase tracking-tighter">泄露账户数</p>
        <p className="text-4xl font-black text-white">{data.count}</p>
      </div>

      <div>
        <p className="text-[10px] text-gray-500 mb-3 font-bold uppercase tracking-wider">密码强度分布</p>
        <StrengthBar strength={data.strength} />
        
        <div className="grid grid-cols-4 gap-2 mt-6">
          {[
            { label: 'STRONG', val: data.strength.strong || 0, color: 'text-emerald-500' },
            { label: 'MEDIUM', val: data.strength.medium || 0, color: 'text-blue-500' },
            { label: 'WEAK', val: data.strength.weak || 0, color: 'text-orange-500' },
            { label: 'VERY WEAK', val: data.strength.very_weak || 0, color: 'text-red-500' },
          ].map((item) => {
            const total = (data.strength.strong || 0) + (data.strength.medium || 0) + (data.strength.weak || 0) + (data.strength.very_weak || 0);
            const percentage = total > 0 ? ((item.val / total) * 100).toFixed(1) : '0.0';
            return (
              <div key={item.label} className="text-center">
                <p className={cn("text-xs font-black mb-1", item.color)}>{item.val}</p>
                <p className="text-[9px] text-white font-bold mb-0.5">{percentage} %</p>
                <p className="text-[8px] text-gray-500 font-bold uppercase whitespace-nowrap">{item.label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col animate-in fade-in duration-700">
      {/* 核心展示区 */}
      <div className="relative pt-10 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[50px] border border-white/10 bg-[#0a0a0c] backdrop-blur-2xl p-16 lg:p-24 shadow-[0_0_100px_rgba(168,85,247,0.1)]">
            {/* 装饰性背景 */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(168,85,247,0.1),transparent_70%)] pointer-events-none" />
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay" />
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-accent/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <h1 className="text-7xl md:text-[10rem] font-black text-white tracking-tighter mb-6 leading-none select-none drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                  {isDnsPage ? 'OTX' : <AnimatedNumber value={totalLeaks} />}
                </h1>
              </motion.div>
              
              <div className="flex items-center gap-4 mb-12">
                <div className="h-px w-12 bg-gradient-to-r from-transparent to-accent" />
                <p className="text-xs font-black text-accent tracking-[0.5em] uppercase opacity-90">
                  {isDnsPage ? 'OTX 威胁情报平台' : '已索引的泄露记录'}
                </p>
                <div className="h-px w-12 bg-gradient-to-l from-transparent to-accent" />
              </div>
              
              <p className="max-w-3xl text-xl text-gray-400 mb-14 leading-relaxed font-medium">
                {isDnsPage 
                  ? '查询全球范围内的威胁情报，包括IP、域名、URL、CVE漏洞等。我们整合了全球安全社区的最新威胁数据。'
                  : '几秒钟内即可检查域名下的泄露凭证。我们监控全球数千个数据泄露源。'}
              </p>

              <form onSubmit={(e) => handleSearch(e)} className="w-full max-w-3xl relative group">
                  {/* 搜索框 */}
                  <div className="relative flex items-center bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-[28px] overflow-hidden p-2 shadow-2xl focus-within:border-accent/50 focus-within:shadow-[0_0_50px_rgba(168,85,247,0.15)] transition-all duration-500">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={isDnsPage ? "输入IP、域名、URL或CVE编号 (例如: 8.8.8.8, example.com, CVE-2024-1234)..." : "输入域名 (例如: Domain.com)..."}
                      className="flex-1 bg-transparent border-none text-white placeholder:text-gray-500 focus:ring-0 px-8 py-5 text-xl font-medium"
                    />
                    <button 
                      type="submit"
                      disabled={isSearching}
                      className="bg-accent hover:bg-accent/80 disabled:opacity-50 text-white px-12 py-5 rounded-[22px] font-black transition-all text-xl shadow-xl hover:scale-[1.02] active:scale-[0.98] flex items-center gap-3 purple-glow"
                    >
                      {isSearching ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin" />
                          检索中...
                        </>
                      ) : (
                        '立即检索'
                      )}
                    </button>
                  </div>

                  {/* 输入类型提示 */}
                  {isDnsPage && searchQuery && (
                    <div className="mt-4 text-center text-sm text-gray-500 animate-in fade-in slide-in-from-top-4 duration-500">
                      {(() => {
                        if (searchQuery.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
                          return `检测到IP地址格式，将自动查询IP威胁情报`;
                        } else if (searchQuery.startsWith('https://') || searchQuery.startsWith('http://')) {
                          return `检测到URL格式，将自动查询URL威胁检测`;
                        } else if (searchQuery.match(/^CVE-\d{4}-\d{4,7}$/i)) {
                          return `检测到CVE编号格式，将自动查询漏洞情报`;
                        } else {
                          return `检测到域名格式，将自动查询域名关联情报`;
                        }
                      })()}
                    </div>
                  )}

                  {/* OTX 威胁情报专属功能按钮 - 优化布局和提示 */}
                  {isDnsPage && (
                    <div className="mt-8 animate-in fade-in slide-in-from-top-4 duration-700 delay-300">
                      <div className="text-center text-sm text-gray-500 mb-4">
                        或者选择特定功能进行查询：
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-4">
                        {
                          [
                            { id: 'ipv4', label: 'IP威胁情报', icon: Globe, example: '8.8.8.8' },
                            { id: 'domain', label: '域名关联情报', icon: LayoutGrid, example: 'example.com' },
                            { id: 'url', label: 'URL威胁检测', icon: LinkIcon, example: 'https://example.com' },
                            { id: 'cve', label: '漏洞情报', icon: ShieldAlert, example: 'CVE-2024-1234' },
                            { id: 'search', label: '情报包搜索', icon: Search, example: 'ransomware' },
                            { id: 'activity', label: '实时威胁流', icon: Activity, example: '' },
                          ].map((btn) => (
                            <div key={btn.id} className="flex flex-col items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => handleSearch(e, btn.id as any)}
                                className="flex items-center gap-2.5 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-sm font-bold text-gray-300 hover:text-white transition-all hover:scale-105 active:scale-95 group"
                                title={`${btn.label} - 示例: ${btn.example || '无需输入'}`}
                              >
                                <btn.icon className="w-4 h-4 text-accent group-hover:scale-110 transition-transform" />
                                {btn.label}
                              </button>
                              {btn.example && (
                                <span className="text-xs text-gray-600">{btn.example}</span>
                              )}
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </form>
            </div>
          </div>
        </div>
      </div>

      {/* 搜索结果区域 */}
      <div id="search-results" className="scroll-mt-24 min-h-[600px]">
        {showResults && (isDnsPage ? dnsResults : results) && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
            {!isDnsPage && (
              <div className="flex flex-wrap items-center gap-4 mb-12">
                {tabs.map((tab) => (
                  <button
                    key={tab.name}
                    onClick={() => {
                      setActiveTab(tab.name);
                      setCurrentPage(0);
                    }}
                    className={cn(
                      "flex items-center gap-3 px-8 py-4 rounded-[24px] text-base font-black transition-all group",
                      activeTab === tab.name
                        ? "bg-white/10 text-accent shadow-2xl border border-white/10 scale-105"
                        : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                    )}
                  >
                    <tab.icon className="w-5 h-5" />
                    <span className="tracking-tight">{tab.name}</span>
                    {tab.count !== null && (
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[12px] font-black tracking-tighter transition-colors ml-1",
                        activeTab === tab.name 
                          ? "bg-accent text-white" 
                          : "bg-white/5 text-gray-400 group-hover:bg-white/10"
                      )}>
                        <AnimatedNumber value={tab.count.toString()} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <AnimatePresence mode="wait">
              <motion.div 
                key={isDnsPage ? 'dns' : activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                {isDnsPage ? (
                  renderDnsResults()
                ) : (
                  <>
                    {/* 结果内容区域 */}
                    {activeTab === '报告' && results ? (
              <div className="space-y-12">
                {/* 结果标题 */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                      <Shield className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-white">安全报告: {results.summary.domain}</h2>
                      <p className="text-sm text-gray-500 font-medium">生成日期: {new Date().toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>

                {/* 总计卡片 */}
                <div className="bg-white/[0.02] border border-white/5 rounded-[40px] p-12 text-center relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-[0.3em] mb-4">泄露账户总数</p>
                  <p className="text-7xl font-black text-white tracking-tighter">{results.summary.total}</p>
                </div>

                {/* 详情卡片网格 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <DetailCard 
                    title="员工" 
                    icon={UserCheck} 
                    data={results.summary.employees} 
                    colorClass="text-emerald-500"
                    onClick={() => {
                    setActiveTab('员工');
                    setCurrentPage(0);
                  }}
                  />
                  <DetailCard 
                    title="第三方" 
                    icon={ShieldAlert} 
                    data={results.summary.third_parties} 
                    colorClass="text-orange-500"
                    onClick={() => {
                      setActiveTab('第三方');
                      setCurrentPage(0);
                    }}
                  />
                  <DetailCard 
                    title="客户" 
                    icon={UserMinus} 
                    data={results.summary.customers} 
                    colorClass="text-blue-500"
                    onClick={() => {
                      setActiveTab('客户');
                      setCurrentPage(0);
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                {/* 过滤器和操作栏 */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                  <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative">
                      <button
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                        className="flex items-center gap-3 px-4 py-2 bg-[#25252e] border border-white/10 rounded-xl text-sm font-medium text-gray-200 hover:bg-white/5 transition-all min-w-[120px] justify-between"
                      >
                        {filterType}
                        {isFilterOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      <AnimatePresence>
                        {isFilterOpen && (
                          <>
                            <div 
                              className="fixed inset-0 z-10" 
                              onClick={() => setIsFilterOpen(false)}
                            />
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 10 }}
                              className="absolute left-0 mt-2 w-full bg-[#1a1a20] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-20"
                            >
                              {(['All', 'Email', 'Username'] as const).map((type) => (
                                <button
                                  key={type}
                                  onClick={() => {
                                    setFilterType(type);
                                    setIsFilterOpen(false);
                                  }}
                                  className={cn(
                                    "w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/5",
                                    filterType === type ? "text-accent bg-accent/5 font-bold" : "text-gray-400"
                                  )}
                                >
                                  {type}
                                </button>
                              ))}
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="relative flex-1 md:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="text"
                        value={innerSearchQuery}
                        onChange={(e) => setInnerSearchQuery(e.target.value)}
                        placeholder="在结果中搜索..."
                        className="w-full pl-10 pr-4 py-2 bg-[#25252e] border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all"
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                    <div className="text-xs text-gray-500">
                      {(() => {
                        // 对于URLs和Subdomains，使用实际数据数量作为总计
                        let total = results?.summary.total || 0;
                        if (activeTab === '员工') total = results?.summary.employees.count || 0;
                        else if (activeTab === '客户') total = results?.summary.customers.count || 0;
                        else if (activeTab === '第三方') total = results?.summary.third_parties.count || 0;
                        else if (activeTab === 'URLs' || activeTab === '子域名') {
                          // 使用实际数据数量作为总计，解决统计不一致问题
                          total = filteredCredentials.length;
                        }
                        
                        return innerSearchQuery.trim() 
                          ? `筛选出 ${filteredCredentials.length} 条记录 (总计 ${total} 条)`
                          : `共计 ${total} 条记录 (当前页显示 ${filteredCredentials.length} 条)`;
                      })()}
                    </div>
                    <button 
                      onClick={handleExportCSV}
                      className="flex items-center gap-2 px-4 py-2 bg-accent/10 hover:bg-accent/20 border border-accent/20 rounded-xl text-sm font-bold text-accent transition-all hover:scale-105 active:scale-95"
                    >
                      <Download className="w-4 h-4" />
                      导出数据
                    </button>
                  </div>
                </div>

                {/* 凭证列表表格 */}
                <div className="bg-[#1a1a20] border border-white/5 rounded-xl overflow-hidden overflow-x-auto shadow-2xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#25252e] border-b border-white/5">
                        <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">URL</th>
                    {(activeTab === 'URLs' || activeTab === '子域名') && (
                          <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">出现次数</th>
                        )}
                        {activeTab !== 'URLs' && activeTab !== '子域名' && (
                          <>
                            <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Type</th>
                            <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Email / Username</th>
                            <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Password</th>
                            <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Indexed At</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {/* 骨架屏显示 */}
                      {isLoadingCategory ? (
                        // 显示10行骨架屏
                        Array.from({ length: 10 }).map((_, index) => (
                          <tr key={`skeleton-${index}`} className="hover:bg-white/[0.03] transition-colors group">
                            <td className="px-6 py-4 max-w-[300px]">
                              <div className="flex items-center gap-2">
                                <div className="w-32 h-4 bg-white/5 rounded animate-pulse"></div>
                              </div>
                            </td>
                            {(activeTab === 'URLs' || activeTab === 'Subdomains') && (
                              <td className="px-6 py-4 text-right">
                                <div className="inline-block w-16 h-6 bg-white/5 rounded-lg animate-pulse"></div>
                              </td>
                            )}
                            {activeTab !== 'URLs' && activeTab !== 'Subdomains' && (
                              <>
                                <td className="px-6 py-4">
                                  <div className="w-16 h-5 bg-white/5 rounded-full animate-pulse"></div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="w-32 h-4 bg-white/5 rounded animate-pulse"></div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    <div className="w-32 h-4 bg-white/5 rounded animate-pulse"></div>
                                    <div className="w-5 h-5 bg-white/5 rounded animate-pulse"></div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-5 h-5 bg-white/5 rounded animate-pulse"></div>
                                    <div className="w-16 h-4 bg-white/5 rounded animate-pulse"></div>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        ))
                      ) : (
                        // 正常显示数据
                        filteredCredentials.map((cred) => (
                          <tr key={cred.id} className="hover:bg-white/[0.03] transition-colors group">
                            <td className="px-6 py-4 max-w-[300px]">
                              <div className="flex items-center gap-2">
                                <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="text-xs text-gray-200 truncate font-medium">
                                  {cred.website}
                                </span>
                              </div>
                            </td>
                            {(activeTab === 'URLs' || activeTab === 'Subdomains') && (
                              <td className="px-6 py-4 text-right">
                                <span className="text-xs font-bold text-accent bg-accent/10 px-3 py-1 rounded-lg">
                                  {(cred as any).count || 1} 次
                                </span>
                              </td>
                            )}
                            {activeTab !== 'URLs' && activeTab !== 'Subdomains' && (
                              <>
                                <td className="px-6 py-4">
                                  <span className={cn(
                                    "px-2.5 py-0.5 rounded-full text-[9px] font-bold border",
                                    cred.email?.includes('@') 
                                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                                      : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                  )}>
                                    {cred.email?.includes('@') ? 'Email' : 'Username'}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="text-xs text-gray-300 font-mono">
                                    {cred.email}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-300 font-mono">
                                      {autoUnlock || showPasswords[cred.id] ? cred.password_plaintext : '••••••••••••'}
                                    </span>
                                    {!autoUnlock && (
                                      <button 
                                        onClick={() => togglePassword(cred.id)}
                                        className="text-gray-500 hover:text-white transition-colors"
                                      >
                                        {showPasswords[cred.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2 text-gray-400">
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span className="text-xs font-mono">
                                      {formatDate(cred.leaked_at)}
                                    </span>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  
                  {filteredCredentials.length === 0 && (
                    <div className="py-20 text-center">
                      <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/5">
                        <Search className="w-8 h-8 text-gray-600" />
                      </div>
                      <p className="text-gray-500 font-medium">在该分类下未发现相关泄露记录</p>
                    </div>
                  )}
                </div>

                {/* 分页控制 */}
                {results && (
                  (() => {
                    let totalCount = results.summary.total;
                    if (activeTab === 'Employees') totalCount = results.summary.employees.count;
                    else if (activeTab === 'Customers') totalCount = results.summary.customers.count;
                    else if (activeTab === 'Third-Parties') totalCount = results.summary.third_parties.count;
                    else if (activeTab === 'URLs') totalCount = results.summary.urls_count;
                    else if (activeTab === 'Subdomains') totalCount = results.summary.subdomains_count;

                    const totalPages = Math.ceil(totalCount / pageSize);
                    
                    if (totalCount <= pageSize) return null;

                    return (
                      <div className="flex items-center justify-center gap-4 mt-8">
                        <button
                          onClick={() => handlePageChange(currentPage - 1)}
                          disabled={currentPage === 0 || isSearching}
                          className="p-3 rounded-xl bg-white/5 border border-white/10 text-white disabled:opacity-30 hover:bg-white/10 transition-all"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">第 {currentPage + 1} 页</span>
                          <span className="text-sm text-gray-500">/ 共 {totalPages} 页</span>
                        </div>
                        <button
                          onClick={() => handlePageChange(currentPage + 1)}
                          disabled={currentPage >= totalPages - 1 || isSearching}
                          className="p-3 rounded-xl bg-white/5 border border-white/10 text-white disabled:opacity-30 hover:bg-white/10 transition-all"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    );
                  })()
                )}
              </div>
            )}
          </>
        )}
      </motion.div>
        </AnimatePresence>
      </div>
    )}
  </div>

      {/* 中间文本区 */}
      {!showResults && (
        <>
          <div className="max-w-5xl mx-auto px-4 text-center pt-24 pb-12">
            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-6 leading-tight">
              立即发现地下泄露中关于您的信息
            </h2>
            <p className="text-xl text-gray-500 max-w-3xl mx-auto font-medium">
              数秒内检索从恶意软件日志中收集的数十亿条明文凭证。
            </p>
          </div>

          {/* Weekly Growth Chart */}
          <div className="w-full px-4 sm:px-6 lg:px-8 mb-24">
            <div className="max-w-full mx-auto bg-[#0a0a0c] border border-white/5 rounded-[40px] p-8 lg:p-10 relative overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.3)]">
              {/* 装饰性背景 */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
              
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    <span className="text-[10px] font-black text-accent uppercase tracking-[0.3em]">Live Indexing</span>
                  </div>
                  <h3 className="text-2xl font-black text-white tracking-tighter">每周数据增长趋势</h3>
                  <p className="text-gray-500 text-xs font-medium mt-1">
                    总计已索引记录: <AnimatedNumber value={totalLeaks} />
                  </p>
                </div>
                
                <div className="flex items-center gap-6 bg-white/5 px-5 py-3 rounded-2xl border border-white/10">
                  <div className="text-center">
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">本周新增</p>
                    <p className="text-lg font-black text-white">
                      {isLoadingStats ? (
                        <span className="opacity-20 animate-pulse">---,---</span>
                      ) : (
                        weeklyGrowth && weeklyGrowth.length > 0 && weeklyGrowth[weeklyGrowth.length - 1]
                          ? <AnimatedNumber value={(weeklyGrowth[weeklyGrowth.length - 1].weeklyTotal || 0).toString()} />
                          : '0'
                      )}
                    </p>
                  </div>
                  <div className="w-px h-6 bg-white/10" />
                  <div className="text-center">
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">平均每周</p>
                    <p className="text-lg font-black text-white">
                      {isLoadingStats ? (
                        <span className="opacity-20 animate-pulse">---,---</span>
                      ) : (
                        weeklyGrowth && weeklyGrowth.length > 0 
                          ? <AnimatedNumber value={Math.floor(weeklyGrowth.reduce((acc, curr) => acc + (Number(curr.weeklyTotal) || 0), 0) / weeklyGrowth.length).toString()} />
                          : '0'
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Chart Container with fixed height to prevent ResponsiveContainer width/height error */}
              <div className="h-[300px] min-h-[300px] w-full relative min-w-[300px] bg-white/5 rounded-2xl p-4" style={{ width: '100%', height: '300px', display: 'flex', flexDirection: 'column' }}>
                {isLoadingStats && (
                  <div className="absolute top-2 right-2 z-20 flex items-center gap-2 bg-white/5 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                    <Loader2 className="w-3 h-3 text-accent animate-spin" />
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">同步中...</span>
                  </div>
                )}
                {weeklyGrowth && weeklyGrowth.length > 0 ? (
                  // 移除ResponsiveContainer，直接为AreaChart添加固定尺寸
                  <AreaChart 
                    width={900} 
                    height={280} 
                    data={weeklyGrowth} 
                    margin={{ top: 10, right: 0, left: -10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorRaw" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#cbd5e1', fontSize: 10, fontWeight: 800 }}
                      interval={Math.floor(weeklyGrowth.length / 6)}
                      tickFormatter={(value, index) => {
                        if (!weeklyGrowth || weeklyGrowth.length === 0) return '';
                        if (index === weeklyGrowth.length - 1) return '本周';
                        return value;
                      }}
                    />
                    <YAxis 
                      hide={true} 
                      domain={[0, 'dataMax + 1000000']}
                    />
                    <Tooltip 
                      cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }}
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length > 0) {
                          const leaksItem = payload[0]?.payload?.leaks || 0;
                          const rawItem = payload[0]?.payload?.raw || 0;
                          const totalItem = payload[0]?.payload?.total || 0;
                          const growth = payload[0]?.payload?.growth || '0';

                          const formatVal = (val: any) => {
                            return Number(val || 0).toLocaleString();
                          };

                          return (
                            <div className="bg-[#1a1b26] border border-white/5 p-4 rounded-md shadow-2xl min-w-[280px]">
                              <div className="mb-4">
                                <span className="text-lg font-bold text-gray-200">
                                  {label}
                                </span>
                              </div>
                              <div className="space-y-4">
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-lg font-bold text-[#6366f1]">Total (+{growth}%):</span>
                                  <span className="text-lg font-bold text-[#6366f1]">{formatVal(totalItem)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-lg font-bold text-[#22d3ee]">url:user:pass:</span>
                                  <span className="text-lg font-bold text-[#22d3ee]">{formatVal(leaksItem)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-lg font-bold text-[#f59e0b]">Raw lines:</span>
                                  <span className="text-lg font-bold text-[#f59e0b]">{formatVal(rawItem)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36} 
                      content={(props) => {
                        const { payload } = props;
                        if (!payload) return null;
                        return (
                          <div className="flex items-center justify-center gap-8 mt-8">
                            {payload.map((entry: any, index: number) => (
                              <div key={`item-${index}`} className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                  {entry.value === '总索引量' ? 'Total' : entry.value === '凭证' ? 'url:user:pass' : 'Raw lines'}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="total" 
                      name="总索引量"
                      stroke="#6366f1" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorTotal)" 
                      isAnimationActive={false}
                      connectNulls={true}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="leaks" 
                      name="凭证"
                      stroke="#22d3ee" 
                      strokeWidth={2}
                      fill="transparent"
                      isAnimationActive={false}
                      connectNulls={true}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="raw" 
                      name="原始行"
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorRaw)" 
                      isAnimationActive={false}
                      connectNulls={true}
                    />
                  </AreaChart>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-white/[0.02] rounded-3xl border border-white/5 border-dashed">
                    <div className="flex flex-col items-center gap-3 opacity-20">
                      <Activity className="w-12 h-12 text-gray-500" />
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">等待数据加载...</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 功能卡片区 */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 w-full">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* 卡片 1 */}
              <div className="bg-white/[0.02] border border-white/5 p-10 rounded-[32px] hover:border-[#4f46e5]/30 transition-all group flex flex-col items-center text-center shadow-2xl hover:shadow-[#4f46e5]/5">
                <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform shadow-xl border border-white/5">
                  <Bug className="w-10 h-10 text-gray-400 group-hover:text-[#a855f7] transition-colors" />
                </div>
                <h3 className="text-2xl font-black text-white mb-4 tracking-tight">恶意软件日志</h3>
                <p className="text-gray-500 text-base leading-relaxed font-medium">
                  由 RedLine、Vidar、Raccoon 等信息窃取者盗取的凭证。
                </p>
              </div>

              {/* 卡片 2 */}
              <div className="bg-white/[0.02] border border-white/5 p-10 rounded-[32px] hover:border-[#4f46e5]/30 transition-all group flex flex-col items-center text-center shadow-2xl hover:shadow-[#4f46e5]/5">
                <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform shadow-xl border border-white/5">
                  <Key className="w-10 h-10 text-gray-400 group-hover:text-[#a855f7] transition-colors" />
                </div>
                <h3 className="text-2xl font-black text-white mb-4 tracking-tight">明文凭证</h3>
                <p className="text-gray-500 text-base leading-relaxed font-medium">
                  完全还原被盗时的 URL、用户名和密码，并经过清洗和去重。
                </p>
              </div>

              {/* 卡片 3 */}
              <div className="bg-white/[0.02] border border-white/5 p-10 rounded-[32px] hover:border-[#4f46e5]/30 transition-all group flex flex-col items-center text-center shadow-2xl hover:shadow-[#4f46e5]/5">
                <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform shadow-xl border border-white/5">
                  <Bolt className="w-10 h-10 text-gray-400 group-hover:text-[#a855f7] transition-colors" />
                </div>
                <h3 className="text-2xl font-black text-white mb-4 tracking-tight">极速检索</h3>
                <p className="text-gray-500 text-base leading-relaxed font-medium">
                  针对毫秒级查找进行索引，即使是在全球超过 70 亿条记录中。
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
