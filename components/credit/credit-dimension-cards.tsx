'use client';

import { Clock, BarChart3, TrendingUp, Award, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CreditMetrics, CreditDimensionScores } from '@/lib/types';

interface CreditDimensionCardsProps {
  metrics: CreditMetrics;
  dimensions: CreditDimensionScores;
}

export default function CreditDimensionCards({ metrics, dimensions }: CreditDimensionCardsProps) {
  const t = useTranslations('credit');

  const cards = [
    {
      icon: Clock,
      label: t('dimOnTime'),
      value: `${metrics.onTimeRate.toFixed(1)}%`,
      score: dimensions.onTimeRate,
      color: 'text-info-600 bg-info-100/80',
    },
    {
      icon: BarChart3,
      label: t('dimVolume'),
      value: `${metrics.totalInvoices}`,
      score: dimensions.volume,
      color: 'text-accent-700 bg-accent-100/80',
    },
    {
      icon: TrendingUp,
      label: t('dimAmount'),
      value: `${(Number(metrics.totalPaidAmount) / 1_000_000).toFixed(2)}`,
      score: dimensions.amount,
      color: 'text-success-600 bg-success-100/80',
    },
    {
      icon: Award,
      label: t('dimAge'),
      value: metrics.firstInvoiceDate > 0
        ? `${Math.floor((Date.now() / 1000 - metrics.firstInvoiceDate) / 86400)}d`
        : '0d',
      score: dimensions.accountAge,
      color: 'text-warning-600 bg-warning-100/80',
    },
    {
      icon: ShieldCheck,
      label: t('dimDispute'),
      value: `${metrics.disputeCount}`,
      score: dimensions.disputeResistance,
      color: 'text-error-600 bg-error-100/80',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="surface-card p-3.5"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${card.color}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className="text-xs font-medium text-primary-500">{card.label}</span>
            </div>
            <p className="text-xl font-bold text-primary-900">{card.value}</p>
            <div className="mt-2 h-1.5 rounded-full bg-primary-100">
              <div
                className="h-1.5 rounded-full bg-accent-500 transition-all duration-700"
                style={{ width: `${Math.min(100, card.score)}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-primary-400">{card.score}/100</p>
          </div>
        );
      })}
    </div>
  );
}
