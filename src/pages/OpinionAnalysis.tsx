import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';

const OpinionAnalysis = () => {
  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white p-8">
      {/* 功能完善中横幅 */}
      <div className="w-full bg-yellow-500/20 border-b border-yellow-500/40 p-4 text-center mb-8 rounded-xl">
        <p className="text-yellow-400 font-bold text-lg">功能完善中 (Function Under Construction)</p>
        <p className="text-yellow-400/70 text-sm mt-1">互联网舆情AI分析功能正在紧张开发中，敬请期待</p>
      </div>

      <div className="max-w-7xl mx-auto space-y-8 flex flex-col items-center justify-center min-h-[60vh]">
        {/* Header */}
        <div className="flex flex-col items-center justify-center gap-6 text-center">
          <div className="p-6 bg-purple-500/20 rounded-3xl border border-purple-500/30 animate-pulse">
            <Bot className="w-16 h-16 text-purple-400" />
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-400 mb-4">
              Internet Opinion Intelligence
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl">
              Real-time trend monitoring and AI-powered sentiment analysis coming soon.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpinionAnalysis;