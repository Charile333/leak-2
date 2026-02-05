import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map as MapIcon, Database, Zap } from 'lucide-react';

// 复用 LandingSections 中的数据，并扩充以适应叠卡效果
const originalData = [
  {
    id: 1,
    title: "全源情报捕获",
    keyData: "覆盖 87 国 / 368 个威胁节点",
    subData: "支持 12 种语言",
    desc: "暗网、代码库、黑产渠道全链路覆盖，无死角捕获威胁情报",
    icon: MapIcon,
    image: "/card/card-1.png", // Added image path
    color: "from-accent to-cyan-600",
    details: [
      "需覆盖暗网Tor/12P网络、35+主流代码平台、黑产Telegram/Discord社群，钓鱼插件等立体监测面建立包含数据特征指纹、交易模式画像、攻击者身份图谱的多维情报仓库，",
    ]
  },
  {
    id: 2,
    title: "智能风险决策",
    keyData: "6.8 万实体节点威胁知识图谱",
    subData: "12 种 AI 模型协同",
    desc: "融合图神经网络与动态本体建模，实现从数据碎片到攻击画像的链式追溯",
    icon: Database,
    image: "/card/card-2.png", // Added image path
    color: "from-blue-500 to-cyan-600",
    details: [
      "建立3200万节点企业数字资产关系网，实现「0.5%数据碎片→完整业务系统→APT组织画像」的链式追溯；自研NLP框架可解析黑市暗语47类变体（如用「蔬菜包」指代用户信息、「钢板价」隐喻商业秘密交易",
    ]
  },
  {
    id: 3,
    title: "闭环处置支撑",
    keyData: "7×24 小时线上专家值守",
    subData: "48 小时闭环处置",
    desc: "线上实时指导 + 线下应急支援，重大事件快速响应，拒绝延迟",
    icon: Zap,
    image: "/card/card-3.png", // Added image path
    color: "from-orange-500 to-red-600",
    details: [
      "提供月度报告以及年度报告，线上咨询，给予事件闭环支撑",
      "减缓外泄行为带来的负面影响，弥补安全能力的短板"
    ]
  }
];

// 生成5张卡片的数据
// 顺序要求：1:全源情报捕获，2：智能风险决策，3：闭环处置支撑
// 堆叠逻辑：数组最后一个元素在最上面。
// 期望点击顺序：Card 1 -> Card 2 -> Card 3 -> Card 1 ...
// 初始状态：Card 1 在最上面。
// 点击一次后：Card 2 在最上面。
// 倒推数组结构：[Card 2, Card 1, Card 3, Card 2, Card 1]
const initialCards = [
  { ...originalData[1], id: 2 }, // Bottom
  { ...originalData[0], id: 1 },
  { ...originalData[2], id: 3 },
  { ...originalData[1], id: 2 },
  { ...originalData[0], id: 1 }, // Top (First shown)
];

