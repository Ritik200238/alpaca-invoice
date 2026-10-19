'use client';

import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import Image from 'next/image';

interface EmptyStateProps {
  icon?: LucideIcon;
  mascot?: 'sleeping' | 'confused' | 'thinking';
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

const mascotImages = {
  sleeping: '/images/mascot/mascot-sleeping.png',
  confused: '/images/mascot/mascot-confused.png',
  thinking: '/images/mascot/mascot-thinking.png',
};

export function EmptyState({
  icon: Icon,
  mascot,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary-200/70 bg-white/70 px-6 py-12 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.25)] backdrop-blur',
        className
      )}
    >
      {mascot ? (
        <Image
          src={mascotImages[mascot]}
          alt={title}
          width={120}
          height={120}
          className="mb-4 opacity-80"
        />
      ) : Icon ? (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100/80 ring-1 ring-primary-200/50">
          <Icon className="h-8 w-8 text-primary-500" />
        </div>
      ) : null}

      <h3 className="text-lg font-semibold text-primary-900">{title}</h3>

      {description && (
        <p className="mt-2 max-w-sm text-center text-sm text-primary-500">
          {description}
        </p>
      )}

      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
