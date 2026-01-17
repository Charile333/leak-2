import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Original images from the demo (now local)
const baseData = [
  { id: '1', src: "/card/card-1.png", title: "全源情报捕获" },
  { id: '2', src: "/card/card-2.png", title: "智能风险决策" },
  { id: '3', src: "/card/card-3.png", title: "闭环处理支撑" },
];

// Construct a 5-card array for stacking effect, cycling through baseData
// Order bottom to top: 2, 3, 1, 2, 3? No, we want Top to be 1.
// Stack: [..., 3, 2, 1] (Top)
// Let's use: 2, 1, 3, 2, 1 (Top)
const originalImages = [
  { ...baseData[1], id: 'img-2-bottom' },
  { ...baseData[0], id: 'img-1-bottom' },
  { ...baseData[2], id: 'img-3-middle' },
  { ...baseData[1], id: 'img-2-top' },
  { ...baseData[0], id: 'img-1-top' },
];

export const FlipCardOriginal: React.FC = () => {
  const [cards, setCards] = useState(originalImages);

  const moveCard = () => {
    setCards((currentCards) => {
      const newCards = [...currentCards];
      const lastCard = newCards.pop();
      if (lastCard) {
        // Generate new ID to trigger enter animation
        // We need to maintain the cycling logic of content.
        // If we popped 1, next is 2. The popped 1 should go to bottom.
        // But simply moving to bottom works because the array is cyclic.
        
        const newCard = { ...lastCard, id: `img-${Date.now()}` };
        newCards.unshift(newCard);
      }
      return newCards;
    });
  };

  // 获取当前最上面的卡片（数组最后一个）
  const topCard = cards[cards.length - 1];

  return (
    <div className="relative w-full h-[500px] flex items-center justify-between perspective-100 max-w-6xl mx-auto px-4">
      {/* 左侧：卡片区域 */}
      <div 
        className="relative w-[300px] h-[200px] cursor-pointer" 
        onClick={moveCard}
        style={{
            transform: 'translateX(0%)' 
        }}
      >
        <AnimatePresence mode='popLayout'>
          {cards.map((card, index) => {
            // CSS Logic Replication:
            // .item:nth-child(5) { left: 0; top: 0; } -> Top card (Last in DOM/Array)
            // .item:nth-child(4) { left: 20px; top: -20px; }
            // ...
            
            // In our array, the last element (index = length-1) is the top card.
            const offsetStep = cards.length - 1 - index;
            
            // CSS: left increases by 20px, top decreases by 20px (moves up)
            // But wait, the demo CSS:
            // nth-child(5) (Top): 0, 0
            // nth-child(4) (Below): left 20px, top -20px
            // nth-child(1) (Bottom): left 80px, top -80px
            
            const xOffset = offsetStep * 20; 
            const yOffset = -offsetStep * 20;

            return (
              <motion.img
                key={card.id}
                layoutId={card.id}
                src={card.src}
                alt=""
                initial={{ 
                  y: 60, // approx 20% of 300px or relative container
                  opacity: 0 
                }}
                animate={{
                  x: xOffset,
                  y: yOffset,
                  scale: 1,
                  zIndex: index,
                  opacity: 1,
                }}
                exit={{
                  x: -15, // -5% of 300px
                  y: 10,  // 5% of 200px? (Demo aspect ratio is 2/3, so height ~450px?)
                          // Wait, .slider is 300x200. .item is width 300, aspect-ratio 2/3.
                          // So item height is 450px.
                          // 5% of 450 is ~22.5px.
                  opacity: 0,
                  transition: { duration: 0.3, ease: "easeOut" }
                }}
                transition={{
                  layout: { duration: 0.4, ease: "easeInOut" },
                  opacity: { duration: 0.3, ease: "easeOut" }
                }}
                className="absolute shadow-xl object-cover rounded-lg"
                style={{
                  width: '300px',
                  aspectRatio: '2/3',
                  transformOrigin: "bottom left",
                  left: 0,
                  top: 0,
                  // The CSS sets position absolute.
                  // We simulate the stacking context.
                }}
              />
            );
          })}
        </AnimatePresence>
        
        {/* Button simulation */}
        <div className="absolute -bottom-60 left-1/2 -translate-x-1/2 text-white/50 text-sm animate-pulse">
            Click to Flip
        </div>
      </div>

      {/* 右侧：标题区域 */}
      <div className="flex-1 flex items-center justify-end pl-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={topCard.title} // Use title to trigger animation
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="text-right"
          >
            <h2 className="text-5xl md:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/50 leading-tight">
              {topCard.title}
            </h2>
            <div className="w-24 h-2 bg-accent mt-6 ml-auto rounded-full" />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
