import { useState, useEffect } from 'react';
// import { motion } from 'framer-motion';
import { 
  Search, 
  Shield,
  Database,
  RefreshCw,
  Loader2,
  AlertCircle,
  Calendar,
  Globe,
  MessageSquare
} from 'lucide-react';
import { leakRadarApi } from '../api/leakRadar';

const DarkWeb = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [error, setError] = useState<string>('');
  const [sources, setSources] = useState(5); // 默认来源数量
  const [posts, setPosts] = useState(701028); // 默认帖子总数
  const [advancedSearch, setAdvancedSearch] = useState(false);
  const [activeTab, setActiveTab] = useState('简单模式');

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // 搜索处理函数
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setError('');
    setCurrentPage(1);

    try {
      const response = await leakRadarApi.searchDarkWebMentions(
        searchQuery, 
        1, 
        pageSize,
        advancedSearch,
        activeTab === '按日期排序' ? 'published_at' : 'relevance',
        activeTab === '按日期排序' ? 'desc' : 'desc'
      );
      if (response.success) {
        setSearchResults(response.results || []);
        setTotalResults(response.total || 0);
      } else {
        setError('搜索失败，请重试');
      }
    } catch (err: any) {
      setError(err.message || '搜索失败，请检查网络连接');
    } finally {
      setIsSearching(false);
    }
  };

  // const [sourcesList, setSourcesList] = useState<Array<{ id: string; name: string; post_count: number; url: string }>>([]);

  // 加载暗网统计信息
  useEffect(() => {
    const loadDarkWebStatistics = async () => {
      try {
        // 获取暗网统计信息
        const statsResponse = await leakRadarApi.getDarkWebStatistics();
        if (statsResponse.success) {
          setPosts(statsResponse.total_posts || 701028);
          setSources(statsResponse.total_sources || 5);
        }

        // 获取暗网来源信息
        const sourcesResponse = await leakRadarApi.getDarkWebSources();
        if (sourcesResponse.success && sourcesResponse.sources) {
          // setSourcesList(sourcesResponse.sources);
          // 如果统计信息中没有total_sources，则从来源列表长度计算
          if (!statsResponse.success) {
            setSources(sourcesResponse.sources.length || 5);
          }
        }
      } catch (err) {
        console.error('Failed to load dark web statistics:', err);
      }
    };

    loadDarkWebStatistics();
  }, []);

  // 分页处理
  const handlePageChange = async (newPage: number) => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setCurrentPage(newPage);

    try {
      const response = await leakRadarApi.searchDarkWebMentions(
        searchQuery, 
        newPage, 
        pageSize,
        advancedSearch,
        activeTab === '按日期排序' ? 'published_at' : 'relevance',
        activeTab === '按日期排序' ? 'desc' : 'desc'
      );
      if (response.success) {
        setSearchResults(response.results || []);
      } else {
        setError('加载分页数据失败');
      }
    } catch (err: any) {
      setError(err.message || '加载分页数据失败');
    } finally {
      setIsSearching(false);
    }
  };

  // 示例输入处理
  const handleExampleClick = (example: string) => {
    setSearchQuery(example);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#1a1a2e] animate-in fade-in duration-700">
      {/* 功能完善中横幅 */}
      <div className="w-full bg-yellow-500/20 border-b border-yellow-500/40 p-4 text-center">
        <p className="text-yellow-400 font-bold text-lg">功能完善中</p>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 顶部标题和统计信息 */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <Shield className="w-6 h-6 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">暗网搜索</h1>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-300">帖子总数</span>
              <span className="px-3 py-1 bg-accent/20 text-accent rounded-full text-sm font-medium">{posts.toLocaleString()}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-300">最后更新</span>
              <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-medium">刚刚</span>
            </div>
            
            {/* 来源数统计 */}
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-300">来源</span>
              <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium">{sources.toLocaleString()}</span>
            </div>
          </div>
        </div>
        
        {/* 描述文本 */}
        <p className="text-sm text-gray-400 mb-6">
          在暗网论坛和市场中搜索您的公司、域名、IP和员工凭据的提及，提前防范威胁。
        </p>
        
        {/* 搜索框 */}
        <div className="bg-[#25253e] border border-white/10 rounded-2xl p-6 mb-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索关键词：公司名称、域名、IP、邮箱..."
                className="w-full bg-[#1a1a2e] border border-white/5 rounded-xl pl-12 pr-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-accent/50"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="bg-accent hover:bg-accent/80 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2"
            >
              {isSearching ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Search className="w-5 h-5" />
              )}
              搜索
            </button>
          </form>
          
          {/* 高级搜索选项 */}
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="advanced-search" 
                checked={advancedSearch}
                onChange={(e) => setAdvancedSearch(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="advanced-search" className="text-sm text-gray-400">高级搜索</label>
            </div>
          </div>
        </div>
        
        {/* 选项卡 */}
        <div className="flex gap-2 mb-6">
          {['简单模式', '搜索标题和内容', '按日期排序', '按论坛抓取'].map((tab) => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 bg-[#25253e] border border-white/10 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab ? 'text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        
        {/* 错误信息 */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-400 text-sm">{error}</span>
          </div>
        )}
        
        {/* 搜索结果 */}
        {searchResults.length > 0 ? (
          <div className="bg-[#25253e] border border-white/10 rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">搜索结果</h2>
              <span className="text-sm text-gray-400">共 {totalResults} 条结果</span>
            </div>
            
            <div className="space-y-4">
              {searchResults.map((result, index) => (
                <div key={index} className="bg-[#1a1a2e] border border-white/5 rounded-xl p-4 hover:border-accent/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-white font-medium mb-2">{result.title || '未命名帖子'}</h3>
                      <p className="text-gray-400 text-sm mb-3">{result.content || '无内容'}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{result.date || '未知日期'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          <span>{result.source || '未知来源'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          <span>{result.comments || 0} 评论</span>
                        </div>
                      </div>
                    </div>
                    <div className="px-3 py-1 bg-accent/20 text-accent rounded-full text-xs font-medium">
                      {result.type || '帖子'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* 分页控件 */}
            {totalResults > pageSize && (
              <div className="flex items-center justify-center mt-6 gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-[#1a1a2e] border border-white/5 rounded-lg text-sm text-gray-400 disabled:opacity-50 hover:border-accent/50 transition-colors"
                >
                  上一页
                </button>
                <span className="text-sm text-gray-400">
                  第 {currentPage} 页，共 {Math.ceil(totalResults / pageSize)} 页
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage * pageSize >= totalResults}
                  className="px-4 py-2 bg-[#1a1a2e] border border-white/5 rounded-lg text-sm text-gray-400 disabled:opacity-50 hover:border-accent/50 transition-colors"
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        ) : searchQuery && !isSearching ? (
          <div className="bg-[#25253e] border border-white/10 rounded-2xl p-12 text-center mb-6">
            <div className="mb-4">
              <Shield className="w-12 h-12 text-gray-500 mx-auto" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">未找到结果</h2>
            <p className="text-gray-400">
              没有找到与 "{searchQuery}" 相关的暗网信息
            </p>
          </div>
        ) : (
          /* 主要内容区域 */
          <div className="bg-[#25253e] border border-white/10 rounded-2xl p-12 text-center">
            <div className="mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-accent/20 rounded-full mb-6">
                <Shield className="w-8 h-8 text-accent" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-4">开始暗网监控</h2>
              <p className="text-gray-400 max-w-2xl mx-auto">
                输入您的公司名称、域名、IP地址或邮箱，以发现您的资产是否在暗网论坛上被讨论或交易。
              </p>
            </div>
            
            {/* 示例输入 */}
            <div className="flex flex-wrap justify-center gap-3">
              <button 
                onClick={() => handleExampleClick('walmart.com')}
                className="px-4 py-2 bg-[#1a1a2e] border border-white/5 rounded-lg text-sm text-gray-300 hover:border-accent/50 transition-colors"
              >
                walmart.com
              </button>
              <button 
                onClick={() => handleExampleClick('admin@admin.com')}
                className="px-4 py-2 bg-[#1a1a2e] border border-white/5 rounded-lg text-sm text-gray-300 hover:border-accent/50 transition-colors"
              >
                admin@admin.com
              </button>
              <button 
                onClick={() => handleExampleClick('127.0.0.1')}
                className="px-4 py-2 bg-[#1a1a2e] border border-white/5 rounded-lg text-sm text-gray-300 hover:border-accent/50 transition-colors"
              >
                127.0.0.1
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DarkWeb;