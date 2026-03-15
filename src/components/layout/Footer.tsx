import React from 'react';
import { motion } from 'framer-motion';
import { 
  ShieldCheck, 
  Globe
} from 'lucide-react';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  const footerLinks = {
    product: [
      { name: '暗网监控', href: '#' },
      { name: '泄露感知', href: '#' },
      { name: '实时推送', href: '#' },
    ],
    // resources: [
    //   ...
    // ],
    company: [
      { name: '关于我们', href: '#' },
      { name: '隐私政策', href: '#' },
      { name: '服务条款', href: '#' },
    ]
  };

  return (
    <footer className="w-full h-full bg-[#050505] text-gray-300 relative overflow-hidden flex flex-col">
      {/* 背景装饰 */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.05),transparent_40%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 pointer-events-none mix-blend-overlay" />
      
      {/* 主要内容区域 */}
      <div className="container mx-auto px-6 py-8 flex-grow flex flex-col justify-center relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-8 mb-4">
          
          {/* 品牌区域 - 占4列 */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <img src="/Lysir-w.png" alt="Lysir Logo" className="h-8 w-auto opacity-90" />
            </div>
            <p className="text-gray-400 leading-relaxed max-w-sm text-sm">
              谍卫 (Lysir) 是新一代暗网情报与泄露监测平台，利用 AI 技术实时感知全球网络威胁，为企业构建主动防御的安全穹顶。
            </p>
          </div>

          {/* 链接区域 - 占6列，靠右对齐 */}
          <div className="lg:col-span-6 lg:col-start-7 grid grid-cols-2 gap-8 lg:gap-12">
            
            {/* 产品列 */}
            <div className="space-y-4">
              <h3 className="text-white font-semibold tracking-wide text-sm uppercase flex items-center gap-2">
                <ShieldCheck size={16} className="text-accent" />
                产品服务
              </h3>
              <ul className="space-y-3">
                {footerLinks.product.map((link) => (
                  <li key={link.name}>
                    <a href={link.href} className="text-sm text-gray-400 hover:text-accent transition-colors flex items-center gap-1 group">
                      <span className="w-0 group-hover:w-1 h-1 bg-accent rounded-full transition-all duration-300 mr-0 group-hover:mr-2 opacity-0 group-hover:opacity-100" />
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* 公司列 */}
            <div className="space-y-4">
              <h3 className="text-white font-semibold tracking-wide text-sm uppercase flex items-center gap-2">
                <Globe size={16} className="text-accent" />
                关于我们
              </h3>
              <ul className="space-y-3 mb-4">
                {footerLinks.company.map((link) => (
                  <li key={link.name}>
                    <a href={link.href} className="text-sm text-gray-400 hover:text-accent transition-colors flex items-center gap-1 group">
                       <span className="w-0 group-hover:w-1 h-1 bg-accent rounded-full transition-all duration-300 mr-0 group-hover:mr-2 opacity-0 group-hover:opacity-100" />
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* 订阅简报 - 已移除 */}
        {/* <div className="border-t border-white/10 pt-12 pb-8">...</div> */}
      </div>

      {/* 底部版权 */}
      <div className="border-t border-white/5 bg-black/20 backdrop-blur-sm relative z-10">
        <div className="container mx-auto px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-gray-500 font-mono">
            © {currentYear} Lysir Security Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                System Operational
            </span>
            <div className="flex items-center gap-4 text-xs text-gray-500">
                <a href="#" className="hover:text-gray-300 transition-colors">隐私政策</a>
                <a href="#" className="hover:text-gray-300 transition-colors">服务条款</a>
                <a href="#" className="hover:text-gray-300 transition-colors">Cookie设置</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
