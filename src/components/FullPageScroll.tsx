import React, { useState, useEffect, useRef } from 'react';

// 定义动画类型
type AnimationType = 'fade' | 'slide' | 'scale' | 'none';

// 定义配置选项接口
interface FullPageScrollConfig {
  animationType?: AnimationType;
  animationDuration?: number;
  scrollThreshold?: number;
}

// 定义组件属性接口
interface FullPageScrollProps {
  children: React.ReactNode;
  config?: FullPageScrollConfig;
  className?: string;
}

const FullPageScroll: React.FC<FullPageScrollProps> = ({ 
  children, 
  config = {},
  className = '' 
}) => {
  // 默认配置
  const defaultConfig: Required<FullPageScrollConfig> = {
    animationType: 'slide',
    animationDuration: 600,
    scrollThreshold: 100
  };

  // 合并配置
  const { animationType, animationDuration, scrollThreshold } = {
    ...defaultConfig,
    ...config
  };

  // 状态管理
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('down');

  // 引用
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<HTMLDivElement[]>([]);
  const startYRef = useRef<number>(0);

  // 将子元素转换为数组
  const sections = React.Children.toArray(children);

  // 处理触摸开始事件
  const handleTouchStart = (e: TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
  };

  // 处理触摸结束事件
  const handleTouchEnd = (e: TouchEvent) => {
    if (isAnimating) return;

    const endY = e.changedTouches[0].clientY;
    const deltaY = endY - startYRef.current;

    handleScroll(deltaY);
  };

  // 处理鼠标滚轮事件
  const handleWheel = (e: WheelEvent) => {
    if (isAnimating) return;

    const deltaY = e.deltaY;
    handleScroll(deltaY);
  };

  // 统一处理滚动逻辑
  const handleScroll = (deltaY: number) => {
    // 判断滚动方向
    const direction = deltaY > 0 ? 'down' : 'up';
    
    // 如果动画正在进行，直接返回，避免冲突
    if (isAnimating) return;
    
    setScrollDirection(direction);

    // 检查是否超过阈值
    if (Math.abs(deltaY) < scrollThreshold) return;

    // 计算下一个活动索引
    let nextIndex = activeIndex;
    if (direction === 'down' && activeIndex < sections.length - 1) {
      nextIndex = activeIndex + 1;
    } else if (direction === 'up' && activeIndex > 0) {
      nextIndex = activeIndex - 1;
    }

    // 如果索引没有变化，不执行动画
    if (nextIndex === activeIndex) return;

    // 执行页面切换动画
    setIsAnimating(true);
    // 延迟更新 activeIndex，让旧页面先执行退出动画
    // 注意：这里的 activeIndex 更新时机很重要。
    // 在 React 中，我们需要先设置 isAnimating 为 true，触发渲染，应用 exit/enter 类名
    // 然后在动画结束后，更新 activeIndex 并重置 isAnimating
    
    // 但是，由于我们需要同时渲染两个页面（当前页和下一页），
    // 我们的逻辑是：
    // 1. 设置 isAnimating = true
    // 2. 组件重渲染，getAnimationClass 会根据 activeIndex (当前页) 和 nextIndex (下一页) 返回对应的动画类
    // 3. 动画播放完毕
    // 4. 设置 activeIndex = nextIndex, isAnimating = false
    
    setTimeout(() => {
      setActiveIndex(nextIndex);
      setIsAnimating(false);
    }, animationDuration);
  };

  // 处理键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAnimating) return;

      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        if (activeIndex < sections.length - 1) {
          handleScroll(100); // 模拟向下滚动
        }
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        if (activeIndex > 0) {
          handleScroll(-100); // 模拟向上滚动
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnimating, activeIndex, sections.length]);

  // 添加事件监听器
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 添加触摸事件监听
    container.addEventListener('touchstart', handleTouchStart);
    container.addEventListener('touchend', handleTouchEnd);
    // 添加鼠标滚轮事件监听
    container.addEventListener('wheel', handleWheel, { passive: false });

    // 清理事件监听器
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('wheel', handleWheel);
    };
  }, [isAnimating, activeIndex, sections.length, scrollThreshold, animationDuration]);

  // 获取当前活动的动画类名
  const getAnimationClass = (index: number) => {
    // 如果没有在动画中，只给当前页添加 active
    if (!isAnimating) {
      return index === activeIndex ? 'active' : '';
    }

    // 确定下一页和当前页
    const isNext = index === (scrollDirection === 'down' ? activeIndex + 1 : activeIndex - 1);
    const isCurrent = index === activeIndex;

    if (!isNext && !isCurrent) return '';

    let animationClass = '';
    const duration = `${animationDuration}ms`;

    switch (animationType) {
      case 'fade':
        animationClass = isNext 
          ? `animate-fade-in duration-${duration}` 
          : `animate-fade-out duration-${duration}`;
        break;
      case 'slide':
        // slide-up-in: 下一页从下往上进来 (向下滚动)
        // slide-down-out: 当前页从上往下出去 (向上滚动 - 实际上应该是当前页往下移出)
        // 修正逻辑：
        // 向下滚动 (scrollDirection === 'down'): 当前页上移出 (slide-up-out)，下一页上移入 (slide-up-in)
        // 向上滚动 (scrollDirection === 'up'): 当前页下移出 (slide-down-out)，下一页下移入 (slide-down-in)
        
        if (scrollDirection === 'down') {
             if (isCurrent) animationClass = `animate-slide-up-out duration-${duration}`;
             if (isNext) animationClass = `animate-slide-up-in duration-${duration}`;
        } else {
             if (isCurrent) animationClass = `animate-slide-down-out duration-${duration}`;
             if (isNext) animationClass = `animate-slide-down-in duration-${duration}`;
        }
        break;
      case 'scale':
        animationClass = isNext 
          ? `animate-scale-in duration-${duration}` 
          : `animate-scale-out duration-${duration}`;
        break;
      default:
        animationClass = index === activeIndex ? 'active' : '';
    }

    return animationClass;
  };

  // 内联样式对象，使用正确的 CSSProperties 类型
  const containerStyle: React.CSSProperties = {
    height: '100vh',
    width: '100%',
    scrollBehavior: 'auto'
  };

  const sectionBaseStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    visibility: 'hidden',
    transition: `opacity ${animationDuration}ms ease, visibility ${animationDuration}ms ease`,
    transformOrigin: 'center center'
  };

  const sectionActiveStyle: React.CSSProperties = {
    opacity: 1,
    visibility: 'visible',
    transform: 'translate3d(0, 0, 0) scale(1)'
  };

  return (
    <div 
      ref={containerRef} 
      className={`full-page-scroll overflow-hidden relative ${className}`}
      style={containerStyle}
    >
      {/* CSS 样式通过类名和内联样式结合实现 */}
      <style>{`
        /* 定义所有动画关键帧 */
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }

        @keyframes slideUpIn {
          from { opacity: 0; transform: translateY(100%); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideDownOut {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-100%); }
        }

        @keyframes slideDownIn {
          from { opacity: 0; transform: translateY(-100%); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideUpOut {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(100%); }
        }

        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }

        @keyframes scaleOut {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(1.2); }
        }

        /* 动画类定义 */
        .animate-fade-in {
          opacity: 0;
          visibility: visible;
          animation: fadeIn ${animationDuration}ms ease forwards;
        }

        .animate-fade-out {
          opacity: 1;
          visibility: visible;
          animation: fadeOut ${animationDuration}ms ease forwards;
        }

        .animate-slide-up-in {
          opacity: 0;
          visibility: visible;
          transform: translateY(100%);
          animation: slideUpIn ${animationDuration}ms ease forwards;
        }

        .animate-slide-down-out {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
          animation: slideDownOut ${animationDuration}ms ease forwards;
        }

        .animate-slide-down-in {
          opacity: 0;
          visibility: visible;
          transform: translateY(-100%);
          animation: slideDownIn ${animationDuration}ms ease forwards;
        }

        .animate-slide-up-out {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
          animation: slideUpOut ${animationDuration}ms ease forwards;
        }

        .animate-scale-in {
          opacity: 0;
          visibility: visible;
          transform: scale(0.8);
          animation: scaleIn ${animationDuration}ms ease forwards;
        }

        .animate-scale-out {
          opacity: 1;
          visibility: visible;
          transform: scale(1);
          animation: scaleOut ${animationDuration}ms ease forwards;
        }
      `}</style>

      {sections.map((section, index) => (
        <div
          key={index}
          ref={(el) => {
            sectionsRef.current[index] = el as HTMLDivElement;
          }}
          className={`${getAnimationClass(index)} ${index === activeIndex ? 'active' : ''}`}
          style={{
            ...sectionBaseStyle,
            ...(index === activeIndex ? sectionActiveStyle : {})
          }}
        >
          {section}
        </div>
      ))}

      {/* 指示器 */}
      <div className="absolute right-8 top-1/2 transform -translate-y-1/2 flex flex-col gap-4">
        {sections.map((_, index) => (
          <button
            key={index}
            className={`w-3 h-3 rounded-full transition-all duration-300 ${index === activeIndex ? 'bg-white scale-125' : 'bg-white/50 hover:bg-white/80'}`}
            onClick={() => {
              if (!isAnimating) {
                setIsAnimating(true);
                setTimeout(() => {
                  setActiveIndex(index);
                  setIsAnimating(false);
                }, animationDuration);
              }
            }}
            aria-label={`Go to section ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export default FullPageScroll;
