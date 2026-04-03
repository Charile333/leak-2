import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import { 
  Search, 
  User,
  Users,
  Briefcase,
  LayoutGrid,
  Globe,
  Link as LinkIcon,
  Loader2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ChevronLeft,
  UserCheck,
  ShieldAlert,
  UserMinus,
  Download
} from 'lucide-react';
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

const DetailCard = ({ title, icon: Icon, data, colorClass, onClick }: { title: string, icon: any, data: any, colorClass: string, onClick?: () => void }) => (
  <div 
    onClick={onClick}
    className={cn(
      "bg-white/[0.03] border border-white/10 rounded-3xl p-8 hover:bg-white/[0.05] transition-all group",
      onClick && "cursor-pointer hover:border-accent/30 hover:shadow-[0_0_30px_rgba(147,51,234,0.05)]"
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
            {title === '员工' ? "网站和邮箱域名均匹配搜索域名。" : 
             title === '第三方' ? "邮箱域名匹配，但网站域名不匹配。" : 
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
      <p className="text-xs font-bold text-gray-500 uppercase tracking-tighter">泄露账户数</p>
      <p className="text-4xl font-black text-white">{data.count}</p>
    </div>

    <div>
      <p className="text-[10px] text-gray-500 mb-3 font-bold uppercase tracking-wider">密码强度分布</p>
      <StrengthBar strength={data.strength} />
      
      <div className="grid grid-cols-4 gap-2 mt-6">
        {
          [
            { label: 'STRONG', val: data.strength.strong || 0, color: 'text-emerald-500' },
            { label: 'MEDIUM', val: data.strength.medium || 0, color: 'text-accent' },
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
          })
        }
      </div>
    </div>
  </div>
);

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
      <div style={{ width: `${p2}%` }} className="bg-accent" />
      <div style={{ width: `${p3}%` }} className="bg-orange-500" />
      <div style={{ width: `${p4}%` }} className="bg-red-500" />
    </div>
  );
};

const DASHBOARD_COPY = {
  tabs: {
    report: '\u62a5\u544a',
    employees: '\u5458\u5de5',
    thirdParties: '\u7b2c\u4e09\u65b9',
    customers: '\u5ba2\u6237',
    urls: 'URLs',
    subdomains: '\u5b50\u57df\u540d',
  },
  filters: {
    all: '\u5168\u90e8',
    email: '\u90ae\u7bb1',
    username: '\u7528\u6237\u540d',
  },
  searchPlaceholder: '\u641c\u7d22\u7ed3\u679c...',
  exportReady: 'CSV \u6570\u636e\u5df2\u6210\u529f\u5bfc\u51fa',
  exportFailed: '\u5bfc\u51fa\u5931\u8d25',
  exportLoading: '\u5bfc\u51fa\u4e2d...',
  exportAction: '\u5bfc\u51fa CSV \u6570\u636e',
  reportEmpty: '\u8be5\u57df\u540d\u7684\u62a5\u544a\u6570\u636e\u5df2\u52a0\u8f7d\uff0c\u8bf7\u5207\u6362\u5230\u5176\u4ed6\u6807\u7b7e\u9875\u67e5\u770b\u8be6\u7ec6\u6570\u636e',
  tabEmpty: '\u5f53\u524d\u6807\u7b7e\u9875\u6682\u65e0\u6570\u636e',
  loading: '\u6570\u636e\u52a0\u8f7d\u4e2d...',
};

const DASHBOARD_OTX_COPY = {
  placeholder: {
    ip: '\u8f93\u5165 IP \u5730\u5740 (\u4f8b\u5982: 8.8.8.8)...',
    domain: '\u8f93\u5165\u57df\u540d (\u4f8b\u5982: example.com)...',
    url: '\u8f93\u5165 URL (\u4f8b\u5982: https://example.com)...',
    cve: '\u8f93\u5165 CVE \u7f16\u53f7 (\u4f8b\u5982: CVE-2021-44228)...',
  },
  resultTitle: {
    ip: 'IP \u67e5\u8be2\u7ed3\u679c',
    domain: '\u57df\u540d\u67e5\u8be2\u7ed3\u679c',
    url: 'URL \u68c0\u6d4b\u7ed3\u679c',
    cve: 'CVE \u6f0f\u6d1e\u60c5\u62a5',
  },
  overviewTitle: '\u6982\u89c8\u4fe1\u606f',
  searchNow: '\u7acb\u5373\u68c0\u7d22',
  searching: '\u68c0\u7d22\u4e2d...',
  labels: {
    ip: ['IP\u5730\u5740', 'ASN\u5f52\u5c5e', '\u5730\u7406\u4f4d\u7f6e', '\u4fe1\u8a89\u8bc4\u5206'],
    domain: ['\u57df\u540d', '\u60c5\u62a5\u6570\u91cf', '\u4fe1\u8a89\u8bc4\u5206', '\u6ce8\u518c\u72b6\u6001'],
    url: ['URL', '\u57df\u540d', 'IP\u5730\u5740', '\u4fe1\u8a89\u8bc4\u5206'],
    cve: ['CVE \u7f16\u53f7', 'CVSS \u8bc4\u5206', '\u53d1\u5e03\u65e5\u671f', '\u5a01\u80c1\u7b49\u7ea7'],
  },
  status: {
    malicious: '\u6076\u610f',
    neutral: '\u4e2d\u7acb',
    registered: '\u5df2\u6ce8\u518c',
    unknown: '\u672a\u77e5',
    high: '\u9ad8',
    medium: '\u4e2d',
  },
  sections: {
    passiveDns: '\u88ab\u52a8 DNS \u8bb0\u5f55',
    passiveDnsColumns: ['\u57df\u540d', '\u7c7b\u578b', '\u9996\u6b21\u51fa\u73b0', '\u6700\u540e\u51fa\u73b0'],
    malware: '\u5173\u8054\u6076\u610f\u6837\u672c',
    malwareColumns: ['\u5bb6\u65cf', '\u540d\u79f0', 'MD5'],
    urlList: '\u5173\u8054 URL \u5217\u8868',
    urlColumns: ['URL', '\u57df\u540d', '\u8def\u5f84'],
    whois: 'WHOIS \u4fe1\u606f',
    whoisFields: ['\u6ce8\u518c\u5546', '\u6ce8\u518c\u65e5\u671f', '\u5230\u671f\u65e5\u671f', '\u66f4\u65b0\u65e5\u671f', '\u540d\u79f0\u670d\u52a1\u5668'],
    cveDescription: '\u6f0f\u6d1e\u63cf\u8ff0',
    relatedThreatIntel: '\u76f8\u5173\u5a01\u80c1\u60c5\u62a5',
    unknownSource: '\u672a\u77e5\u6765\u6e90',
  },
};

