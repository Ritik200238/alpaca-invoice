'use client';

import { useMemo } from 'react';
import { ArrowRight, Shield, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { CreditMetrics } from '@/lib/types';
import { CreditService } from '@/services/CreditService/CreditServiceImpl';

const creditService = new CreditService();

const GRADE_COLORS: Record<string, { ring: string; text: string }> = {
  'A+': { ring: '#10b981', text: 'text-emerald-600' },
  'A':  { ring: '#22c55e', text: 'text-green-600' },
  'B':  { ring: '#f59e0b', text: 'text-amber-600' },
  'C':  { ring: '#f97316', text: 'text-orange-600' },
  'D':  { ring: '#ef4444', text: 'text-red-600' },
};

interface CreditDashboardCardProps {
  metrics: CreditMetrics | null;
  onCollect: () => Promise<void>;
  isLoading: boolean;
}

export default function CreditDashboardCard({ metrics, onCollect, isLoading }: CreditDashboardCardProps) {
  const t = useTranslations();
  const grade = useMemo(() => (metrics ? creditService.computeGrade(metrics) : null), [metrics]);

  if (!metrics || !grade) {
    return (
      <div className="surface-card card-hover p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-100/80 ring-1 ring-accent-200/40">
            <Shield className="h-5 w-5 text-accent-600" />
          </div>
          <h3 className="text-sm font-semibold text-primary-900">{t('credit.dashboardCard')}</h3>
        </div>
        <p className="text-sm text-primary-500 mb-3">{t('credit.dashboardDescription')}</p>
        <button
          onClick={onCollect}
          disabled={isLoading}
          className="text-sm font-medium text-accent-600 hover:text-accent-700 flex items-center gap-1"
        >
          {isLoading ? t('common.loading') : t('credit.collectButton')}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const colors = GRADE_COLORS[grade.letter] || GRADE_COLORS['D'];
  const ringSize = 64;
  const sw = 5;
  const r = (ringSize - sw) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (grade.score / 100) * circ;

  return (
    <div className="surface-card card-hover p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-100/80 ring-1 ring-accent-200/40">
            <Shield className="h-5 w-5 text-accent-600" />
          </div>
          <h3 className="text-sm font-semibold text-primary-900">{t('credit.dashboardCard')}</h3>
        </div>
        <Link
          href="/credit"
          className="text-xs text-accent-600 hover:text-accent-700 flex items-center gap-0.5"
        >
          {t('credit.viewCenter')}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <svg width={ringSize} height={ringSize} className="-rotate-90">
            <circle cx={ringSize / 2} cy={ringSize / 2} r={r} fill="none" stroke="#e7e5e4" strokeWidth={sw} />
            <circle
              cx={ringSize / 2} cy={ringSize / 2} r={r} fill="none"
              stroke={colors.ring} strokeWidth={sw} strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={offset}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-lg font-black ${colors.text}`}>{grade.letter}</span>
          </div>
        </div>

        <div className="flex-1 space-y-1">
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-bold ${colors.text}`}>{grade.score}</span>
            <span className="text-sm text-primary-500">/100</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-primary-600">
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {metrics.totalInvoices} {t('credit.invoicesCount')}
            </div>
            <div>{metrics.onTimeRate.toFixed(0)}% {t('credit.onTime')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
