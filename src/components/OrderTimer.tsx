import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface OrderTimerProps {
  startTime: string;
  className?: string;
  showIcon?: boolean;
  variant?: 'default' | 'large' | 'badge';
  color?: 'dark' | 'light';
}

export default function OrderTimer({ 
  startTime, 
  className = "", 
  showIcon = true,
  variant = 'default',
  color = 'dark'
}: OrderTimerProps) {
  const [elapsed, setElapsed] = useState('');
  const [isLate, setIsLate] = useState(false);

  useEffect(() => {
    const calculateElapsed = () => {
      const start = new Date(startTime).getTime();
      const now = new Date().getTime();
      const diff = Math.max(0, now - start);

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      setIsLate(minutes >= 15);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    setElapsed(calculateElapsed());
    const interval = setInterval(() => {
      setElapsed(calculateElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const getVariantStyles = () => {
    const baseColor = color === 'light' ? 'text-white/60' : 'text-gray-400';
    const activeColor = color === 'light' ? 'text-white' : 'text-[#5A5A40]';

    switch (variant) {
      case 'large':
        return `text-xl font-black tracking-tighter ${isLate ? 'text-red-600 animate-pulse' : activeColor}`;
      case 'badge':
        return `px-3 py-1 rounded-full text-xs font-black ${
          isLate ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-[#F5F5F0] text-[#5A5A40]'
        }`;
      default:
        return `text-sm font-bold ${isLate ? 'text-red-500' : baseColor}`;
    }
  };

  return (
    <div className={`flex items-center gap-1.5 ${getVariantStyles()} ${className}`}>
      {showIcon && <Clock className={variant === 'large' ? 'w-5 h-5' : 'w-3 h-3'} />}
      <span className="font-mono">{elapsed}</span>
    </div>
  );
}
