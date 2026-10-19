'use client';

import { Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface WalletOperationProgressProps {
  /** Phase 1: wallet is generating ZK proof */
  isProving: boolean;
  txProgress: number;
  txLog: string;
  /** Phase 2: waiting for on-chain confirmation */
  isConfirming: boolean;
  pollLog: string;
  /** Override the Phase 1 heading, e.g. "Creating invoice..." */
  operationLabel?: string;
  /** Multi-step indicator shown above heading, e.g. "Step 1 / 2" */
  stepLabel?: string;
  /** Compact mode for card-level usage (smaller padding, no description) */
  compact?: boolean;
}

export default function WalletOperationProgress({
  isProving,
  txProgress,
  txLog,
  isConfirming,
  pollLog,
  operationLabel,
  stepLabel,
  compact = false,
}: WalletOperationProgressProps) {
  const t = useTranslations();

  if (!isProving && !isConfirming) return null;

  const padding = compact ? 'px-3 py-2.5 space-y-2' : 'px-3.5 py-3 space-y-2.5';

  return (
    <div className="space-y-2">
      {/* Phase 1: ZK Proving */}
      {isProving && !isConfirming && (
        <div className={`rounded-lg border border-blue-200 bg-blue-50/60 ${padding}`}>
          <div className="flex items-center gap-2.5">
            <div className="flex-1 h-1.5 rounded-full bg-blue-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${Math.max(txProgress, 8)}%` }}
              />
            </div>
            <span className="text-xs font-medium text-blue-700 tabular-nums min-w-[2.5rem] text-right">
              {txProgress}%
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="animate-spin shrink-0">
              <Shield className={compact ? 'h-4 w-4 text-blue-500' : 'h-5 w-5 text-blue-500'} />
            </div>
            <div>
              <p className="text-xs font-semibold text-blue-800">
                {stepLabel && <span>{stepLabel} — </span>}
                {operationLabel ?? t('walletProgress.zkProving')}
              </p>
              {txLog && (
                <p className="text-xs text-blue-600 mt-0.5 truncate max-w-[260px]">{txLog}</p>
              )}
            </div>
          </div>
          {!compact && (
            <p className="text-[11px] text-blue-500 leading-relaxed">
              {t('walletProgress.zkProvingDesc')}
            </p>
          )}
        </div>
      )}

      {/* Phase 2: Chain confirmation */}
      {isConfirming && (
        <div className={`rounded-lg border border-emerald-200 bg-emerald-50/60 ${padding}`}>
          <div className="h-1.5 rounded-full bg-emerald-100 overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-emerald-400 animate-[slide_1.8s_ease-in-out_infinite]" />
          </div>
          <div className="flex items-center gap-2.5">
            <div className="shrink-0 h-5 w-5 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
            <div>
              <p className="text-xs font-semibold text-emerald-800">
                {stepLabel && <span>{stepLabel} — </span>}
                {t('walletProgress.confirmingOnChain')}
              </p>
              {pollLog && (
                <p className="text-xs text-emerald-600 mt-0.5">{pollLog}</p>
              )}
            </div>
          </div>
          {!compact && (
            <p className="text-[11px] text-emerald-600 leading-relaxed">
              {t('walletProgress.confirmingOnChainDesc')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
