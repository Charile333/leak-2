import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Loader2,
  ChevronDown,
  UserCheck
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { LeakedCredential, DomainSearchSummary } from '../services/dataService';
import { leakRadarApi } from '../api/leakRadar';

// 简单的数字显示组件，替代AnimatedNumber
const SimpleNumber = ({ value }: { value: string }) => {
  return <span>{value}</span>;
};

const EmailUsernameSearch = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [activeTab, setActiveTab] = useState('报告');
  const [filterType, setFilterType] = useState<'All' | 'Email' | 'Username'>('All');
  const [innerSearchQuery, setInnerSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [results, setResults] = useState<{ summary: DomainSearchSummary, credentials: LeakedCredential[] } | null>(null);
  const [totalLeaks, setTotalLeaks] = useState<string>('---,---,---,---');
  const [pageSize] = useState(20);
  const [_currentPage, setCurrentPage] = useState(0);
  // 保存各个分类的数据，避免替换原始完整数据
  const [categoryCredentials, setCategoryCredentials] = useState<Record<string, LeakedCredential[]>>({});
  // 错误状态
  const [error, setError] = useState<string | null>(null);
  
  // 防止搜索时页面跳动：只在用户提交搜索时才处理结果显示/隐藏
  useEffect(() => {
    // 当有搜索结果且搜索已完成时，显示结果
    if (results && !isSearching) {
      setShowResults(true);
    }
  }, [results, isSearching]);
  
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
        console.error('[EmailUsernameSearch] Error fetching stats:', error);
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
    
    // 清除之前的错误
    setError(null);

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
      // 使用邮件/用户名搜索接口
      if (page === 0) {
        // 自动解锁逻辑 - 仅在初始搜索时触发
        try {
          await leakRadarApi.unlockEmailSearch(searchQuery);
          console.log('[EmailSearch] Auto-unlock triggered for:', searchQuery);
        } catch (unlockErr) {
          // 解锁失败不应阻断搜索流程，记录警告即可
          console.warn('[EmailSearch] Auto-unlock failed:', unlockErr);
        }

        // 使用leakRadarApi.searchByEmail方法进行邮件/用户名搜索
        const emailResults = await leakRadarApi.searchByEmail(searchQuery, pageSize, page * pageSize);
        
        // 转换搜索结果为预期格式
        const summary: DomainSearchSummary = {
          domain: searchQuery,
          total: emailResults.total || 0,
          employees: { count: emailResults.total || 0, strength: { strong: 0, medium: 0, weak: 0, very_weak: 0 } },
          third_parties: { count: 0, strength: { strong: 0, medium: 0, weak: 0, very_weak: 0 } },
          customers: { count: 0, strength: { strong: 0, medium: 0, weak: 0, very_weak: 0 } },
          urls_count: 0,
          subdomains_count: 0
        };
        
        // 转换搜索结果为LeakedCredential格式
        const credentials: LeakedCredential[] = emailResults.items.map((item: any) => {
          // Map strength number to string
          let strength: LeakedCredential['strength'] = 'Medium';
          const s = item.password_strength;
          if (s >= 8) strength = 'Strong';
          else if (s >= 5) strength = 'Medium';
          else if (s >= 3) strength = 'Weak';
          else strength = 'Very Weak';
          
          // 官方API使用is_email字段来标识是否为邮箱
          // 增强判断逻辑：如果is_email字段不存在，则通过email字段内容判断
          const isEmail = item.is_email === true || (item.is_email === undefined && item.email && item.email.includes('@'));
          const credentialValue = item.email || item.username || item.user || item.account || '';
          
          return {
            id: item.id || `leak-${Math.random()}`,
            email: isEmail ? credentialValue : '',
            username: isEmail ? (item.username || 'N/A') : credentialValue,
            password_plaintext: item.password_plaintext || item.password || '********',
            password_hash: item.password_hash || '',
            hash_type: item.hash_type || 'Unknown',
            website: item.website || item.url || item.domain || item.url_domain || item.url_host || item.source_domain || 'N/A',
              source: item.source || item.breach_name || item.database_name || 'Leak Database',
              leaked_at: item.leaked_at || item.added_at || item.date || item.breach_date || new Date().toISOString(),
              type: 'Customer', // 默认为Customer类型，符合LeakedCredential定义
              strength,
              ip_address: item.ip_address,
            first_name: item.first_name,
            last_name: item.last_name,
            phone: item.phone,
            city: item.city,
            country: item.country
          };
        });
        
        setResults({ summary, credentials });
      }

      // 然后根据当前活动标签页获取对应分类的数据
      let category: 'employees' | 'customers' | 'third_parties' | 'urls' | 'subdomains' | null = null;
      if (activeTab === '员工') category = 'employees';
      else if (activeTab === '客户') category = 'customers';
      else if (activeTab === '第三方') category = 'third_parties';
      else if (activeTab === 'URLs') category = 'urls';
      else if (activeTab === '子域名') category = 'subdomains';

      if (category) {
        // 对于邮件/用户名搜索，暂时只支持客户分类，其他分类返回空数组
        let newCredentials: LeakedCredential[] = [];
        if (category === 'customers') {
          // 获取分类数据
          const emailResults = await leakRadarApi.searchByEmail(searchQuery, pageSize, page * pageSize);
          
          // 转换搜索结果为LeakedCredential格式
          newCredentials = emailResults.items.map((item: any) => {
            // Map strength number to string
            let strength: LeakedCredential['strength'] = 'Medium';
            const s = item.password_strength;
            if (s >= 8) strength = 'Strong';
            else if (s >= 5) strength = 'Medium';
            else if (s >= 3) strength = 'Weak';
            else strength = 'Very Weak';
            
            // 官方API使用is_email字段来标识是否为邮箱
            // 增强判断逻辑：如果is_email字段不存在，则通过email字段内容判断
            const isEmail = item.is_email === true || (item.is_email === undefined && item.email && item.email.includes('@'));
            const credentialValue = item.email || item.username || item.user || item.account || '';
            
            return {
              id: item.id || `leak-${Math.random()}`,
              email: isEmail ? credentialValue : '',
              username: isEmail ? (item.username || 'N/A') : credentialValue,
              password_plaintext: item.password_plaintext || item.password || '********',
              password_hash: item.password_hash || '',
              hash_type: item.hash_type || 'Unknown',
              website: item.website || item.url || item.domain || item.url_domain || item.url_host || item.source_domain || 'N/A',
              source: item.source || item.breach_name || item.database_name || 'Leak Database',
              leaked_at: item.leaked_at || item.added_at || item.date || item.breach_date || new Date().toISOString(),
              type: 'Customer', // 默认为Customer类型，符合LeakedCredential定义
              strength,
              ip_address: item.ip_address,
              first_name: item.first_name,
              last_name: item.last_name,
              phone: item.phone,
              city: item.city,
              country: item.country
            };
          });
        }
        
        // 保存当前分类的数据，根据页码决定是替换还是合并
        setCategoryCredentials(prev => ({
          ...prev,
          [category]: newCredentials
        }));
      }

      setIsSearching(false);
      
      // 只有在初始搜索时（通过表单提交，e有值）且当前标签页不是URLs或子域名时，才默认显示报告子标签
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
    } catch (error: any) {
      console.error('Search failed:', error);
      setIsSearching(false);
      
      // 设置错误信息，显示给用户
      setError(error.message || '搜索失败，请稍后重试');
      
      // 显示结果区域，以便用户看到错误信息
      setShowResults(true);
    }
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

  // togglePassword函数已注释，因为未使用
  // const togglePassword = (id: string | number) => {
  //   setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  // };

  // tabs数组已注释，因为未使用
  // const tabs = [
  //   { name: '报告', icon: LayoutGrid, count: results?.summary.total ?? 0 },
  //   { name: '员工', icon: User, count: results?.summary.employees.count ?? 0 },
  //   { name: '第三方', icon: Briefcase, count: results?.summary.third_parties.count ?? 0 },
  //   { name: '客户', icon: Users, count: results?.summary.customers.count ?? 0 },
  //   { name: 'URLs', icon: LinkIcon, count: results?.summary.urls_count ?? 0 },
  //   { name: '子域名', icon: Globe, count: results?.summary.subdomains_count ?? 0 },
  // ];

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col animate-in fade-in duration-700">
      
      {/* 核心展示区 */}
      <div className="relative pt-10 pb-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0a0a0c] p-5 shadow-[0_0_100px_rgba(168,85,247,0.05)] backdrop-blur-2xl sm:rounded-[2.5rem] sm:p-8 lg:rounded-[3rem] lg:p-16 xl:p-20">
            {/* 装饰性背景 */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(168,85,247,0.1),transparent_70%)] pointer-events-none" />
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay" />
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-accent/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-accent/10 rounded-full blur-[120px] pointer-events-none" />
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <div>
                <h1 className="text-7xl md:text-[10rem] font-black text-white tracking-tighter mb-6 leading-none select-none drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                  <SimpleNumber value={totalLeaks} />
                </h1>
              </div>
              
              <div className="flex items-center gap-4 mb-12">
                <div className="h-px w-12 bg-gradient-to-r from-transparent to-accent" />
                <p className="text-xs font-black text-accent tracking-[0.5em] uppercase opacity-90">
                  {'\u5df2\u7d22\u5f15\u7684\u6cc4\u9732\u8bb0\u5f55\u603b\u6570'}
                </p>
                <div className="h-px w-12 bg-gradient-to-l from-transparent to-accent" />
              </div>
              
              <p className="mb-8 max-w-3xl text-base font-medium leading-relaxed text-gray-400 sm:mb-10 sm:text-lg lg:mb-14 lg:text-xl">
                {'\u51e0\u79d2\u949f\u5185\u5373\u53ef\u68c0\u67e5\u90ae\u7bb1\u6216\u7528\u6237\u540d\u7684\u6cc4\u9732\u60c5\u51b5\u3002\u6211\u4eec\u76d1\u63a7\u5168\u7403\u6570\u5343\u4e2a\u6570\u636e\u6cc4\u9732\u6e90\u3002'}
              </p>

              <form 
                onSubmit={(e) => handleSearch(e)} 
                className="group relative w-full max-w-3xl"
              >
                  {/* 原始搜索表单 */}
                  <div className="relative flex flex-col overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] p-2 shadow-2xl transition-all duration-500 focus-within:border-accent/50 focus-within:shadow-[0_0_50px_rgba(168,85,247,0.1)] sm:flex-row sm:items-center backdrop-blur-3xl">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={'\u8f93\u5165\u90ae\u7bb1\u6216\u7528\u6237\u540d'}
                      className="min-w-0 flex-1 border-none bg-transparent px-4 py-4 text-base font-medium text-white placeholder:text-gray-500 focus:ring-0 sm:px-6 sm:py-4 sm:text-lg lg:px-8 lg:py-5 lg:text-xl"
                    />
                    <button 
                      type="submit"
                      disabled={isSearching}
                      className="accent-glow mt-2 flex min-h-12 w-full items-center justify-center gap-3 rounded-[22px] bg-accent px-6 py-3 text-base font-black text-white shadow-xl transition-all hover:scale-[1.02] hover:bg-accent/80 active:scale-[0.98] disabled:opacity-50 sm:mt-0 sm:w-auto sm:px-8 sm:py-4 sm:text-lg lg:px-12 lg:py-5 lg:text-xl"
                    >
                      {isSearching ? (
                        <div className="flex items-center gap-3">
                          <Loader2 className="w-6 h-6 text-white animate-spin" />
                          {'\u641c\u7d22\u4e2d...'}
                        </div>
                      ) : (
                        '\u7acb\u5373\u641c\u7d22'
                      )}
                    </button>
                  </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* 搜索结果区域 */}
      <div id="search-results" className="min-h-[420px] scroll-mt-24 sm:min-h-[600px]">
        {/* 原始搜索结果 */}
        {showResults && (
          <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
            {/* 错误提示 */}
            {error && (
              <div className="mb-8 bg-red-500/10 border border-red-500/30 rounded-2xl p-6">
                <div className="flex items-center gap-4">
                  <div className="bg-red-500/20 p-3 rounded-full">
                    <Search className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-red-400 mb-2">{'\u641c\u7d22\u5931\u8d25'}</h3>
                    <p className="text-gray-400">{error}</p>
                    <button 
                      onClick={() => setError(null)} 
                      className="mt-4 text-sm font-bold text-red-400 hover:text-red-300 transition-colors"
                    >
                      {'\u5173\u95ed'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* 正常搜索结果 */}
            {!error && results && (
              <>
                <div>
                  <div>
                    <div className="space-y-6">
                      {/* 筛选区域 */}
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            className="flex min-h-11 items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-gray-400 transition-colors hover:bg-white/10"
                          >
                            <span className="text-sm font-bold">{'\u7b5b\u9009'}</span>
                            <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isFilterOpen ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                        
                        <div className="relative w-full lg:w-64">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-4 h-4" />
                          <input
                            type="text"
                            placeholder={'\u641c\u7d22\u7ed3\u679c...'}
                            className="w-full rounded-full bg-white/5 py-3 pl-10 pr-4 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-accent/50"
                            value={innerSearchQuery}
                            onChange={(e) => setInnerSearchQuery(e.target.value)}
                          />
                        </div>
                      </div>
                      
                      {/* 筛选选项 */}
                      {isFilterOpen && (
                        <div className="overflow-hidden">
                          <div className="bg-white/5 rounded-2xl p-6">
                            <h3 className="text-lg font-bold text-white mb-4">{'\u7b5b\u9009\u9009\u9879'}</h3>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                              <div>
                                <p className="text-sm font-bold text-gray-400 mb-3">{'\u7c7b\u578b'}</p>
                                <div className="flex flex-col gap-2">
                                  {
                                    [
                                      { label: '全部', value: 'All' },
                                      { label: '邮箱', value: 'Email' },
                                      { label: '用户名', value: 'Username' }
                                    ].map(({ label, value }) => (
                                      <button
                                        key={value}
                                        onClick={() => setFilterType(value as any)}
                                        className={cn(
                                          "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-colors",
                                          filterType === value
                                            ? "bg-accent text-white"
                                            : "bg-white/5 text-gray-400 hover:bg-white/10"
                                        )}
                                      >
                                        <span>{label}</span>
                                      </button>
                                    ))
                                  }
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* 结果表格 */}
                    <div className="mt-6 overflow-hidden rounded-xl border border-white/5 bg-[#1a1a20] shadow-2xl">
                      <div className="p-4 sm:p-6">
                        <div className="space-y-3 md:hidden">
                          {filteredCredentials.map((cred, index) => (
                            <div key={`${cred.id || index}-mobile-${cred.website}-${cred.email}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="break-all text-sm font-semibold text-white">{cred.email || cred.username || 'N/A'}</p>
                                  <p className="mt-1 break-all font-mono text-xs text-gray-400">{cred.website || 'N/A'}</p>
                                </div>
                                <span className={cn(
                                  "shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold",
                                  cred.email && cred.email.includes('@')
                                    ? "border-accent/20 bg-accent/10 text-accent"
                                    : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                                )}>
                                  {cred.email && cred.email.includes('@') ? '\u90ae\u7bb1' : '\u7528\u6237\u540d'}
                                </span>
                              </div>
                              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="rounded-xl bg-black/20 p-3">
                                  <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">{'\u5bc6\u7801'}</p>
                                  <p className="mt-2 break-all font-mono text-sm text-red-400">{cred.password_plaintext || 'N/A'}</p>
                                </div>
                                <div className="rounded-xl bg-black/20 p-3">
                                  <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">{'\u6cc4\u9732\u65e5\u671f'}</p>
                                  <p className="mt-2 text-sm text-white">{formatDate(cred.leaked_at)}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                          {filteredCredentials.length === 0 && (
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
                              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
                                <Search className="h-7 w-7 text-gray-500" />
                              </div>
                              <p className="mt-4 text-lg font-bold text-gray-400">{'\u6682\u65e0\u6570\u636e'}</p>
                              <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">{'\u672a\u627e\u5230\u4e0e\u641c\u7d22\u6761\u4ef6\u5339\u914d\u7684\u7ed3\u679c\u3002\u8bf7\u5c1d\u8bd5\u8c03\u6574\u7b5b\u9009\u6761\u4ef6\u6216\u4f7f\u7528\u5176\u4ed6\u641c\u7d22\u8bcd\u3002'}</p>
                            </div>
                          )}
                        </div>
                        <div className="hidden overflow-x-auto md:block">
                          <table className="w-full min-w-[720px] text-left">
                            <thead>
                              <tr className="border-b border-white/10">
                                <th className="pb-5 text-xs font-bold text-gray-500 uppercase tracking-wider">URL</th>
                            <th className="pb-5 text-xs font-bold text-gray-500 uppercase tracking-wider">{'\u7c7b\u578b'}</th>
                            <th className="pb-5 text-xs font-bold text-gray-500 uppercase tracking-wider">{'\u90ae\u7bb1 / \u7528\u6237\u540d'}</th>
                            <th className="pb-5 text-xs font-bold text-gray-500 uppercase tracking-wider">{'\u5bc6\u7801'}</th>
                            <th className="pb-5 text-xs font-bold text-gray-500 uppercase tracking-wider">{'\u6cc4\u9732\u65e5\u671f'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredCredentials.map((cred, index) => (
                            <tr key={`${cred.id || index}-${cred.website}-${cred.email}`} className="border-b border-white/5 hover:bg-white/5">
                              <td className="py-4 text-sm text-white font-mono break-all max-w-[200px]">{cred.website || 'N/A'}</td>
                              <td className="py-4">
                                <span className={cn(
                                  "px-2 py-1 rounded text-xs font-bold border",
                                  cred.email && cred.email.includes('@') ? "bg-accent/10 text-accent border-accent/20" :
                                  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                )}>
                                  {cred.email && cred.email.includes('@') ? '邮箱' : '用户名'}
                                </span>
                              </td>
                              <td className="py-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-accent/70 flex items-center justify-center flex-shrink-0">
                                    <UserCheck className="w-4 h-4 text-white" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-white">{cred.email || cred.username}</p>
                                    {cred.email && cred.username && cred.username !== cred.email && cred.username !== 'N/A' && (
                                      <p className="text-xs text-gray-500">{cred.username}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-4">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-mono text-red-400">{cred.password_plaintext}</span>
                                      <span className={cn(
                                        "px-2 py-0.5 rounded text-[10px] font-bold",
                                        cred.strength === 'Strong' ? "bg-emerald-500/20 text-emerald-400"
                                        : cred.strength === 'Medium' ? "bg-accent/20 text-accent"
                                        : cred.strength === 'Weak' ? "bg-orange-500/20 text-orange-400"
                                        : "bg-red-500/20 text-red-400"
                                      )}>
                                        {cred.strength}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-4 text-sm text-gray-400">{formatDate(cred.leaked_at)}</td>
                                </tr>
                              ))}
                              {filteredCredentials.length === 0 && (
                                 <tr>
                                   <td colSpan={5} className="py-12 text-center">
                                     <div className="flex flex-col items-center gap-4">
                                      <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                                        <Search className="w-8 h-8 text-gray-500" />
                                      </div>
                                      <p className="text-lg font-bold text-gray-500">{'\u6682\u65e0\u6570\u636e'}</p>
                                      <p className="text-sm text-gray-600 max-w-md">{'\u672a\u627e\u5230\u4e0e\u641c\u7d22\u6761\u4ef6\u5339\u914d\u7684\u7ed3\u679c\u3002\u8bf7\u5c1d\u8bd5\u8c03\u6574\u7b5b\u9009\u6761\u4ef6\u6216\u4f7f\u7528\u5176\u4ed6\u641c\u7d22\u8bcd\u3002'}</p>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

          </div>
        )}
      </div>
    </div>
  );
};

export default EmailUsernameSearch;
