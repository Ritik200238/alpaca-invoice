'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'w-full rounded-xl border-2 border-alpaca-300 bg-alpaca-50 px-4 py-3 text-sm transition-all duration-200',
      'placeholder:text-alpaca-400',
      'focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'file:border-0 file:bg-transparent file:text-sm file:font-medium',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
