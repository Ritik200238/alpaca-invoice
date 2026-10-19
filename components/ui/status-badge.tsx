'use client';

import { cn } from '@/lib/utils';
import { Clock, CheckCircle, XCircle, AlertTriangle, Shield, Lock, RefreshCw } from 'lucide-react';
import { InvoiceStatus } from '@/lib/types';
import { useTranslations } from 'next-intl';

interface StatusBadgeProps {
  status: InvoiceStatus;
  size?: 'sm' | 'md';
  className?: string;
}

const statusConfig: Record<InvoiceStatus, { icon: any; labelKey: string; className: string }> = {
  [InvoiceStatus.PENDING]: {
    icon: Clock,
    labelKey: 'invoice.status.pending',
    className: 'bg-warning-50/80 text-warning-700 border-warning-200/60',
  },
  [InvoiceStatus.PAID]: {
    icon: CheckCircle,
    labelKey: 'invoice.status.paid',
    className: 'bg-success-50/80 text-success-700 border-success-200/60',
  },
  [InvoiceStatus.CANCELLED]: {
    icon: XCircle,
    labelKey: 'invoice.status.cancelled',
    className: 'bg-primary-100/80 text-primary-600 border-primary-200/60',
  },
  [InvoiceStatus.EXPIRED]: {
    icon: AlertTriangle,
    labelKey: 'invoice.status.expired',
    className: 'bg-error-50/80 text-error-700 border-error-200/60',
  },
  [InvoiceStatus.DISPUTED]: {
    icon: AlertTriangle,
    labelKey: 'invoice.status.disputed',
    className: 'bg-amber-50/80 text-amber-700 border-amber-200/60',
  },
  [InvoiceStatus.RESOLVED_CANCELLED]: {
    icon: XCircle,
    labelKey: 'invoice.status.resolvedCancelled',
    className: 'bg-red-50/80 text-red-700 border-red-200/60',
  },
  [InvoiceStatus.RESOLVED_PAID]: {
    icon: CheckCircle,
    labelKey: 'invoice.status.resolvedPaid',
    className: 'bg-emerald-50/80 text-emerald-700 border-emerald-200/60',
  },
  [InvoiceStatus.ESCROWED]: {
    icon: Lock,
    labelKey: 'invoice.status.escrowed',
    className: 'bg-blue-50/80 text-blue-700 border-blue-200/60',
  },
  [InvoiceStatus.REFUNDED]: {
    icon: RefreshCw,
    labelKey: 'invoice.status.refunded',
    className: 'bg-orange-50/80 text-orange-700 border-orange-200/60',
  },
};

export function StatusBadge({ status, size = 'md', className }: StatusBadgeProps) {
  const t = useTranslations();
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        config.className,
        className
      )}
    >
      <Icon className={cn(size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
      {t(config.labelKey)}
    </span>
  );
}

// Export config for use in other components
export function getStatusConfig(status: InvoiceStatus) {
  return statusConfig[status];
}