const ResultPulse = ({ label, value }: { label: string; value: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 8, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    className="console-panel flex items-center gap-3 rounded-2xl px-4 py-3"
  >
    <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-accent/14 text-accent">
      <motion.span
        className="absolute inset-0 rounded-full border border-accent/30"
        animate={{ scale: [1, 1.3, 1], opacity: [0.45, 0, 0.45] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <Search className="h-4 w-4" />
    </div>
    <div className="min-w-0">
      <p className="text-label console-subtle">{label}</p>
      <p className="truncate text-sm font-semibold text-white">{value}</p>
    </div>
  </motion.div>
);

const DelightEmptyState = ({ title, body }: { title: string; body: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 12, scale: 0.985 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    className="console-panel-strong relative overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-8 text-center"
  >
    <motion.div
      className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent"
      animate={{ opacity: [0.3, 0.9, 0.3], scaleX: [0.92, 1, 0.92] }}
      transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
    />
    <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-accent/25 bg-accent/12 text-accent shadow-[0_0_30px_rgba(168,85,247,0.18)]">
      <motion.span
        className="absolute inset-0 rounded-full border border-accent/30"
        animate={{ scale: [1, 1.22, 1], opacity: [0.45, 0, 0.45] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <Search className="h-5 w-5" />
    </div>
    <p className="font-display text-lg font-semibold text-white">{title}</p>
    <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-white/65">{body}</p>
  </motion.div>
);

const Dashboard = () => {
  const location = useLocation();
  const isDnsPage = location.pathname === '/dns';
  
  const [searchQuery, setSearchQuery] = useState('');
  // DNS数据集相关状态
  const [activeSearchType, setActiveSearchType] = useState<'ip' | 'domain' | 'url' | 'cve'>('ip');
  const [otxResults, setOtxResults] = useState<any>(null);
  const [otxLoading, setOtxLoading] = useState(false);
  const [otxError, setOtxError] = useState<string>('');
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
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize] = useState(10);
  // 保存各个分类的数据，避免替换原始完整数据
  const [categoryCredentials, setCategoryCredentials] = useState<Record<string, LeakedCredential[]>>({});
  
  // 导出功能相关状态
  const [exportLoading, setExportLoading] = useState(false);
  const [exportMessage, setExportMessage] = useState<string>('');
  
  // 防止搜索时页面跳动：只在用户提交搜索时才处理结果显示/隐藏
  useEffect(() => {
    // 当有搜索结果且搜索已完成时，显示结果
    if (results && !isSearching) {
      setShowResults(true);
    }
  }, [results, isSearching]);
  
  // 导出功能实现 - 只保留CSV导出
  const handleExport = async () => {
    if (!searchQuery || !results) return;
    
    setExportLoading(true);
    setExportMessage('');
    
    try {
      const domain = searchQuery.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();
      
      // 先获取当前分类，确保使用有效的category值
      const categoryMap: Record<string, 'employees' | 'customers' | 'third_parties'> = {
        '员工': 'employees',
        '客户': 'customers',
        '第三方': 'third_parties'
      };
      // 默认使用employees分类，避免使用无效的'all'分类
      const category = categoryMap[activeTab] || 'employees';
      
      // 使用getLeaksFull API获取完整数据，然后手动导出为CSV
      const fullResults = await leakRadarApi.getLeaksFull(domain, category);
      
      // 生成CSV内容
      const csvHeader = 'URL,TYPE,EMAIL/USERNAME,PASSWORD,Indexed At\n';
      
      // 生成CSV行 - 只导出前10条完整信息
    const csvRows = fullResults.items.slice(0, 10).map((item: any) => {
      const url = item.website || item.url || domain || '';
      
      // CSV转义处理函数
      const escapeCsv = (value: string) => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      };
      
      // 前10条完整数据，包含所有字段
      const type = item.email && item.email.includes('@') ? 'EMAIL' : 'USERNAME';
      const emailUsername = item.email || item.username || '';
      const password = item.password_plaintext || item.password || '';
      const leakedAt = item.leaked_at || item.added_at || '';
      
      return `${escapeCsv(url)},${escapeCsv(type)},${escapeCsv(emailUsername)},${escapeCsv(password)},${escapeCsv(leakedAt)}
`;
    }).join('');
      
      // 创建CSV blob
      const csvContent = csvHeader + csvRows;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      
      // 创建下载链接
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${domain}-${category}-泄露数据.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      setExportMessage(DASHBOARD_COPY.exportReady);
    } catch (error: any) {
      console.error('导出失败:', error);
      setExportMessage(`${DASHBOARD_COPY.exportFailed}: ${error.message}`);
    } finally {
      setExportLoading(false);
      // 3秒后清除消息
      setTimeout(() => setExportMessage(''), 3000);
    }
  };
  
  // 当页签切换时，滚动到结果区域顶部并重置相关状态
  useEffect(() => {
    // 只有当 showResults 为 true 且不是初始化状态时才触发
    if (showResults && activeTab) {
      // 重置筛选和页码
      setFilterType('All');
      setInnerSearchQuery('');
      setCurrentPage(0);
      
      // 清除当前分类之外的缓存数据，避免数据混淆
      const categoryMap: Record<string, string> = {
        '员工': 'employees',
        '客户': 'customers',
        '第三方': 'third_parties',
        'URLs': 'urls',
        '子域名': 'subdomains'
      };
      const currentCategory = categoryMap[activeTab];
      
      // 只有当前分类的数据保留在缓存中
      if (currentCategory) {
        setCategoryCredentials(prev => ({ [currentCategory]: prev[currentCategory] || [] }));
      } else {
        // 对于报告标签，清除所有分类缓存
        setCategoryCredentials({});
      }

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
  
  // 当标签页切换到URLs或Subdomains时，自动加载最新数据
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
      
      // 对于URLs和Subdomains标签页，总是重新加载最新数据
      if (currentCategory && (currentCategory === 'urls' || currentCategory === 'subdomains')) {
        // 直接调用handleSearch，不清除缓存，避免请求失败时显示错误
        // 缓存清除逻辑移到handleSearch中，确保isSearching状态正确设置
        handleSearch(undefined, 'default', 0);
      }
    }
  }, [activeTab, showResults, searchQuery]);
  
  // OTX API 查询函数
  const handleOtxSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || otxLoading) return;
    
    setOtxLoading(true);
    setOtxError('');
    // 不清除otxResults，避免在搜索过程中页面跳动
    
    try {
      let result;
      
      // 为所有类型的查询添加多section数据获取
      switch (activeSearchType) {
        case 'ip': {
          // 检测是IPv4还是IPv6
          const isIpv6 = searchQuery.includes(':');
          // 并行获取多个section的数据
          const [ipGeneral, ipPassiveDns, ipMalware, ipUrlList] = await Promise.all([
            otxApi.getIpInfo(searchQuery, 'general', isIpv6),
            otxApi.getIpInfo(searchQuery, 'passive_dns', isIpv6),
            otxApi.getIpInfo(searchQuery, 'malware', isIpv6),
            otxApi.getIpInfo(searchQuery, 'url_list', isIpv6)
          ]);
          
          // 合并IP查询数据
          result = {
            ...ipGeneral,
            passive_dns: ipPassiveDns?.passive_dns || [],
            malware: ipMalware?.malware || [],
            url_list: ipUrlList?.url_list || [],
            // 确保地理位置和信誉评分字段正确
            country: ipGeneral?.country_name || ipGeneral?.country || 'N/A',
            city: ipGeneral?.city || 'N/A',
            reputation: ipGeneral?.reputation || (ipGeneral?.pulse_info?.count > 0 ? '恶意' : '中立')
          };
          break;
        }
        
        case 'domain': {
          // 并行获取多个section的数据
          const [generalData, passiveDnsData, whoisData, malwareData] = await Promise.all([
            otxApi.getDomainInfo(searchQuery, 'general'),
            otxApi.getDomainInfo(searchQuery, 'passive_dns'),
            otxApi.getDomainInfo(searchQuery, 'whois'),
            otxApi.getDomainInfo(searchQuery, 'malware')
          ]);
          
          // 合并域名查询数据
          result = {
            ...generalData,
            passive_dns: passiveDnsData?.passive_dns || [],
            whois: whoisData || {}, // 直接使用whoisData，不假设它有whois属性
            malware: malwareData?.malware || []
          };
          break;
        }
        
        case 'url': {
          // 并行获取URL的多个section数据
          const [urlGeneral, urlUrlList] = await Promise.all([
            otxApi.getUrlInfo(searchQuery, 'general'),
            otxApi.getUrlInfo(searchQuery, 'url_list')
          ]);
          
          // 合并URL查询数据
          result = {
            ...urlGeneral,
            url_list: urlUrlList?.url_list || []
          };
          break;
        }
        
        case 'cve': {
          // 并行获取CVE的多个section数据
          const [cveGeneral, cveTopPulses] = await Promise.all([
            otxApi.getCveInfo(searchQuery, 'general'),
            otxApi.getCveInfo(searchQuery, 'top_n_pulses')
          ]);
          
          // 合并CVE查询数据
          result = {
            ...cveGeneral,
            top_n_pulses: cveTopPulses?.top_n_pulses || []
          };
          break;
        }
        
        default:
          throw new Error('未知的搜索类型');
      }
      
      setOtxResults(result);
      setShowResults(true);
    } catch (error: any) {
      console.error('OTX API 查询错误:', error);
      setOtxError(error.message || '查询失败，请重试');
    } finally {
      setOtxLoading(false);
    }
  };
  
  // Fetch global stats
  React.useEffect(() => {
    const fetchStats = async () => {
      try {
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
        } else {
          // API failed to return any stats
          setTotalLeaks('0');
        }
      } catch (error) {
        console.error('[Dashboard] Error fetching stats:', error);
        setTotalLeaks('0');
      }
    };

    fetchStats();
  }, []);
  
  // Filter states
  const [sortField] = useState<keyof LeakedCredential>('leaked_at');
  const [sortOrder] = useState<'asc' | 'desc'>('desc');

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

  const handleSearch = async (e?: React.FormEvent, _type?: any, page: number = 0) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    // 立即更新currentPage，实现流畅的分页切换
    setCurrentPage(page);
    setIsSearching(true);

    if (page === 0) {
      // 当进行新的搜索时，只清除当前分类的缓存，保留其他分类的数据
      const categoryMap: Record<string, string> = {
        '员工': 'employees',
        '客户': 'customers',
        '第三方': 'third_parties',
        'URLs': 'urls',
        '子域名': 'subdomains'
      };
      const currentCategory = categoryMap[activeTab];
      
      if (currentCategory) {
        // 只清除当前分类的缓存，避免影响其他分类
        setCategoryCredentials(prev => ({
          ...prev,
          [currentCategory]: []
        }));
      }
    }
    
    try {
      // 总是先进行完整的域名搜索，更新results状态
      // 这样无论在哪个标签页搜索，都会先获取完整数据
      if (page === 0) {
        const data = await dataService.searchDomain(searchQuery, pageSize, page * pageSize);
        setResults(data);
      }

      // 然后根据当前活动标签页获取对应分类的数据
      let category: 'employees' | 'customers' | 'third_parties' | 'urls' | 'subdomains' | null = null;
      if (activeTab === '员工') category = 'employees';
      else if (activeTab === '客户') category = 'customers';
      else if (activeTab === '第三方') category = 'third_parties';
      else if (activeTab === 'URLs') category = 'urls';
      else if (activeTab === '子域名') category = 'subdomains';

      if (category) {
        // 分类数据请求逻辑
        const newCredentials = await dataService.searchCategory(searchQuery, category, pageSize, page * pageSize);
        
        // 保存当前分类的数据，根据页码决定是替换还是合并
        setCategoryCredentials(prev => ({
          ...prev,
          [category]: newCredentials
        }));
      }

      setIsSearching(false);
    // 只有在初始搜索时（通过表单提交，e有值）且当前标签页不是URLs或子域名时，才默认显示报告子标签
    // 避免点击URLs或子域名标签页时自动切换回报告页面，同时避免分页时切换标签页
    if (e && page === 0 && activeTab !== 'URLs' && activeTab !== '子域名') {
      setActiveTab('报告');
    }
    setShowResults(true);
      
      if (page === 0) {
        setTimeout(() => {
          const resultElement = document.getElementById('search-results');
          if (resultElement) {
            const rect = resultElement.getBoundingClientRect();
            if (rect.top < 0 || rect.top > window.innerHeight * 0.8) {
              resultElement.scrollIntoView({ behavior: 'smooth' });
            }
          }
        }, 100);
      }
    } catch (error) {
      console.error('Search failed:', error);
      setIsSearching(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    handleSearch(undefined, 'default', newPage);
  };

  const filteredCredentials = useMemo(() => {
    let list: LeakedCredential[] = [];
    const categoryMap: Record<string, string> = {
      '员工': 'employees',
      '客户': 'customers',
      '第三方': 'third_parties',
      'URLs': 'urls',
      '子域名': 'subdomains'
    };
    
    const currentCategory = categoryMap[activeTab];
    
    // 检查是否有分页数据缓存
    const hasPagedData = currentCategory && categoryCredentials[currentCategory] && categoryCredentials[currentCategory].length > 0;
    
    // 检查results是否存在且有数据
    const hasResults = results && results.credentials && results.credentials.length > 0;
    
    // URL和子域名标签的数据处理
    if (activeTab === 'URLs' || activeTab === '子域名') {
      if (hasPagedData) {
        list = [...categoryCredentials[currentCategory]];
      }
      // 只有当有缓存数据时才显示，否则显示空列表，避免显示错误数据
    } 
    // 其他标签的数据处理
    else if (hasResults) {
      if (hasPagedData) {
        list = [...categoryCredentials[currentCategory]];
      } else {
        // 使用原始数据并过滤
        list = [...results.credentials];
        
        // Tab filtering
        if (activeTab === '员工') {
          list = list.filter(c => c.type === 'Employee');
        } else if (activeTab === '第三方') {
          list = list.filter(c => c.type === 'Third-Party');
        } else if (activeTab === '客户') {
          list = list.filter(c => c.type === 'Customer');
        } 
        // 报告标签页显示所有数据，不需要过滤
        else if (activeTab === '报告') {
          // 报告标签页显示所有数据
          list = [...results.credentials];
        }
      }
    }

    // Category filtering (只适用于非URL/子域名标签)
    if (activeTab !== 'URLs' && activeTab !== '子域名') {
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
    }

    // Sorting
    list.sort((a, b) => {
      // URLs/子域名标签按count排序
      if (activeTab === 'URLs' || activeTab === '子域名') {
        const countA = a.count || 0;
        const countB = b.count || 0;
        return sortOrder === 'asc' ? countA - countB : countB - countA;
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
    } catch {
      return dateStr;
    }
  };

  const togglePassword = (id: string | number) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const tabs = [
    { name: "\u62a5\u544a", label: "\u62a5\u544a", icon: LayoutGrid, count: results?.summary.total ?? 0 },
    { name: "\u5458\u5de5", label: "\u5458\u5de5", icon: User, count: results?.summary.employees.count ?? 0 },
    { name: "\u7b2c\u4e09\u65b9", label: "\u7b2c\u4e09\u65b9", icon: Briefcase, count: results?.summary.third_parties.count ?? 0 },
    { name: "\u5ba2\u6237", label: "\u5ba2\u6237", icon: Users, count: results?.summary.customers.count ?? 0 },
    { name: "URLs", label: "URLs", icon: LinkIcon, count: results?.summary.urls_count ?? 0 },
    { name: "\u5b50\u57df\u540d", label: "\u5b50\u57df\u540d", icon: Globe, count: results?.summary.subdomains_count ?? 0 },
  ];

  const activeTabMeta = tabs.find((tab) => tab.name === activeTab);
  const activeResultCount = filteredCredentials.length;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col animate-in fade-in duration-700">
      {/* 功能完善中横幅 */}
      {isDnsPage && (
        <div className="w-full bg-yellow-500/20 border-b border-yellow-500/40 p-4 text-center">
          <p className="text-yellow-400 font-bold text-lg">{"\u529f\u80fd\u5b8c\u5584\u4e2d"}</p>
        </div>
      )}
      
      {/* 核心展示区 */}
      <div className="relative pt-10 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[50px] border border-white/10 bg-[#0a0a0c] backdrop-blur-xl p-16 lg:p-24 shadow-[0_0_70px_rgba(147,51,234,0.035)]">
            {/* 装饰性背景 */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(147,51,234,0.1),transparent_70%)] pointer-events-none" />
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay" />
            <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-accent/6 blur-[96px] pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-purple-500/6 blur-[96px] pointer-events-none" />
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <h1 className="mb-5 text-6xl font-bold leading-none tracking-tighter text-white select-none md:text-[8rem]">
                  <AnimatedNumber value={totalLeaks} />
                </h1>
              </motion.div>
              
              <div className="mb-8 flex items-center gap-4">
                <div className="h-px w-12 bg-gradient-to-r from-transparent to-accent" />
                <p className="text-xs font-black text-accent tracking-[0.5em] uppercase opacity-90">
                  {"\u5df2\u7d22\u5f15\u7684\u6cc4\u9732\u8bb0\u5f55\u603b\u6570"}
                </p>
                <div className="h-px w-12 bg-gradient-to-l from-transparent to-accent" />
              </div>
              
              <p className="mb-10 max-w-3xl text-lg font-medium leading-relaxed text-gray-400">
                {"\u51e0\u79d2\u949f\u5185\u5373\u53ef\u68c0\u67e5\u57df\u540d\u4e0b\u7684\u6cc4\u9732\u51ed\u8bc1\u3002\u6211\u4eec\u76d1\u63a7\u5168\u7403\u6570\u5343\u4e2a\u6570\u636e\u6cc4\u9732\u6e90\u3002"}
              </p>

              <form 
                onSubmit={(e) => isDnsPage ? handleOtxSearch(e) : handleSearch(e)} 
                className="w-full max-w-3xl relative group"
              >
                {/* DNS数据集页面的搜索表单 */}
                {isDnsPage ? (
                  <div>
                    {/* 搜索类型选项卡 */}
                    <div className="console-panel mb-4 flex justify-center gap-2 rounded-full p-1.5">
                      {
                        [
                          { type: "ip", label: "IP", placeholder: "\u8f93\u5165 IP \u5730\u5740" },
                          { type: "domain", label: "\u57df\u540d", placeholder: "\u8f93\u5165\u57df\u540d" },
                          { type: "url", label: "URL", placeholder: "\u8f93\u5165 URL" },
                          { type: "cve", label: "CVE", placeholder: "\u8f93\u5165 CVE \u7f16\u53f7" }
                        ].map(({ type, label }) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => {
                              setActiveSearchType(type as any);
                            }}
                            className={cn(
                              "rounded-full px-6 py-3 text-sm font-semibold transition-all duration-300",
                              activeSearchType === type
                                ? "console-accent-soft text-white"
                                : "console-subtle hover:bg-white/10 hover:text-white"
                            )}
                          >
                            {label}
                          </button>
                        ))
                      }
                    </div>
                    
                    {/* 搜索框 */}
                    <div className="console-panel relative flex items-center overflow-hidden rounded-[28px] p-2 shadow-xl transition-all duration-500 focus-within:border-accent/50 focus-within:shadow-[0_0_24px_rgba(147,51,234,0.06)]">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={DASHBOARD_OTX_COPY.placeholder[activeSearchType]}
                        className="flex-1 border-none bg-transparent px-8 py-5 text-xl font-medium text-white placeholder:text-white/30 focus:ring-0"
                      />
                      <button
                        type="submit"
                        disabled={otxLoading}
                        className="accent-glow flex items-center gap-3 rounded-[22px] bg-accent px-12 py-5 text-xl font-semibold text-white shadow-lg transition-all hover:scale-[1.01] hover:bg-accent/80 active:scale-[0.99] disabled:opacity-50"
                      >
                        {otxLoading ? (
                          <Loader2 size={20} className="animate-spin" />
                        ) : (
                          <Search size={20} />
                        )}
                      </button>
                    </div>
                    
                    {/* 错误信息 */}
                    {otxError && (
                      <div className="mt-4 text-center text-red-400 text-sm">
                        {otxError}
                      </div>
                    )}
                  </div>
                ) : (
                  /* 原始搜索表单 */
                  <div className="console-panel relative flex items-center overflow-hidden rounded-[28px] p-2 shadow-xl transition-all duration-500 focus-within:border-accent/50 focus-within:shadow-[0_0_24px_rgba(147,51,234,0.06)]">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="输入域名（例如：domain.com）"
                      className="flex-1 border-none bg-transparent px-8 py-5 text-xl font-medium text-white placeholder:text-white/30 focus:ring-0"
                    />
                    <button 
                      type="submit"
                      disabled={isSearching}
                      className="accent-glow flex items-center gap-3 rounded-[22px] bg-accent px-12 py-5 text-xl font-semibold text-white shadow-lg transition-all hover:scale-[1.01] hover:bg-accent/80 active:scale-[0.99] disabled:opacity-50"
                    >
                      {isSearching ? (
                        <div className="flex items-center gap-3">
                          <Loader2 className="w-6 h-6 text-white animate-spin" />
                          {DASHBOARD_OTX_COPY.searching}
                        </div>
                      ) : (
                        DASHBOARD_OTX_COPY.searchNow
                      )}
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* 搜索结果区域 */}
      <div id="search-results" className="scroll-mt-24 min-h-[600px]">
        {/* DNS数据集页面结果 */}
        {isDnsPage && showResults && otxResults && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
            <div className="bg-[#1a1a20] border border-white/5 rounded-xl overflow-hidden shadow-2xl">
              <div className="p-8">
                <h2 className="text-2xl font-black text-white mb-6">
                  {DASHBOARD_OTX_COPY.resultTitle[activeSearchType]}
                </h2>
                
                {/* IP查询结果优化展示 */}
                {(activeSearchType === 'ip' || activeSearchType === 'domain' || activeSearchType === 'url' || activeSearchType === 'cve') && (
                  <div className="space-y-6">
                    {/* 概览信息 */}
                    <div className="bg-[#25252e] rounded-lg p-6">
                      <h3 className="text-lg font-bold text-white mb-4">{DASHBOARD_OTX_COPY.overviewTitle}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {activeSearchType === 'ip' && (
                          <>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.labels.ip[0]}</p>
                              <p className="text-sm font-bold text-white">{otxResults.indicator || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.labels.ip[1]}</p>
                              <p className="text-sm font-bold text-white">{otxResults.asn || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.labels.ip[2]}</p>
                              <p className="text-sm font-bold text-white">{`${otxResults.country || 'N/A'} ${otxResults.city || ''}`}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.labels.ip[3]}</p>
                              <p className="text-sm font-bold text-white">{otxResults.reputation || (otxResults.pulse_info?.count > 0 ? DASHBOARD_OTX_COPY.status.malicious : DASHBOARD_OTX_COPY.status.neutral)}</p>
                            </div>
                          </>
                        )}
                        
                        {activeSearchType === 'domain' && (
                          <>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.labels.domain[0]}</p>
                              <p className="text-sm font-bold text-white">{otxResults.indicator || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.labels.domain[1]}</p>
                              <p className="text-sm font-bold text-white">{otxResults.pulse_info?.count || 0}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.labels.domain[2]}</p>
                              <p className="text-sm font-bold text-white">{otxResults.reputation || (otxResults.pulse_info?.count > 0 ? DASHBOARD_OTX_COPY.status.malicious : DASHBOARD_OTX_COPY.status.neutral)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.labels.domain[3]}</p>
                              <p className="text-sm font-bold text-white">{otxResults.whois?.registrar ? DASHBOARD_OTX_COPY.status.registered : DASHBOARD_OTX_COPY.status.unknown}</p>
                            </div>
                          </>
                        )}
                        
                        {activeSearchType === 'url' && (
                          <>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">URL</p>
                              <p className="text-sm font-bold text-white break-all">{otxResults.indicator || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.labels.url[1]}</p>
                              <p className="text-sm font-bold text-white">{otxResults.domain || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.labels.url[2]}</p>
                              <p className="text-sm font-bold text-white">{otxResults.ip || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.labels.url[3]}</p>
                              <p className="text-sm font-bold text-white">{otxResults.reputation || (otxResults.pulse_info?.count > 0 ? DASHBOARD_OTX_COPY.status.malicious : DASHBOARD_OTX_COPY.status.neutral)}</p>
                            </div>
                          </>
                        )}
                        
                        {activeSearchType === 'cve' && (
                          <>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.labels.cve[0]}</p>
                              <p className="text-sm font-bold text-white">{otxResults.indicator || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.labels.cve[1]}</p>
                              <p className="text-sm font-bold text-white">{otxResults.base_score || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.labels.cve[2]}</p>
                              <p className="text-sm font-bold text-white">{otxResults.published || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.labels.cve[3]}</p>
                              <p className="text-sm font-bold text-white">{otxResults.pulse_info?.count > 0 ? DASHBOARD_OTX_COPY.status.high : DASHBOARD_OTX_COPY.status.medium}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* DNS反查（被动DNS） - IP和域名查询都可能有 */}
                    {(activeSearchType === 'ip' || activeSearchType === 'domain') && otxResults.passive_dns && otxResults.passive_dns.length > 0 && (
                      <div className="bg-[#25252e] rounded-lg p-6">
                        <h3 className="text-lg font-bold text-white mb-4">被动DNS记录</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="border-b border-white/10">
                                <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">域名</th>
                                <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">类型</th>
                                <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">首次出现</th>
                                <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">最后出现</th>
                              </tr>
                            </thead>
                            <tbody>
                              {otxResults.passive_dns.map((record: any, index: number) => (
                                <tr key={index} className="border-b border-white/5 hover:bg-white/5">
                                  <td className="py-3 text-sm text-white">{record.hostname}</td>
                                  <td className="py-3 text-sm text-white">{record.type}</td>
                                  <td className="py-3 text-sm text-white">{record.first}</td>
                                  <td className="py-3 text-sm text-white">{record.last}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    
                    {/* 恶意样本 - IP和域名查询都可能有 */}
                    {(activeSearchType === 'ip' || activeSearchType === 'domain') && otxResults.malware && otxResults.malware.length > 0 && (
                      <div className="bg-[#25252e] rounded-lg p-6">
                        <h3 className="text-lg font-bold text-white mb-4">关联恶意样本</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="border-b border-white/10">
                                <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">家族</th>
                                <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">名称</th>
                                <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">MD5</th>
                              </tr>
                            </thead>
                            <tbody>
                              {otxResults.malware.map((record: any, index: number) => (
                                <tr key={index} className="border-b border-white/5 hover:bg-white/5">
                                  <td className="py-3 text-sm text-white">{record.family}</td>
                                  <td className="py-3 text-sm text-white">{record.name}</td>
                                  <td className="py-3 text-sm text-white">{record.md5}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    
                    {/* URL列表 - IP和URL查询都可能有 */}
                    {(activeSearchType === 'ip' || activeSearchType === 'url') && otxResults.url_list && otxResults.url_list.length > 0 && (
                      <div className="bg-[#25252e] rounded-lg p-6">
                        <h3 className="text-lg font-bold text-white mb-4">关联URL列表</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="border-b border-white/10">
                                <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">URL</th>
                                <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">域名</th>
                                <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">路径</th>
                              </tr>
                            </thead>
                            <tbody>
                              {otxResults.url_list.map((record: any, index: number) => (
                                <tr key={index} className="border-b border-white/5 hover:bg-white/5">
                                  <td className="py-3 text-sm text-white break-all">{record.url}</td>
                                  <td className="py-3 text-sm text-white">{record.domain}</td>
                                  <td className="py-3 text-sm text-white">{record.path}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    
                    {/* WHOIS信息 - 域名查询特有 */}
                    {activeSearchType === 'domain' && otxResults.whois && (
                      <div className="bg-[#25252e] rounded-lg p-6">
                        <h3 className="text-lg font-bold text-white mb-4">{DASHBOARD_OTX_COPY.sections.whois}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.sections.whoisFields[0]}</p>
                            <p className="text-sm font-bold text-white">{otxResults.whois.registrar || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.sections.whoisFields[1]}</p>
                            <p className="text-sm font-bold text-white">{otxResults.whois.creation_date || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.sections.whoisFields[2]}</p>
                            <p className="text-sm font-bold text-white">{otxResults.whois.expiration_date || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.sections.whoisFields[3]}</p>
                            <p className="text-sm font-bold text-white">{otxResults.whois.updated_date || 'N/A'}</p>
                          </div>
                          <div className="md:col-span-2">
                            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{DASHBOARD_OTX_COPY.sections.whoisFields[4]}</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                              {(otxResults.whois.name_servers || []).map((ns: string, index: number) => (
                                <p key={index} className="text-sm font-bold text-white bg-white/5 p-2 rounded">{ns}</p>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* CVE详情 - CVE查询特有 */}
                    {activeSearchType === 'cve' && otxResults.description && (
                      <div className="bg-[#25252e] rounded-lg p-6">
                        <h3 className="text-lg font-bold text-white mb-4">{DASHBOARD_OTX_COPY.sections.cveDescription}</h3>
                        <div className="prose prose-invert max-w-none">
                          <p className="text-sm text-gray-300 whitespace-pre-wrap">{otxResults.description}</p>
                        </div>
                      </div>
                    )}
                    
                    {/* 相关威胁情报 - CVE查询特有 */}
                    {activeSearchType === 'cve' && otxResults.top_n_pulses && otxResults.top_n_pulses.length > 0 && (
                      <div className="bg-[#25252e] rounded-lg p-6">
                        <h3 className="text-lg font-bold text-white mb-4">{DASHBOARD_OTX_COPY.sections.relatedThreatIntel}</h3>
                        <div className="space-y-4">
                          {otxResults.top_n_pulses.map((pulse: any, index: number) => (
                            <div key={index} className="bg-white/5 p-4 rounded-lg">
                              <h4 className="text-sm font-bold text-white">{pulse.name}</h4>
                              <p className="text-xs text-gray-400 mt-1">{pulse.description.substring(0, 150)}...</p>
                              <p className="text-xs text-gray-500 mt-2">{pulse.author_name} • {new Date(pulse.modified).toLocaleDateString()}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* 原始搜索结果 */}
        {!isDnsPage && showResults && results && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
            {/* 页签导航 */}
            <div className="flex overflow-x-auto pb-4 mb-10 gap-2 w-full scrollbar-hide">
              {tabs.map((tab) => (
                <button
                  key={tab.name}
                  onClick={() => setActiveTab(tab.name)}
                  className={cn(
                    "flex items-center gap-3 px-6 py-3 rounded-2xl font-bold transition-all whitespace-nowrap",
                    activeTab === tab.name
                      ? "bg-accent text-white shadow-lg"
                      : "bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300"
                  )}
                >
                  <tab.icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-bold">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div 
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                {/* 结果内容区域 */}
                {activeTab === '报告' && results ? (
                  <div className="space-y-12">
                    {/* 结果标题 */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-center gap-4">
                        <div className="console-control flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl">
                          {/* 使用Google的favicon服务获取域名图标 */}
                          <img 
                            src={`https://www.google.com/s2/favicons?domain=${results.summary.domain}&sz=128`} 
                            alt={`${results.summary.domain} favicon`} 
                            className="w-8 h-8 object-contain" 
                            onError={(e) => {
                              // 当favicon获取失败时，显示默认盾牌图标
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              // 创建并添加默认盾牌图标
                              const shieldIcon = document.createElement('div');
                              shieldIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-accent"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
                              target.parentElement?.appendChild(shieldIcon);
                            }}
                          />
                        </div>
                        <div>
                          <h2 className="text-2xl font-black text-white">{"\u5b89\u5168\u62a5\u544a"}: {results.summary.domain}</h2>
                          <p className="console-muted text-sm font-medium">{"\u751f\u6210\u65e5\u671f"}: {new Date().toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>

                    {/* 总计卡片 */}
                    <div className="console-panel relative overflow-hidden rounded-[40px] p-10 text-center">
                      <p className="console-muted mb-4 text-xs font-semibold uppercase tracking-[0.3em]">{"\u6cc4\u9732\u8d26\u6237\u603b\u6570"}</p>
                      <p className="font-data text-6xl font-semibold tracking-tight text-white">{results.summary.total}</p>
                    </div>

                    {/* 详情卡片网格 */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      <DetailCard 
                        title="\u5458\u5de5" 
                        icon={UserCheck} 
                        data={results.summary.employees} 
                        colorClass="text-emerald-500"
                        onClick={() => {
                          setActiveTab('员工');
                          setCurrentPage(0);
                        }}
                      />
                      <DetailCard 
                        title="\u7b2c\u4e09\u65b9" 
                        icon={ShieldAlert} 
                        data={results.summary.third_parties} 
                        colorClass="text-orange-500"
                        onClick={() => {
                          setActiveTab('第三方');
                          setCurrentPage(0);
                        }}
                      />
                      <DetailCard 
                        title="\u5ba2\u6237" 
                        icon={UserMinus} 
                        data={results.summary.customers} 
                        colorClass="text-accent"
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
                    <div className="console-panel flex flex-col items-start justify-between gap-4 rounded-2xl p-4 md:flex-row md:items-center">
                      <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="relative">
                          <button
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            className="console-control flex min-w-[120px] items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm font-medium text-white transition-all hover:bg-white/[0.08]"
                          >
                            {filterType}
                            {isFilterOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>

                          <AnimatePresence>
                            {isFilterOpen && (
                              <div>
                                <div 
                                  className="fixed inset-0 z-10" 
                                  onClick={() => setIsFilterOpen(false)}
                                />
                                <motion.div
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: 10 }}
                                  className="console-panel absolute left-0 z-20 mt-2 w-full overflow-hidden rounded-xl shadow-xl"
                                >
                                  {(['All', 'Email', 'Username'] as const).map((type) => (
                                    <button
                                      key={type}
                                      type="button"
                                      onClick={() => {
                                        setFilterType(type);
                                        setIsFilterOpen(false);
                                      }}
                                      className={cn(
                                        "w-full text-left px-4 py-3 text-sm font-medium transition-all",
                                        filterType === type
                                          ? "text-white bg-accent/20"
                                          : "console-subtle hover:bg-white/[0.05] hover:text-white"
                                      )}
                                    >
                                      {type === "All" ? "\u5168\u90e8" : type === "Email" ? "\u90ae\u7bb1" : "\u7528\u6237\u540d"}
                                    </button>
                                  ))}
                                </motion.div>
                              </div>
                            )}
                          </AnimatePresence>
                        </div>
                      
                        {/* ??????????????? */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-4 h-4" />
                          <input
                            type="text"
                            placeholder={DASHBOARD_COPY.searchPlaceholder}
                            value={innerSearchQuery}
                            onChange={(e) => setInnerSearchQuery(e.target.value)}
                            className="bg-[#25252e] border border-white/10 pl-10 pr-4 py-2 rounded-xl text-sm text-white placeholder:text-gray-500 focus:ring-0 focus:border-accent/50"
                          />
                        </div>
                      </div>
                      
                      {/* 导出按钮 - 只保留CSV导出，URLs和子域名标签页不显示 */}
                      {activeTab !== 'URLs' && activeTab !== '子域名' && (
                        <div className="flex items-center gap-3 w-full md:w-auto">
                          {/* 导出消息显示 */}
                          {exportMessage && (
                            <motion.span
                              initial={{ opacity: 0, y: 6, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.14)]"
                            >
                              <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.75)]" />
                              {exportMessage}
                            </motion.span>
                          )}
                          
                          <button
                            onClick={handleExport}
                            disabled={exportLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all"
                          >
                            <Download className="w-4 h-4" />
                            {exportLoading ? DASHBOARD_COPY.exportLoading : DASHBOARD_COPY.exportAction}
                          </button>
                        </div>
                      )}
                    </div>

                    {!isSearching && results && (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <ResultPulse
                          label="当前视图"
                          value={`${activeTabMeta?.label || activeTab} · ${activeResultCount.toLocaleString()} 条结果`}
                        />
                        <ResultPulse
                          label="检索状态"
                          value={innerSearchQuery.trim() ? `已按“${innerSearchQuery.trim()}”聚焦结果` : '结果已锁定，可继续筛选与导出'}
                        />
                      </div>
                    )}

                    {/* 结果展示表格 */}
                    {!isSearching && results && filteredCredentials.length === 0 && (
                      <DelightEmptyState
                        title={activeTabMeta?.label === '报告' ? "报告已生成" : "当前视图暂时为空"}
                        body={activeTabMeta?.label === '报告' ? DASHBOARD_COPY.reportEmpty : DASHBOARD_COPY.tabEmpty}
                      />
                    )}

                    <div className={cn(
                      "rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_30px_rgba(147,51,234,0.02)]",
                      !isSearching && results && filteredCredentials.length === 0 && "hidden"
                    )}>
                      <div className="space-y-3 p-4 md:hidden">
                        {filteredCredentials.length > 0 ? (
                          filteredCredentials.map((credential, localIndex) => {
                            const globalIndex = currentPage * pageSize + localIndex;
                            const hiddenMask = globalIndex >= 10;
                            const primaryValue = activeTab === 'URLs' || activeTab === 'å­åŸŸå'
                              ? (credential.website || credential.source || 'N/A')
                              : (credential.email || credential.username || 'N/A');

                            return (
                              <div key={credential.id || `mobile-${globalIndex}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className={`break-all text-sm font-semibold text-white ${hiddenMask ? 'blur-sm opacity-50' : ''}`}>
                                      {primaryValue}
                                    </p>
                                    <p className={`mt-1 break-all text-xs text-gray-500 ${hiddenMask ? 'blur-sm opacity-50' : ''}`}>
                                      {credential.website || credential.source || 'N/A'}
                                    </p>
                                  </div>
                                  {activeTab === 'URLs' || activeTab === 'å­åŸŸå' ? (
                                    <span className={`rounded-full bg-accent/20 px-3 py-1 text-xs font-semibold text-accent ${hiddenMask ? 'blur-sm opacity-50' : ''}`}>
                                      {credential.count || 1}
                                    </span>
                                  ) : (
                                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${credential.email && credential.email.includes('@') ? 'bg-accent/20 text-accent' : 'bg-green-500/20 text-green-400'} ${hiddenMask ? 'blur-sm opacity-50' : ''}`}>
                                      {credential.email && credential.email.includes('@') ? 'EMAIL' : 'USERNAME'}
                                    </span>
                                  )}
                                </div>
                                {activeTab !== 'URLs' && activeTab !== '?????????' && (
                                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="rounded-xl bg-white/5 p-3">
                                      <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">PASSWORD</p>
                                      <p className={`mt-2 break-all font-mono text-sm text-white ${hiddenMask ? 'blur-sm opacity-50' : ''}`}>
                                        {credential.password_plaintext || credential.password_hash?.slice(0, 15) || 'N/A'}
                                      </p>
                                    </div>
                                    <div className="rounded-xl bg-white/5 p-3">
                                      <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Indexed At</p>
                                      <p className={`mt-2 text-sm text-white ${hiddenMask ? 'blur-sm opacity-50' : ''}`}>
                                        {formatDate(credential.leaked_at || '')}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ) : isSearching ? (
                          <div className="rounded-2xl border border-white/10 bg-black/20 p-8 text-center">
                            <Loader2 className="mx-auto h-10 w-10 animate-spin text-accent" />
                            <p className="mt-4 text-sm text-gray-400">{DASHBOARD_COPY.loading}</p>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-white/10 bg-black/20 p-8 text-center">
                            <p className="text-sm text-gray-400">
                              {activeTab === "报告" ? DASHBOARD_COPY.reportEmpty : DASHBOARD_COPY.tabEmpty}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="hidden overflow-x-auto md:block">
                      <table className="w-full min-w-[800px]">
                        <thead>
                          <tr className="border-b border-white/10 bg-gradient-to-r from-accent/20 to-transparent">
                            {/* URL和子域名标签页只显示URL和次数 */}
                            {activeTab === 'URLs' || activeTab === '子域名' ? (
                              [
                                <th key="url" className="px-8 py-5 text-left text-xs font-bold text-accent uppercase tracking-wider">
                                  {activeTab === 'URLs' ? 'URL' : 'SUBDOMAIN'}
                                </th>,
                                <th key="count" className="px-8 py-5 text-left text-xs font-bold text-accent uppercase tracking-wider">
                                  {"\u6b21\u6570"}
                                </th>
                              ]
                            ) : (
                              // 其他标签页显示完整列
                              [
                                <th key="url" className="px-8 py-5 text-left text-xs font-bold text-accent uppercase tracking-wider">
                                  URL
                                </th>,
                                <th key="type" className="px-8 py-5 text-left text-xs font-bold text-accent uppercase tracking-wider">
                                  TYPE
                                </th>,
                                <th key="email" className="px-8 py-5 text-left text-xs font-bold text-accent uppercase tracking-wider">
                                  EMAIL/USERNAME
                                </th>,
                                <th key="password" className="px-8 py-5 text-left text-xs font-bold text-accent uppercase tracking-wider">
                                  PASSWORD
                                </th>,
                                <th key="indexed" className="px-8 py-5 text-left text-xs font-bold text-accent uppercase tracking-wider">
                                  Indexed At
                                </th>
                              ]
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {filteredCredentials.length > 0 ? (
                            filteredCredentials.map((credential, localIndex) => {
                              // 计算全局索引，考虑当前页码
                              const globalIndex = currentPage * pageSize + localIndex;
                              return (
                                <tr 
                                  key={credential.id || globalIndex} 
                                  className="transition-all duration-200 hover:bg-white/10 hover:shadow-[inset_0_0_0_1px_rgba(147,51,234,0.1)]"
                                >
                                  {/* URL和子域名标签页只显示URL和次数 */}
                                  {activeTab === 'URLs' || activeTab === '子域名' ? (
                                    [
                                      <td key="url" className="px-8 py-5 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                          <Globe className="w-4 h-4 text-accent hover:scale-110 transition-transform" />
                                          <div className="relative">
                                            <span className={`text-sm text-white font-medium hover:text-accent transition-colors ${globalIndex >= 10 ? 'blur-sm opacity-50' : ''}`}>
                                              {credential.website || credential.source || 'N/A'}
                                            </span>
                                            {globalIndex >= 10 && (
                                              <div className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center bg-black/30 text-white font-bold text-sm opacity-0 hover:opacity-100 transition-opacity z-10">
                                                已隐藏
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </td>,
                                      <td key="count" className="px-8 py-5 whitespace-nowrap">
                                        <div className="relative">
                                          <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full bg-accent/20 text-accent text-sm font-semibold ${globalIndex >= 10 ? 'blur-sm opacity-50' : ''}`}>
                                            {credential.count || 1}
                                          </span>
                                          {globalIndex >= 10 && (
                                            <div className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center bg-black/30 text-white font-bold text-sm opacity-0 hover:opacity-100 transition-opacity z-10">
                                              已隐藏
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    ]
                                  ) : (
                                    // 其他标签页显示完整数据
                                    [
                                      <td key="url" className="px-8 py-5 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                          <Globe className="w-4 h-4 text-accent" />
                                          <div className="relative">
                                            <span className={`text-sm text-white font-medium ${globalIndex >= 10 ? 'blur-sm opacity-50' : ''}`}>
                                              {credential.website || credential.source || 'N/A'}
                                            </span>
                                            {globalIndex >= 10 && (
                                              <div className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center bg-black/30 text-white font-bold text-sm opacity-0 hover:opacity-100 transition-opacity z-10">
                                                已隐藏
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </td>,
                                      <td key="type" className="px-8 py-5 whitespace-nowrap">
                                        <div className="relative">
                                          <div className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold ${globalIndex >= 10 ? 'blur-sm opacity-50' : ''}`}>
                                            {credential.email && credential.email.includes('@') ? (
                                              <span className="bg-accent/20 text-accent">EMAIL</span>
                                            ) : (
                                              <span className="bg-green-500/20 text-green-400">USERNAME</span>
                                            )}
                                          </div>
                                          {globalIndex >= 10 && (
                                            <div className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center bg-black/30 text-white font-bold text-sm opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                              已隐藏
                                            </div>
                                          )}
                                        </div>
                                      </td>,
                                      <td key="email" className="px-8 py-5 whitespace-nowrap">
                                        <div className="relative">
                                          <span className={`text-sm text-white font-medium truncate max-w-[250px] ${globalIndex >= 10 ? 'blur-sm opacity-50' : ''}`}>
                                            {credential.email || credential.username || 'N/A'}
                                          </span>
                                          {globalIndex >= 10 && (
                                            <div className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center bg-black/30 text-white font-bold text-sm opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                              已隐藏
                                            </div>
                                          )}
                                        </div>
                                      </td>,
                                      <td key="password" className="px-8 py-5 whitespace-nowrap">
                                        <div className="flex items-center gap-3">
                                          {autoUnlock ? (
                                            <div className="relative">
                                              <span className={`text-sm font-medium ${globalIndex >= 10 ? 'blur-sm opacity-50' : ''}`}>
                                                {credential.password_plaintext ? (
                                                  <span className="text-white font-mono bg-white/5 px-2 py-1 rounded">
                                                    {credential.password_plaintext}
                                                  </span>
                                                ) : credential.password_hash ? (
                                                  <span className="text-gray-400 font-mono">{credential.password_hash.slice(0, 15)}...</span>
                                                ) : (
                                                  <span className="text-gray-500 italic">N/A</span>
                                                )}
                                              </span>
                                              {globalIndex >= 10 && (
                                                <div className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center bg-black/30 text-white font-bold text-sm opacity-0 hover:opacity-100 transition-opacity z-10">
                                                  已隐藏
                                                </div>
                                              )}
                                            </div>
                                          ) : (
                                            <div>
                                              {showPasswords[credential.id || globalIndex] ? (
                                                <div className="flex items-center gap-2">
                                                  <div className="relative">
                                                    <span className={`${globalIndex >= 10 ? 'blur-sm opacity-50' : ''}`}>
                                                      {credential.password_plaintext ? (
                                                        <span className="text-white font-mono bg-white/5 px-2 py-1 rounded">
                                                          {credential.password_plaintext}
                                                        </span>
                                                      ) : credential.password_hash ? (
                                                        <span className="text-gray-400 font-mono">{credential.password_hash.slice(0, 15)}...</span>
                                                      ) : (
                                                        <span className="text-gray-500 italic">N/A</span>
                                                      )}
                                                    </span>
                                                    {globalIndex >= 10 && (
                                                      <div className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center bg-black/30 text-white font-bold text-sm opacity-0 hover:opacity-100 transition-opacity z-10">
                                                        已隐藏
                                                      </div>
                                                    )}
                                                  </div>
                                                  <button
                                                    onClick={() => togglePassword(credential.id || globalIndex)}
                                                    className={`p-1 bg-white/10 rounded-full text-gray-400 hover:text-white hover:bg-white/20 transition-colors ${globalIndex >= 10 ? 'opacity-50' : ''}`}
                                                  >
                                                    <EyeOff className="w-4 h-4" />
                                                  </button>
                                                </div>
                                              ) : (
                                                <div className="flex items-center gap-2">
                                                  <div className="relative">
                                                    <span className={`text-gray-400 font-mono ${globalIndex >= 10 ? 'blur-sm opacity-50' : ''}`}>••••••••</span>
                                                    {globalIndex >= 10 && (
                                                      <div className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center bg-black/30 text-white font-bold text-sm opacity-0 hover:opacity-100 transition-opacity z-10">
                                                        已隐藏
                                                      </div>
                                                    )}
                                                  </div>
                                                  <button
                                                    onClick={() => togglePassword(credential.id || globalIndex)}
                                                    className={`p-1 bg-white/10 rounded-full text-gray-400 hover:text-white hover:bg-white/20 transition-colors ${globalIndex >= 10 ? 'opacity-50' : ''}`}
                                                  >
                                                    <Eye className="w-4 h-4" />
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </td>,
                                      <td key="indexed" className="px-8 py-5 whitespace-nowrap">
                                        <div className="relative">
                                          <div className={`text-sm text-gray-400 font-medium ${globalIndex >= 10 ? 'blur-sm opacity-50' : ''}`}>
                                            {formatDate(credential.leaked_at || '')}
                                          </div>
                                          {globalIndex >= 10 && (
                                              <div className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center bg-black/30 text-white font-bold text-sm opacity-0 hover:opacity-100 transition-opacity z-10">
                                              已隐藏
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    ]
                                  )}
                                </tr>
                              );
                            })
                          ) : isSearching ? (
                            <tr>
                              <td colSpan={activeTab === 'URLs' || activeTab === '子域名' ? 2 : 5} className="px-8 py-20 text-center">
                                <div className="flex flex-col items-center gap-4">
                                  <Loader2 className="w-12 h-12 text-accent animate-spin" />
                                  <div className="text-gray-500 text-lg">{DASHBOARD_COPY.loading}</div>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr>
                              <td colSpan={activeTab === 'URLs' || activeTab === '子域名' ? 2 : 5} className="px-8 py-20 text-center">
                                <div className="text-gray-500 text-lg">
                                  {activeTab === "报告" ? DASHBOARD_COPY.reportEmpty : DASHBOARD_COPY.tabEmpty}
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                      </div>
                    </div>
                  
                    {/* 分页控件 */}
                    <div className="flex justify-center mt-8 space-x-2">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 0}
                        className="flex items-center justify-center px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-medium text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-all duration-200"
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        上一页
                      </button>
                      <span className="flex items-center justify-center px-4 py-2 bg-accent/20 border border-accent/40 rounded-lg text-sm font-medium text-white shadow-sm">
                        第 {currentPage + 1} 页
                      </span>
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={filteredCredentials.length < pageSize}
                        className="flex items-center justify-center px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-medium text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-all duration-200"
                      >
                        下一页
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
