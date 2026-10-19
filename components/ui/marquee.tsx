'use client';

import { cn } from '@/lib/utils';

interface MarqueeProps {
  className?: string;
  reverse?: boolean;
  pauseOnHover?: boolean;
  vertical?: boolean;
  children: React.ReactNode;
}

export function Marquee({
  className,
  reverse = false,
  pauseOnHover = false,
  vertical = false,
  children,
}: MarqueeProps) {
  const duration = typeof window !== 'undefined' ? '20s' : '20s';
  const style = {
    '--duration': duration,
  } as React.CSSProperties;

  const animationName = vertical
    ? reverse
      ? 'marquee-vertical-reverse'
      : 'marquee-vertical'
    : reverse
      ? 'marquee-horizontal-reverse'
      : 'marquee-horizontal';

  return (
    <div
      className={cn('overflow-hidden', pauseOnHover && 'marquee-pause', className)}
      style={style}
    >
      <div
        className={cn(
          'marquee-inner flex gap-4 [&>*]:flex-shrink-0',
          vertical ? 'flex-col' : 'flex-row',
          vertical ? 'w-full' : 'w-max'
        )}
        style={{
          animation: `${animationName} var(--duration, 20s) linear infinite`,
        }}
      >
        {children}
        {children}
      </div>
    </div>
  );
}
