'use client';

import * as React from 'react';
import { DayPicker, type Matcher } from 'react-day-picker';
import * as Popover from '@radix-ui/react-popover';
import { CalendarDays } from 'lucide-react';
import { format, parse, isValid } from 'date-fns';
import { cn } from '@/lib/utils';

import 'react-day-picker/src/style.css';

interface DatePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function parseYmd(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = parse(s, 'yyyy-MM-dd', new Date());
  return isValid(d) ? d : undefined;
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  required,
  placeholder = 'Select date',
  className,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const selected = parseYmd(value);
  const minDate = parseYmd(min);
  const maxDate = parseYmd(max);

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onChange?.(format(date, 'yyyy-MM-dd'));
    }
    setOpen(false);
  };

  const disabledMatcher = React.useMemo<Matcher[] | undefined>(() => {
    const matchers: Matcher[] = [];
    if (minDate) matchers.push({ before: minDate });
    if (maxDate) matchers.push({ after: maxDate });
    return matchers.length > 0 ? matchers : undefined;
  }, [min, max]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex w-full items-center justify-between rounded-xl border-2 border-alpaca-300 bg-alpaca-50 px-4 py-3 text-sm transition-all duration-200 text-left',
            'focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            !selected && 'text-alpaca-400',
            className
          )}
        >
          <span>{selected ? format(selected, 'yyyy-MM-dd') : placeholder}</span>
          <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className={cn(
            'z-50 rounded-xl border-2 border-alpaca-200 bg-white p-3 shadow-lg',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2'
          )}
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            disabled={disabledMatcher}
            defaultMonth={selected ?? minDate ?? new Date()}
            required={required}
            classNames={{
              root: 'rdp-root text-sm',
              day: 'rdp-day',
              selected: 'rdp-selected',
              today: 'rdp-today',
              chevron: 'rdp-chevron',
            }}
            styles={{
              root: {
                '--rdp-accent-color': 'var(--color-accent-500, #f59e0b)',
                '--rdp-accent-background-color': 'var(--color-accent-50, #fffbeb)',
                '--rdp-today-color': 'var(--color-accent-600, #d97706)',
                '--rdp-day-height': '36px',
                '--rdp-day-width': '36px',
                '--rdp-day_button-height': '34px',
                '--rdp-day_button-width': '34px',
              } as React.CSSProperties,
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
