import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Search, 
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { otxApi } from '../api/otxApi';

const IocSearch = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchType, setActiveSearchType] = useState<'ip' | 'domain' | 'url' | 'cve'>('ip');
  const [otxResults, setOtxResults] = useState<any>(null);
  const [otxLoading, setOtxLoading] = useState(false);
  const [otxError, setOtxError] = useState<string>('');
  const [showResults, setShowResults] = useState(false);
  
  // OTX Passive DNS Pagination
  const [passiveDnsPage, setPassiveDnsPage] = useState(1);
  const PASSIVE_DNS_PAGE_SIZE = 50;

  // OTX API 查询函数
  const handleOtxSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || otxLoading) return;
    
    setOtxLoading(true);
    setOtxError('');
    setPassiveDnsPage(1); // 重置被动DNS分页
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

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col animate-in fade-in duration-700">
      {/* 功能完善中横幅 */}
      <div className="w-full bg-yellow-500/20 border-b border-yellow-500/40 p-4 text-center">
        <p className="text-yellow-400 font-bold text-lg">功能完善中</p>
      </div>
      
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
                <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-6 leading-none select-none drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                  威胁情报查询
                </h1>
              </motion.div>
              
              <div className="flex items-center gap-4 mb-12">
                <div className="h-px w-12 bg-gradient-to-r from-transparent to-accent" />
                <p className="text-xs font-black text-accent tracking-[0.5em] uppercase opacity-90">
                  IOC / IP / DOMAIN / URL / CVE
                </p>
                <div className="h-px w-12 bg-gradient-to-l from-transparent to-accent" />
              </div>
              
              <p className="max-w-3xl text-xl text-gray-400 mb-14 leading-relaxed font-medium">
                查询 IP、域名、URL 或 CVE 的威胁情报。基于 OTX AlienVault 数据源。
              </p>

              <form 
                onSubmit={handleOtxSearch} 
                className="w-full max-w-3xl relative group"
              >
                <div>
                  {/* 搜索类型选项卡 */}
                  <div className="flex gap-2 mb-4 justify-center bg-[#1a1a2e] p-1.5 rounded-full">
                    {
                      [
                        { type: 'ip', label: 'IP', placeholder: '输入IP地址' },
                        { type: 'domain', label: '域名', placeholder: '输入域名' },
                        { type: 'url', label: 'URL', placeholder: '输入URL' },
                        { type: 'cve', label: 'CVE', placeholder: '输入CVE编号' }
                      ].map(({ type, label }) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setActiveSearchType(type as any);
                          }}
                          className={cn(
                            "px-6 py-3 rounded-full text-sm font-bold transition-all duration-300",
                            activeSearchType === type
                              ? "bg-accent/50 text-white/70 shadow-lg"
                              : "text-gray-500 hover:bg-white/10"
                          )}
                        >
                          {label}
                        </button>
                      ))
                    }
                  </div>
                  
                  {/* 搜索框 */}
                  <div className="relative flex items-center bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-[28px] overflow-hidden p-2 shadow-2xl focus-within:border-accent/50 focus-within:shadow-[0_0_50px_rgba(168,85,247,0.15)] transition-all duration-500">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={
                        activeSearchType === 'ip' ? "输入IP地址" :
                        activeSearchType === 'domain' ? "输入域名" :
                        activeSearchType === 'url' ? "输入URL" :
                        "输入CVE编号"
                      }
                      className="flex-1 bg-transparent border-none text-white placeholder:text-gray-500 focus:ring-0 px-8 py-5 text-xl font-medium"
                    />
                    <button
                      type="submit"
                      disabled={otxLoading}
                      className="bg-accent hover:bg-accent/80 disabled:opacity-50 text-white px-12 py-5 rounded-[22px] font-black transition-all text-xl shadow-xl hover:scale-[1.02] active:scale-[0.98] flex items-center gap-3 purple-glow"
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
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* 搜索结果区域 */}
      <div id="search-results" className="scroll-mt-24 min-h-[600px]">
        {showResults && otxResults && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
            <div className="bg-[#1a1a20] border border-white/5 rounded-xl overflow-hidden shadow-2xl">
              <div className="p-8">
                <h2 className="text-2xl font-black text-white mb-6">
                  {activeSearchType === 'ip' ? 'IP查询结果' :
                   activeSearchType === 'domain' ? '域名查询结果' :
                   activeSearchType === 'url' ? 'URL检测结果' :
                   'CVE漏洞情报'}
                </h2>
                
                {/* IP查询结果优化展示 */}
                {(activeSearchType === 'ip' || activeSearchType === 'domain' || activeSearchType === 'url' || activeSearchType === 'cve') && (
                  <div className="space-y-6">
                    {/* 概览信息 */}
                    <div className="bg-[#25252e] rounded-lg p-6">
                      <h3 className="text-lg font-bold text-white mb-4">概览信息</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {activeSearchType === 'ip' && (
                          <>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">IP地址</p>
                              <p className="text-sm font-bold text-white">{otxResults.indicator || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">ASN归属</p>
                              <p className="text-sm font-bold text-white">{otxResults.asn || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">地理位置</p>
                              <p className="text-sm font-bold text-white">{`${otxResults.country || 'N/A'} ${otxResults.city || ''}`}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">信誉评分</p>
                              <p className="text-sm font-bold text-white">{otxResults.reputation || (otxResults.pulse_info?.count > 0 ? '恶意' : '中立')}</p>
                            </div>
                          </>
                        )}
                        
                        {activeSearchType === 'domain' && (
                          <>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">域名</p>
                              <p className="text-sm font-bold text-white">{otxResults.indicator || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">威胁情报数量</p>
                              <p className="text-sm font-bold text-white">{otxResults.pulse_info?.count || 0}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">信誉评分</p>
                              <p className="text-sm font-bold text-white">{otxResults.reputation || (otxResults.pulse_info?.count > 0 ? '恶意' : '中立')}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">注册状态</p>
                              <p className="text-sm font-bold text-white">{otxResults.whois?.registrar ? '已注册' : '未知'}</p>
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
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">域名</p>
                              <p className="text-sm font-bold text-white">{otxResults.domain || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">IP地址</p>
                              <p className="text-sm font-bold text-white">{otxResults.ip || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">信誉评分</p>
                              <p className="text-sm font-bold text-white">{otxResults.reputation || (otxResults.pulse_info?.count > 0 ? '恶意' : '中立')}</p>
                            </div>
                          </>
                        )}
                        
                        {activeSearchType === 'cve' && (
                          <>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">CVE编号</p>
                              <p className="text-sm font-bold text-white">{otxResults.indicator || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">CVSS评分</p>
                              <p className="text-sm font-bold text-white">{otxResults.base_score || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">发布日期</p>
                              <p className="text-sm font-bold text-white">{otxResults.published || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">威胁等级</p>
                              <p className="text-sm font-bold text-white">{otxResults.pulse_info?.count > 0 ? '高' : '中'}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* DNS反查（被动DNS） - IP和域名查询都可能有 */}
                    {(activeSearchType === 'ip' || activeSearchType === 'domain') && otxResults.passive_dns && otxResults.passive_dns.length > 0 && (
                      <div className="bg-[#25252e] rounded-lg p-6">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-bold text-white">被动DNS记录</h3>
                          <span className="text-xs text-gray-500">共 {otxResults.passive_dns.length} 条</span>
                        </div>
                        <div className="overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent relative">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-white/10">
                                <th className="sticky top-0 bg-[#25252e] z-10 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">域名</th>
                                <th className="sticky top-0 bg-[#25252e] z-10 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">类型</th>
                                <th className="sticky top-0 bg-[#25252e] z-10 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">首次出现</th>
                                <th className="sticky top-0 bg-[#25252e] z-10 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">最后出现</th>
                              </tr>
                            </thead>
                            <tbody>
                              {otxResults.passive_dns
                                .slice((passiveDnsPage - 1) * PASSIVE_DNS_PAGE_SIZE, passiveDnsPage * PASSIVE_DNS_PAGE_SIZE)
                                .map((record: any, index: number) => (
                                <tr key={index} className="border-b border-white/5 hover:bg-white/5">
                                  <td className="py-3 text-sm text-white break-all max-w-[300px]">{record.hostname}</td>
                                  <td className="py-3 text-sm text-white">{record.type}</td>
                                  <td className="py-3 text-sm text-white">{record.first}</td>
                                  <td className="py-3 text-sm text-white">{record.last}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        
                        {/* Pagination Controls */}
                        {otxResults.passive_dns.length > PASSIVE_DNS_PAGE_SIZE && (
                          <div className="flex justify-between items-center mt-4 border-t border-white/5 pt-4">
                            <button
                              onClick={() => setPassiveDnsPage(p => Math.max(1, p - 1))}
                              disabled={passiveDnsPage === 1}
                              className="px-3 py-1 text-xs font-bold rounded bg-white/5 text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              上一页
                            </button>
                            <span className="text-xs text-gray-500 font-medium">
                              第 {passiveDnsPage} 页 / 共 {Math.ceil(otxResults.passive_dns.length / PASSIVE_DNS_PAGE_SIZE)} 页
                            </span>
                            <button
                              onClick={() => setPassiveDnsPage(p => Math.min(Math.ceil(otxResults.passive_dns.length / PASSIVE_DNS_PAGE_SIZE), p + 1))}
                              disabled={passiveDnsPage >= Math.ceil(otxResults.passive_dns.length / PASSIVE_DNS_PAGE_SIZE)}
                              className="px-3 py-1 text-xs font-bold rounded bg-white/5 text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              下一页
                            </button>
                          </div>
                        )}
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
                        <h3 className="text-lg font-bold text-white mb-4">WHOIS信息</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">注册商</p>
                            <p className="text-sm font-bold text-white">{otxResults.whois.registrar || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">注册日期</p>
                            <p className="text-sm font-bold text-white">{otxResults.whois.creation_date || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">到期日期</p>
                            <p className="text-sm font-bold text-white">{otxResults.whois.expiration_date || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">更新日期</p>
                            <p className="text-sm font-bold text-white">{otxResults.whois.updated_date || 'N/A'}</p>
                          </div>
                          <div className="md:col-span-2">
                            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">名称服务器</p>
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
                        <h3 className="text-lg font-bold text-white mb-4">漏洞描述</h3>
                        <div className="prose prose-invert max-w-none">
                          <p className="text-sm text-gray-300 whitespace-pre-wrap">{otxResults.description}</p>
                        </div>
                      </div>
                    )}
                    
                    {/* 相关威胁情报 - CVE查询特有 */}
                    {activeSearchType === 'cve' && otxResults.top_n_pulses && otxResults.top_n_pulses.length > 0 && (
                      <div className="bg-[#25252e] rounded-lg p-6">
                        <h3 className="text-lg font-bold text-white mb-4">相关威胁情报</h3>
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
      </div>
    </div>
  );
};

export default IocSearch;