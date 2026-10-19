'use client';

import { Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CurrencyFlag } from '@/lib/types';

export interface PaymentProgressProps {
  currencyFlag: CurrencyFlag;
  approvalStatus: 'idle' | 'checking' | 'insufficient' | 'approved';
  phase: 1 | 2 | 3 | null;
  confirmationDepth: number;
  isComplete: boolean;
}

/**
 * Three-phase payment progress bar (PRD 4.2)
 * Phase 1: Authorization (USDCx Approve)
 * Phase 2: Proving (privacy shield animation)
 * Phase 3: Finalizing (confirmation depth)
 */
export default function PaymentProgress({
  currencyFlag,
  approvalStatus,
  phase,
  confirmationDepth,
  isComplete
}: PaymentProgressProps) {
  const t = useTranslations();
  const isUsdcx = currencyFlag === CurrencyFlag.USDCX;
  const step1Active = phase === 1 || (isUsdcx && approvalStatus === 'insufficient' && !phase);
  const step2Active = phase === 2;
  const step3Active = phase === 3;

  return (
    <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 p-4 space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              isComplete ? 'bg-emerald-500' : step3Active ? 'bg-emerald-400' : 'bg-blue-500'
            }`}
            style={{
              width: isComplete ? '100%' : step3Active ? `${Math.min(66 + (confirmationDepth / 10), 100)}%` : step2Active ? '50%' : step1Active ? '16%' : '0%'
            }}
          />
        </div>
        <span className="text-xs font-medium text-slate-600">
          {isComplete ? t('payment.progress.done') : phase === 3 ? `${t('payment.progress.confirmations')}: ${confirmationDepth}` : phase === 2 ? t('payment.progress.phase2') : phase === 1 ? t('payment.progress.approval') : '…'}
        </span>
      </div>

      {/* Phase 1: Token preparation */}
      {isUsdcx && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            step1Active ? 'border-amber-300 bg-amber-50' : approvalStatus === 'approved' ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <span className="font-medium text-slate-800">{t('payment.progress.phase1Label')}</span>
          <p className="mt-0.5 text-slate-600">
            {approvalStatus === 'checking' && t('payment.progress.loadingToken')}
            {approvalStatus === 'insufficient' && t('payment.progress.noToken')}
            {approvalStatus === 'approved' && `✓ ${t('payment.progress.tokenReady')}`}
            {approvalStatus === 'idle' && t('payment.progress.awaitingToken')}
          </p>
        </div>
      )}

      {/* Phase 2: Proving — privacy shield animation */}
      <div
        className={`rounded-lg border px-3 py-3 text-sm flex items-center gap-3 ${
          step2Active ? 'border-blue-300 bg-blue-100/80' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <div className={step2Active ? 'animate-spin' : ''}>
          <Shield className="h-8 w-8 text-blue-600" />
        </div>
        <div>
          <span className="font-medium text-slate-800">{t('payment.progress.phase2Label')}</span>
          <p className="mt-0.5 text-slate-600">
            {t('payment.progress.phase2Desc')}
          </p>
        </div>
      </div>

      {/* Phase 3: Finalizing */}
      <div
        className={`rounded-lg border px-3 py-2 text-sm ${
          step3Active || isComplete ? 'border-emerald-300 bg-emerald-50/80' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <span className="font-medium text-slate-800">{t('payment.progress.phase3Label')}</span>
        <p className="mt-0.5 text-slate-600">
          {isComplete ? `✓ ${t('payment.progress.confirmed')}` : step3Active ? t('payment.progress.confirmingOnChain', { depth: confirmationDepth }) : t('payment.progress.awaitingConfirmation')}
        </p>
      </div>
    </div>
  );
}
