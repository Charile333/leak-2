import { motion } from 'framer-motion';
import {
  Construction,
  Server,
  Database,
  Cpu,
} from 'lucide-react';

const OpinionAI = () => {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0a0a0c] p-6 text-white">
      <div className="absolute inset-0 z-0">
        <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-accent/10 blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-accent/10 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-2xl text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="rounded-3xl border border-white/10 bg-[#1a1a20]/80 p-12 shadow-2xl backdrop-blur-xl"
        >
          <div className="relative mx-auto mb-8 h-24 w-24">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full border-4 border-dashed border-white/20"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-2 rounded-full border-4 border-dashed border-white/10"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <Construction className="h-10 w-10 text-yellow-500" />
            </div>
          </div>

          <h1 className="mb-6 bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-4xl font-bold text-transparent">
            {'AI \u7814\u5224\u52a9\u624b\u5efa\u8bbe\u4e2d'}
          </h1>

          <p className="mb-8 text-lg leading-relaxed text-gray-400">
            {'\u8fd9\u91cc\u5c06\u63a5\u5165 AI \u7814\u5224\u80fd\u529b\uff0c\u5e2e\u52a9\u5b89\u5168\u56e2\u961f\u5bf9\u6cc4\u9732\u4e8b\u4ef6\u3001\u6697\u7f51\u8d34\u5b50\u3001IOC \u7ed3\u679c\u548c\u8206\u60c5\u5185\u5bb9\u8fdb\u884c\u5f52\u7eb3\u603b\u7ed3\u3001\u98ce\u9669\u5224\u8bfb\u4e0e\u5904\u7f6e\u5efa\u8bae\u751f\u6210\u3002'}
          </p>

          <div className="mb-8 grid grid-cols-3 gap-4">
            <div className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/5 p-4">
              <Server className="h-5 w-5 text-accent" />
              <span className="text-xs text-gray-500">{'\u68c0\u7d22\u7ba1\u7ebf'}</span>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-full bg-accent/50" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/5 p-4">
              <Database className="h-5 w-5 text-green-400" />
              <span className="text-xs text-gray-500">{'\u7ed3\u6784\u5316\u5165\u5e93'}</span>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-full bg-green-500/50" />
              </div>
            </div>
            <div className="relative flex flex-col items-center gap-2 overflow-hidden rounded-xl border border-white/5 bg-white/5 p-4">
              <div className="absolute inset-0 bg-yellow-500/5" />
              <Cpu className="h-5 w-5 text-yellow-400" />
              <span className="text-xs text-yellow-500/80">{'AI \u7814\u5224\u6a21\u578b'}</span>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-3/5 bg-yellow-500" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default OpinionAI;
