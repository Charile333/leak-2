import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Original images from the demo
const originalImages = [
  { id: 'img-1', src: "https://assets.codepen.io/16327/portrait-number-1.png" },
  { id: 'img-2', src: "https://assets.codepen.io/16327/portrait-number-2.png" },
  { id: 'img-3', src: "https://assets.codepen.io/16327/portrait-number-3.png" },
  { id: 'img-4', src: "https://assets.codepen.io/16327/portrait-number-4.png" },
  { id: 'img-5', src: "https://assets.codepen.io/16327/portrait-number-5.png" }
].reverse();

export const FlipCardOriginal: React.FC = () => {
  const [cards, setCards] = useState(originalImages);

  const moveCard = () => {
    setCards((currentCards) => {
      const newCards = [...currentCards];
      const lastCard = newCards.pop();
      if (lastCard) {
        // Generate new ID to trigger enter animation
        const newCard = { ...lastCard, id: `img-${Date.now()}` };
        newCards.unshift(newCard);
      }
      return newCards;
    });
  };

  return (
    <div className="relative w-full h-[500px] flex items-center justify-center perspective-100">
      <div 
        className="relative w-[300px] h-[200px] cursor-pointer" 
        onClick={moveCard}
        style={{
            // Matches .slider top: 30vh logic visually within the section
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
    </div>
  );
};
