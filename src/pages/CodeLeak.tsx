import { motion } from 'framer-motion';
import { 
  Code, 
  GitBranch, 
  Shield, 
  Search, 
  AlertTriangle, 
  Lock, 
  FileCode, 
  Eye, 
  Zap 
} from 'lucide-react';

const CodeLeak = () => {
  const features = [
    {
      icon: <GitBranch className="w-8 h-8" />,
      title: '\u4ee3\u7801\u4ed3\u5e93\u76d1\u63a7',
      description: '\u5b9e\u65f6\u76d1\u63a7 GitHub\u3001Gitee\u3001GitLab \u7b49\u4ee3\u7801\u6258\u7ba1\u5e73\u53f0\uff0c\u6355\u83b7\u654f\u611f\u4ee3\u7801\u6cc4\u9732',
      color: 'from-accent/20 to-accent/5'
    },
    {
      icon: <Code className="w-8 h-8" />,
      title: '\u654f\u611f\u4ee3\u7801\u8bc6\u522b',
      description: '\u4f7f\u7528 AI \u7b97\u6cd5\u8bc6\u522b API \u5bc6\u94a5\u3001\u6570\u636e\u5e93\u8fde\u63a5\u3001\u786c\u7f16\u7801\u5bc6\u7801\u7b49\u654f\u611f\u4fe1\u606f',
      color: 'from-accent/20 to-accent/5'
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: '\u6cc4\u9732\u98ce\u9669\u8bc4\u4f30',
      description: '\u8bc4\u4f30\u4ee3\u7801\u6cc4\u9732\u98ce\u9669\u7b49\u7ea7\uff0c\u63d0\u4f9b\u4fee\u590d\u5efa\u8bae\u548c\u5b89\u5168\u52a0\u56fa\u65b9\u6848',
      color: 'from-green-500/20 to-green-500/5'
    },
    {
      icon: <Search className="w-8 h-8" />,
      title: '\u5386\u53f2\u6cc4\u9732\u8ffd\u8e2a',
      description: '\u8ffd\u8e2a\u5386\u53f2\u4ee3\u7801\u6cc4\u9732\u4e8b\u4ef6\uff0c\u5206\u6790\u6cc4\u9732\u8d8b\u52bf\u548c\u653b\u51fb\u6a21\u5f0f',
      color: 'from-orange-500/20 to-orange-500/5'
    }
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#0a0a0c] to-[#1a1a2e] animate-in fade-in duration-700">
      <div className="relative pt-10 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0a0a0c] p-5 shadow-[0_0_100px_rgba(168,85,247,0.05)] backdrop-blur-2xl sm:rounded-[2.5rem] sm:p-8 lg:rounded-[3rem] lg:p-16 xl:p-20">
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.3),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.3),transparent_50%)]"></div>
            </div>

            <div className="relative z-10">
              <div className="mb-12 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_320px] lg:items-start">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8 }}
                  className="text-left"
                >
                  <p className="text-label mb-4 text-accent/80">Repository Surveillance</p>
                  <div className="mb-6 flex items-center gap-4">
                    <div className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/20 to-accent/5 p-4">
                      <Code className="h-12 w-12 text-accent" />
                    </div>
                    <h1 className="text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
                      {'\u654f\u611f\u4ee3\u7801\u6cc4\u9732\u60c5\u62a5'}
                    </h1>
                  </div>
                  <p className="max-w-3xl text-lg text-gray-400 md:text-xl">
                    {'\u5b9e\u65f6\u76d1\u63a7\u4ee3\u7801\u6258\u7ba1\u5e73\u53f0\uff0c\u6355\u83b7\u654f\u611f\u4ee3\u7801\u6cc4\u9732\uff0c\u8bc4\u4f30\u5b89\u5168\u98ce\u9669'}
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.1 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                >
                  <p className="text-label mb-3 text-white/55">{'\u5206\u6790\u89d2\u5ea6'}</p>
                  <div className="space-y-3 text-sm text-gray-300">
                    <p>{'\u4ee5\u4ed3\u5e93\u3001\u654f\u611f\u5b57\u6bb5\u548c\u6cc4\u9732\u4e8a\u4e0b\u6587\u4e3a\u4e3b\u7ebf'}</p>
                    <p>{'\u9002\u5408\u5feb\u901f\u5224\u65ad\u4ee3\u7801\u66b4\u9732\u9762\u548c\u51ed\u636e\u6cc4\u6f0f'}</p>
                    <p>{'\u5f3a\u8c03\u6e90\u7801\u7ecf\u8fc7\u4e0e\u4fee\u590d\u4f18\u5148\u7ea7'}</p>
                  </div>
                </motion.div>
              </div>

              <div className="mb-10 grid grid-cols-1 gap-4 md:mb-12 md:grid-cols-2 md:gap-6">
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
                className="bg-gradient-to-r from-accent/10 to-accent/10 border border-white/10 rounded-2xl p-8"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-3 bg-yellow-500/20 rounded-xl border border-yellow-500/30">
                    <AlertTriangle className="w-6 h-6 text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-2">{'\u6838\u5fc3\u529f\u80fd'}</h3>
                    <ul className="space-y-2 text-sm text-gray-300">
                      <li className="flex items-start gap-2">
                        <Lock className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                        <span>{'\u5b9e\u65f6\u76d1\u63a7 GitHub\u3001Gitee\u3001GitLab \u7b49\u4ee3\u7801\u6258\u7ba1\u5e73\u53f0'}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Eye className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                        <span>{'AI \u7b97\u6cd5\u8bc6\u522b API \u5bc6\u94a5\u3001\u6570\u636e\u5e93\u8fde\u63a5\u3001\u786c\u7f16\u7801\u5bc6\u7801'}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <FileCode className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                        <span>{'\u8bc4\u4f30\u4ee3\u7801\u6cc4\u9732\u98ce\u9669\u7b49\u7ea7\uff0c\u63d0\u4f9b\u4fee\u590d\u5efa\u8bae'}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Zap className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                        <span>{'\u8ffd\u8e2a\u5386\u53f2\u4ee3\u7801\u6cc4\u9732\u4e8b\u4ef6\uff0c\u5206\u6790\u653b\u51fb\u6a21\u5f0f'}</span>
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
                <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-3 sm:px-6">
                  <div className="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
                  <span className="text-sm text-gray-300">{'\u529f\u80fd\u5f00\u53d1\u4e2d\uff0c\u656c\u8bf7\u671f\u5f85'}</span>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodeLeak;
