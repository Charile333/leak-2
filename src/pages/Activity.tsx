import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { otxApi } from '../api/otxApi';
import { Activity as ActivityIcon, AlertCircle, Clock, Globe, Link as LinkIcon, ShieldAlert } from 'lucide-react';

interface PulseActivity {
  id: string;
  action: string;
  pulse: {
    id: string;
    name: string;
    description: string;
    author_name: string;
    modified: string;
  };
  indicator: string;
  indicator_type: string;
  created: string;
}

const Activity = () => {
  const [activities, setActivities] = useState<PulseActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchActivity = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await otxApi.getActivity();
      setActivities(response?.activity || []);
    } catch (err: any) {
      setError(err.message || '获取实时威胁流失败');
      console.error('Error fetching activity:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchActivity();
    // 设置定时器，每60秒刷新一次
    const interval = setInterval(() => {
      fetchActivity();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchActivity();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getIndicatorIcon = (type: string) => {
    switch (type) {
      case 'ip':
        return <Globe className="w-5 h-5 text-blue-400" />;
      case 'domain':
        return <LinkIcon className="w-5 h-5 text-purple-400" />;
      case 'url':
        return <LinkIcon className="w-5 h-5 text-green-400" />;
      case 'cve':
        return <ShieldAlert className="w-5 h-5 text-red-400" />;
      default:
        return <AlertCircle className="w-5 h-5 text-yellow-400" />;
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#0a0a0c] to-[#1a1a2e] animate-in fade-in duration-700">
      {/* 页面标题 */}
      <div className="relative pt-10 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[50px] border border-white/10 bg-[#0a0a0c] backdrop-blur-2xl p-16 lg:p-24 shadow-[0_0_100px_rgba(168,85,247,0.1)]">
            {/* 装饰性背景 */}
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.3),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.3),transparent_50%)]"></div>
            </div>

            {/* 标题内容 */}
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold text-white mb-4 flex items-center gap-4">
                  <ActivityIcon className="w-10 h-10 text-purple-500" />
                  实时威胁流
                </h1>
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="bg-accent/80 hover:bg-accent disabled:opacity-50 text-white px-6 py-3 rounded-full transition-all duration-300 flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95"
                >
                  <Clock className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? '刷新中...' : '刷新'}
                </button>
              </div>
              <p className="text-xl text-gray-400 mb-12 max-w-3xl">
                实时获取全球安全社区最新提交的威胁情报，每60秒自动更新。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 活动列表 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading && !refreshing ? (
          <div className="text-center py-20">
            <ActivityIcon className="w-16 h-16 text-purple-500 mx-auto mb-4 animate-spin" />
            <p className="text-gray-400 text-xl">加载实时威胁流中...</p>
          </div>
        ) : error ? (
          <div className="bg-red-500/20 border border-red-500/40 rounded-xl p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-red-400 mb-2">加载失败</h3>
            <p className="text-gray-400 mb-6">{error}</p>
            <button
              onClick={fetchActivity}
              className="bg-red-500/30 hover:bg-red-500/40 text-white px-6 py-3 rounded-full transition-all duration-300"
            >
              重试
            </button>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-20">
            <ActivityIcon className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-400 text-xl">暂无实时威胁流数据</p>
          </div>
        ) : (
          <div className="space-y-6">
            {activities.map((activity, index) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-[#1a1a20] border border-white/5 rounded-xl overflow-hidden shadow-lg hover:shadow-xl hover:border-white/10 transition-all duration-300"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-purple-500/20 p-3 rounded-full">
                        <ActivityIcon className="w-6 h-6 text-purple-400" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">{activity.pulse.name}</h3>
                        <p className="text-gray-400 text-sm">
                          由 <span className="text-purple-400">{activity.pulse.author_name}</span> 更新于 {formatDate(activity.created)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span className="bg-gray-700/50 px-3 py-1 rounded-full">{activity.action}</span>
                      <span className="bg-gray-700/50 px-3 py-1 rounded-full">{activity.indicator_type}</span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-gray-300 mb-4 line-clamp-3">{activity.pulse.description}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {getIndicatorIcon(activity.indicator_type)}
                      <span className="text-white font-medium">{activity.indicator}</span>
                    </div>
                    <div className="ml-auto">
                      <button className="text-purple-400 hover:text-purple-300 text-sm transition-colors duration-200 flex items-center gap-1">
                        查看详情
                        <ActivityIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Activity;