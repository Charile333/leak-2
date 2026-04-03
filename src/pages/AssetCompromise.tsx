import { motion } from 'framer-motion';
import { 
  Shield, 
  AlertTriangle, 
  Database, 
  Activity, 
  Lock, 
  Eye, 
  Zap,
  User,
  Globe
} from 'lucide-react';

const AssetCompromise = () => {
  const features = [
    {
      icon: <Shield className="w-8 h-8" />,
      title: '\u8d44\u4ea7\u5931\u9677\u76d1\u6d4b',
      description: '\u5b9e\u65f6\u76d1\u63a7\u4f01\u4e1a\u57df\u540d\u3001IP\u3001\u90ae\u7bb1\u7b49\u8d44\u4ea7\u7684\u6cc4\u9732\u60c5\u51b5\uff0c\u53ca\u65f6\u53d1\u73b0\u5b89\u5168\u5a01\u80c1',
      color: 'from-red-500/20 to-red-500/5'
    },
    {
      icon: <Database className="w-8 h-8" />,
      title: '\u8d26\u5bc6\u6cc4\u9732\u8ffd\u8e2a',
      description: '\u8ffd\u8e2a\u4f01\u4e1a\u5458\u5de5\u3001\u5ba2\u6237\u8d26\u53f7\u5bc6\u7801\u6cc4\u9732\u4e8b\u4ef6\uff0c\u8bc4\u4f30\u6cc4\u9732\u98ce\u9669\u7b49\u7ea7',
      color: 'from-accent/20 to-accent/5'
    },
    {
      icon: <Activity className="w-8 h-8" />,
      title: '\u5931\u9677\u98ce\u9669\u8bc4\u4f30',
      description: '\u8bc4\u4f30\u8d44\u4ea7\u5931\u9677\u98ce\u9669\u7b49\u7ea7\uff0c\u63d0\u4f9b\u4fee\u590d\u5efa\u8bae\u548c\u5b89\u5168\u52a0\u56fa\u65b9\u6848',
      color: 'from-accent/20 to-accent/5'
    },
    {
      icon: <User className="w-8 h-8" />,
      title: '\u5386\u53f2\u4e8b\u4ef6\u8ffd\u8e2a',
      description: '\u8ffd\u8e2a\u5386\u53f2\u8d44\u4ea7\u5931\u9677\u4e8b\u4ef6\uff0c\u5206\u6790\u6cc4\u9732\u8d8b\u52bf\u548c\u653b\u51fb\u6a21\u5f0f',
      color: 'from-green-500/20 to-green-500/5'
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
                  <p className="text-label mb-4 text-red-300/80">Exposure Monitoring</p>
                  <div className="mb-6 flex items-center gap-4">
                    <div className="rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-500/20 to-red-500/5 p-4">
                      <Shield className="h-12 w-12 text-red-400" />
                    </div>
                    <h1 className="text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
                      {'\u8d44\u4ea7\u8d26\u5bc6\u5931\u9677\u76d1\u6d4b'}
                    </h1>
                  </div>
                  <p className="max-w-3xl text-lg text-gray-400 md:text-xl">
                    {'\u5b9e\u65f6\u76d1\u63a7\u4f01\u4e1a\u8d44\u4ea7\u6cc4\u9732\u60c5\u51b5\uff0c\u53ca\u65f6\u53d1\u73b0\u5b89\u5168\u5a01\u80c1\uff0c\u8bc4\u4f30\u98ce\u9669\u7b49\u7ea7'}
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.1 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                >
                  <p className="text-label mb-3 text-white/55">{'\u89c2\u5bdf\u91cd\u70b9'}</p>
                  <div className="space-y-3 text-sm text-gray-300">
                    <p>{'\u57df\u540d\u3001IP\u3001\u90ae\u7bb1\u548c\u51ed\u636e\u7ef4\u5ea6\u8054\u52a8\u76d1\u63a7'}</p>
                    <p>{'\u6309\u5931\u9677\u4e8b\u4ef6\u3001\u8d26\u53f7\u548c\u66b4\u9732\u8def\u5f84\u7ec4\u7ec7\u544a\u8b66'}</p>
                    <p>{'\u9002\u5408\u505a\u4e3a\u4f01\u4e1a\u5916\u90e8\u66b4\u9732\u9762\u68c0\u89c6\u56fe'}</p>
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
                className="bg-gradient-to-r from-red-500/10 to-accent/10 border border-white/10 rounded-2xl p-8"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-3 bg-yellow-500/20 rounded-xl border border-yellow-500/30">
                    <AlertTriangle className="w-6 h-6 text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-2">{'\u6838\u5fc3\u529f\u80fd'}</h3>
                    <ul className="space-y-2 text-sm text-gray-300">
                      <li className="flex items-start gap-2">
                        <Lock className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                        <span>{'\u5b9e\u65f6\u76d1\u63a7\u4f01\u4e1a\u57df\u540d\u3001IP\u3001\u90ae\u7bb1\u7b49\u8d44\u4ea7'}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Eye className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                        <span>{'\u8ffd\u8e2a\u4f01\u4e1a\u5458\u5de5\u3001\u5ba2\u6237\u8d26\u53f7\u6cc4\u9732\u4e8b\u4ef6'}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Globe className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                        <span>{'\u8bc4\u4f30\u8d44\u4ea7\u5931\u9677\u98ce\u9669\u7b49\u7ea7\uff0c\u63d0\u4f9b\u4fee\u590d\u5efa\u8bae'}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Zap className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                        <span>{'\u8ffd\u8e2a\u5386\u53f2\u8d44\u4ea7\u5931\u9677\u4e8b\u4ef6\uff0c\u5206\u6790\u653b\u51fb\u6a21\u5f0f'}</span>
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

export default AssetCompromise;
