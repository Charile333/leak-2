import { motion } from 'framer-motion';
import {
  Construction,
  Shield,
  Radio,
  Globe,
} from 'lucide-react';

const Activity = () => {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0a0a0c] p-6 text-white">
      <div className="absolute inset-0 z-0">
        <div className="absolute right-1/4 top-1/4 h-96 w-96 rounded-full bg-red-500/10 blur-[100px]" />
        <div className="absolute bottom-1/4 left-1/4 h-96 w-96 rounded-full bg-accent/10 blur-[100px]" />
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
              <Construction className="h-10 w-10 text-accent" />
            </div>
          </div>

          <h1 className="mb-6 bg-gradient-to-r from-accent to-pink-400 bg-clip-text text-4xl font-bold text-transparent">
            {'\u6d3b\u52a8\u8ffd\u8e2a\u529f\u80fd\u5efa\u8bbe\u4e2d'}
          </h1>

          <p className="mb-8 text-lg leading-relaxed text-gray-400">
            {'\u8fd9\u91cc\u5c06\u7528\u4e8e\u8ffd\u8e2a IOC \u5173\u8054\u7684\u8de8\u6e90\u6d3b\u52a8\u8f68\u8ff9\uff0c\u5305\u62ec OTX\u3001VirusTotal \u548c\u5176\u4ed6\u60c5\u62a5\u6e90\u7684\u65f6\u95f4\u7ebf\u3001\u5173\u8054\u8282\u70b9\u4e0e\u4e8b\u4ef6\u8109\u7edc\u3002'}
          </p>

          <div className="mb-8 grid grid-cols-3 gap-4">
            <div className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/5 p-4">
              <Globe className="h-5 w-5 text-accent" />
              <span className="text-xs text-gray-500">{'\u5168\u5c40\u8282\u70b9'}</span>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-full bg-accent/50" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/5 p-4">
              <Radio className="h-5 w-5 text-red-400" />
              <span className="text-xs text-gray-500">{'\u5b9e\u65f6\u6d41\u63a5\u5165'}</span>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-full bg-red-500/50" />
              </div>
            </div>
            <div className="relative flex flex-col items-center gap-2 overflow-hidden rounded-xl border border-white/5 bg-white/5 p-4">
              <div className="absolute inset-0 bg-accent/5" />
              <Shield className="h-5 w-5 text-accent" />
              <span className="text-xs text-accent/80">{'\u5173\u8054\u5206\u6790\u5f15\u64ce'}</span>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-3/4 bg-accent" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Activity;