export const FlipCardStack: React.FC = () => {
  const [cards, setCards] = useState(initialCards);

  const moveCard = () => {
    setCards((currentCards) => {
      const newCards = [...currentCards];
      const lastCard = newCards.pop(); // 移除最上面的卡片
      if (lastCard) {
        // 给重新插入到底部的卡片一个新的 ID
        const newCard = { ...lastCard, id: lastCard.id };
        newCards.unshift(newCard); // 放到最底部
      }
      return newCards;
    });
  };

  // 获取当前最上面的卡片（数组最后一个）
  const topCard = cards[cards.length - 1];

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 md:gap-16 px-4 pt-20">
      {/* 左侧：卡片堆叠区域 */}
      <div className="relative h-[550px] w-full md:w-1/2 flex items-center perspective-1000">
        <div 
          className="relative w-[380px] h-[520px] cursor-pointer mx-auto md:mx-0" 
          onClick={moveCard}
        >
          <AnimatePresence mode='popLayout'>
            {cards.map((card, index) => {
              // 计算偏移量：完全复刻 CSS 的 nth-child 逻辑
              // CSS: 
              // 5 (top): left: 0, top: 0
              // 4: left: 20px, top: -20px
              // 3: left: 40px, top: -40px
              // ...
              
              // 在我们的数组中，index 越大越靠后渲染（在上面），所以：
              // index = length - 1 (Top card) -> offset 0
              // index = length - 2 -> offset 1
              
              const offsetStep = cards.length - 1 - index;
              const xOffset = offsetStep * 20; // 20px per step
              const yOffset = -offsetStep * 20; // -20px per step
              
              // 样式调整：复刻 demo 的层级关系
              const brightness = 1; 

              // 针对最上面的卡片（offsetIndex === 0）使用特殊的渐变样式
              const isTopCard = offsetStep === 0;
              const bgGradient = isTopCard 
                ? `linear-gradient(135deg, rgba(30,30,35,0.95), rgba(10,10,15,0.98))` 
                : `linear-gradient(135deg, rgba(20,20,20,0.9), rgba(40,40,40,0.95))`;
              
              const borderStyle = isTopCard ? 'border-accent/30' : 'border-white/10';

              return (
                <motion.div
                  key={`${card.id}-${index}`}
                  layoutId={`${card.id}-${index}`} // 使用 layoutId 实现位置交换的平滑过渡
                  initial={{ 
                    y: 40,  // GSAP: yPercent: 20
                    opacity: 0,
                    scale: 1,
                    x: 0,
                  }}
                  animate={{
                    x: xOffset,
                    y: yOffset,
                    scale: 1, // GSAP demo 不缩放
                    zIndex: index,
                    opacity: 1,
                    filter: `brightness(${brightness})`,
                  }}
                  exit={{
                    x: -19, // GSAP: xPercent: -5 (approx 5% of 380px)
                    y: 26,  // GSAP: yPercent: 5 (approx 5% of 520px)
                    opacity: 0,
                    transition: { 
                      duration: 0.3, 
                      ease: "easeOut"
                    }
                  }}
                  transition={{
                    layout: { duration: 0.4, ease: "easeInOut" }, // 这里的 easeInOut 对应 GSAP 的 sine.inOut
                    opacity: { duration: 0.3, ease: "easeOut" } // 单独控制透明度动画
                  }}
                  className={`absolute top-0 left-0 w-full h-full rounded-2xl ${card.image ? '' : 'p-6 border'} flex flex-col justify-between ${card.image ? '' : borderStyle} shadow-2xl backdrop-blur-md overflow-hidden`}
                  style={{
                    background: card.image ? 'transparent' : bgGradient,
                    transformOrigin: "bottom left"
                  }}
                >
                  {card.image ? (
                    <img 
                      src={card.image} 
                      alt={card.title} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      {/* 装饰背景 */}
                      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${card.color} opacity-20 blur-[40px] rounded-full -mr-10 -mt-10`} />
                      
                      <div className="relative z-10 flex flex-col items-center justify-center h-full">
                        <div className="absolute top-6 left-0 w-full flex justify-center">
                          <h3 className="text-xl font-bold text-white mb-2 text-center tracking-wider">{card.title}</h3>
                        </div>
                        
                        <div className={`w-full flex items-center justify-center mb-6 relative group`}>
                           <span className="text-[10rem] font-black text-white/90 font-mono tracking-tighter leading-none" style={{ textShadow: '0 4px 30px rgba(0,0,0,0.5)' }}>
                              0{card.id}
                            </span>
                        </div>
                      </div>
                      
                      {/* 底部装饰条 */}
                      <div className={`absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r ${card.color} opacity-50`} />
                    </>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
          
          {/* 指示文字 */}
          <div className="absolute -bottom-16 left-0 w-full text-center text-white/30 text-sm animate-pulse">
            点击卡片切换视图
          </div>
        </div>
      </div>

      {/* 右侧：内容展示区域 */}
      <div className="w-full md:w-1/2 h-[500px] flex flex-col justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${topCard.id}-${topCard.title}`} // Use title as key to trigger animation on change
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
          >
            <div>
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r ${topCard.color} bg-opacity-20 border border-white/10 mb-4`}>
                <topCard.icon className="w-4 h-4 text-white" />
                <span className="text-xs font-medium text-white/90">核心能力</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                {topCard.title}
              </h2>
              <p className="text-lg text-white/60 leading-relaxed">
                {topCard.desc}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-sm text-white/40 mb-1">关键指标</div>
                <div className="text-lg font-semibold text-white">{topCard.keyData}</div>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-sm text-white/40 mb-1">技术支撑</div>
                <div className="text-lg font-semibold text-white">{topCard.subData}</div>
              </div>
            </div>

            <div className="space-y-4">
              {topCard.details.map((detail, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full mt-2 bg-gradient-to-r ${topCard.color}`} />
                  <p className="text-sm text-white/70 leading-relaxed">{detail}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
