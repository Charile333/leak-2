import { motion } from 'framer-motion';
import { 
  FileText, 
  Shield, 
  Database, 
  Search, 
  AlertTriangle, 
  Lock, 
  Eye, 
  Zap 
} from 'lucide-react';

const FileLeak = () => {
  const features = [
    {
      icon: <FileText className="w-8 h-8" />,
      title: '文件泄露监控',
      description: '实时监控网盘、文档分享平台，捕获敏感文件泄露事件',
      color: 'from-green-500/20 to-green-500/5'
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: '敏感文件识别',
      description: '使用AI算法识别机密文档、财务报表、合同文件等敏感信息',
      color: 'from-blue-500/20 to-blue-500/5'
    },
    {
      icon: <Database className="w-8 h-8" />,
      title: '泄露风险评估',
      description: '评估文件泄露风险等级，提供修复建议和安全加固方案',
      color: 'from-accent/20 to-accent/5'
    },
    {
      icon: <Search className="w-8 h-8" />,
      title: '历史泄露追踪',
      description: '追踪历史文件泄露事件，分析泄露趋势和攻击模式',
      color: 'from-orange-500/20 to-orange-500/5'
    }
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#0a0a0c] to-[#1a1a2e] animate-in fade-in duration-700">
      <div className="relative pt-10 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[50px] border border-white/10 bg-[#0a0a0c] backdrop-blur-2xl p-16 lg:p-24 shadow-[0_0_100px_rgba(56,189,248,0.05)]">
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.3),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.3),transparent_50%)]"></div>
            </div>

            <div className="relative z-10">
              <div className="text-center mb-12">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8 }}
                >
                  <div className="flex items-center justify-center gap-4 mb-6">
                    <div className="p-4 bg-gradient-to-br from-green-500/20 to-green-500/5 rounded-2xl border border-green-500/30">
                      <FileText className="w-12 h-12 text-green-400" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold text-white">
                      敏感文件泄露情报
                    </h1>
                  </div>
                  <p className="text-lg md:text-xl text-gray-400 max-w-3xl mx-auto">
                    实时监控文档分享平台，捕获敏感文件泄露，评估安全风险
                  </p>
                </motion.div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                {features.map((feature, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className="bg-gradient-to-br bg-white/[0.03] border border-white/10 rounded-2xl p-6 hover:bg-white/[0.05] transition-all group"
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <div className={`p-3 bg-gradient-to-br ${feature.color} rounded-xl border border-white/10 group-hover:scale-110 transition-transform`}>
                        {feature.icon}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                        <p className="text-sm text-gray-400 leading-relaxed">{feature.description}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-white/10 rounded-2xl p-8"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-3 bg-yellow-500/20 rounded-xl border border-yellow-500/30">
                    <AlertTriangle className="w-6 h-6 text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-2">核心功能</h3>
                    <ul className="space-y-2 text-sm text-gray-300">
                      <li className="flex items-start gap-2">
                        <Lock className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                        <span>实时监控网盘、文档分享平台</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Eye className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                        <span>AI算法识别机密文档、财务报表、合同文件</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Shield className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                        <span>评估文件泄露风险等级，提供修复建议</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Zap className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                        <span>追踪历史文件泄露事件，分析攻击模式</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.6 }}
                className="text-center"
              >
                <div className="inline-flex items-center gap-2 px-6 py-3 bg-accent/10 border border-accent/30 rounded-full">
                  <div className="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
                  <span className="text-sm text-gray-300">功能开发中，敬请期待</span>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileLeak;
