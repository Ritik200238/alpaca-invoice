'use client';

import { Lock, CheckCircle, RefreshCw, Clock, Shield, User, Gavel, AlertTriangle, Ban } from 'lucide-react';
import type { EscrowRecord, Invoice } from '@/lib/types';
import { EscrowStatus, InvoiceStatus } from '@/lib/types';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import WalletOperationProgress from '@/components/wallet-operation-progress';

interface EscrowStatusCardProps {
  escrow: EscrowRecord;
  invoice: Invoice;
  onConfirmDelivery: () => Promise<void>;
  onClaimRefund: () => Promise<void>;
  onArbiterRelease?: () => Promise<void>;
  onArbiterRefund?: () => Promise<void>;
  isCurrentUserPayer: boolean;
  isCurrentUserPayee: boolean;
  isCurrentUserArbiter: boolean;
  /** Progress 0-100 from useTransactionStore while a tx is in flight */
  txProgress?: number;
  /** Latest log message from useTransactionStore */
  txLog?: string;
  /** Whether the parent is externally processing an escrow tx */
  isExternallyProcessing?: boolean;
  /** Whether we are in the chain-confirmation polling phase */
  isPollingChain?: boolean;
  /** Log message from the chain poller */
  pollLog?: string;
  /** Callback to open the Raise Dispute form (buyer only, LOCKED status) */
  onRaiseDispute?: () => void;
  /** Whether the dispute form is already showing */
  showDisputeForm?: boolean;
}

function useCountdown(deadline: Date) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = deadline.getTime() - Date.now();
      if (diff <= 0) {
        setRemaining('');
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      setRemaining(`${days}d ${hours}h ${minutes}m`);
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [deadline]);

  return remaining;
}

function truncateAddress(addr: string) {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}

export default function EscrowStatusCard({
  escrow,
  invoice,
  onConfirmDelivery,
  onClaimRefund,
  onArbiterRelease,
  onArbiterRefund,
  isCurrentUserPayer,
  isCurrentUserPayee,
  isCurrentUserArbiter,
  txProgress = 0,
  txLog = '',
  isExternallyProcessing = false,
  isPollingChain = false,
  pollLog = '',
  onRaiseDispute,
  showDisputeForm = false,
}: EscrowStatusCardProps) {
  const t = useTranslations();
  const remaining = useCountdown(escrow.deliveryDeadline);
  const isExpired = new Date() > escrow.deliveryDeadline;
  const [processing, setProcessing] = useState(false);

  // True while ZK proving OR waiting for chain confirmation
  const isAnyProcessing = processing || isExternallyProcessing || isPollingChain;

  const statusConfig = {
    [EscrowStatus.LOCKED]: {
      label: t('escrow.statusLocked'),
      color: 'border-blue-300 bg-blue-50',
      icon: <Lock className="h-5 w-5 text-blue-600" />,
    },
    [EscrowStatus.RELEASED]: {
      label: t('escrow.statusReleased'),
      color: 'border-emerald-300 bg-emerald-50',
      icon: <CheckCircle className="h-5 w-5 text-emerald-600" />,
    },
    [EscrowStatus.REFUNDED]: {
      label: t('escrow.statusRefunded'),
      color: 'border-amber-300 bg-amber-50',
      icon: <RefreshCw className="h-5 w-5 text-amber-600" />,
    },
  };

  const config = statusConfig[escrow.status] ?? statusConfig[EscrowStatus.LOCKED];

  const handleConfirm = async () => {
    setProcessing(true);
    try { await onConfirmDelivery(); } finally { setProcessing(false); }
  };

  const handleRefund = async () => {
    setProcessing(true);
    try { await onClaimRefund(); } finally { setProcessing(false); }
  };

  return (
    <div className={`rounded-xl border-2 ${config.color} p-4 space-y-3`}>
      {/* Header: status + countdown */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {config.icon}
          <span className="font-semibold text-slate-800">{t('escrow.enabled')}: {config.label}</span>
        </div>
        <div className="flex items-center gap-1 text-sm text-slate-600">
          <Clock className="h-4 w-4" />
          <span>{remaining || t('invoice.status.expired')}</span>
        </div>
      </div>

      {/* Amount + Deadline */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-slate-500">{t('invoice.detail.amount')}</span>
          <p className="font-medium text-slate-800">{(Number(escrow.amount) / 1_000_000).toLocaleString()} {t('invoice.card.credits')}</p>
        </div>
        <div>
          <span className="text-slate-500">{t('escrow.deliveryDeadline')}</span>
          <p className="font-medium text-slate-800">{escrow.deliveryDeadline.toLocaleDateString()}</p>
        </div>
      </div>

      {/* ── Phase 1 + Phase 2 unified progress ── */}
      <WalletOperationProgress
        isProving={(isExternallyProcessing || processing) && !isPollingChain}
        txProgress={txProgress}
        txLog={txLog}
        isConfirming={isPollingChain}
        pollLog={pollLog}
        stepLabel={isPollingChain ? 'Step 2 / 2' : 'Step 1 / 2'}
      />

      {/* Resolved: invoice fully settled — no more actions */}
      {invoice.status === InvoiceStatus.RESOLVED_PAID && (
        <div className="space-y-2 pt-1">
          <div className="flex items-start gap-2 rounded-lg bg-slate-100/60 p-3">
            <Ban className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
            <div className="text-xs text-slate-700">
              <p className="font-medium">{t('escrow.resolvedPaidMessage')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Resolved (dismissed): seller read-only, buyer can still confirm delivery */}
      {invoice.status === InvoiceStatus.RESOLVED_CANCELLED && (
        <div className="space-y-2 pt-1">
          <div className="flex items-start gap-2 rounded-lg bg-amber-50/60 border border-amber-200 p-3 mb-2">
            <Gavel className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-800">
              <p className="font-medium">{t('escrow.resolvedCancelledMessage')}</p>
            </div>
          </div>

          {/* Buyer can still confirm delivery or claim refund */}
          {!isAnyProcessing && escrow.status === EscrowStatus.LOCKED && isCurrentUserPayer && (
            <>
              <p className="text-xs text-slate-600">
                {isExpired ? t('escrow.refundAvailable') : t('escrow.confirmDeliveryMsg')}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={isAnyProcessing || isExpired}
                  className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {t('invoice.detail.confirmDelivery')}
                </button>
                <button
                  onClick={handleRefund}
                  disabled={isAnyProcessing || !isExpired}
                  className="flex-1 rounded-lg border-2 border-amber-300 bg-amber-50 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title={!isExpired ? t('escrow.refundNotYetAvailable') : ''}
                >
                  {t('invoice.detail.claimRefund')}
                </button>
              </div>
              {!isExpired && (
                <p className="text-xs text-amber-600 text-center">
                  {t('escrow.refundNotYetAvailable')}
                </p>
              )}
            </>
          )}

          {/* Seller read-only for dismissed disputes */}
          {escrow.status === EscrowStatus.LOCKED && isCurrentUserPayee && !isCurrentUserPayer && (
            <div className="flex items-start gap-2 rounded-lg bg-slate-100/60 p-3">
              <User className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
              <div className="text-xs text-slate-600">
                <p className="font-medium">{t('escrow.sellerDisputeDismissed')}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Normal (non-resolved) Buyer (payer) actions */}
      {!isAnyProcessing && escrow.status === EscrowStatus.LOCKED && isCurrentUserPayer
        && invoice.status !== InvoiceStatus.RESOLVED_PAID
        && invoice.status !== InvoiceStatus.RESOLVED_CANCELLED && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-slate-600">
            {isExpired ? t('escrow.refundAvailable') : t('escrow.confirmDeliveryMsg')}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={isAnyProcessing || isExpired}
              className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('invoice.detail.confirmDelivery')}
            </button>
            <button
              onClick={handleRefund}
              disabled={isAnyProcessing || !isExpired}
              className="flex-1 rounded-lg border-2 border-amber-300 bg-amber-50 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={!isExpired ? t('escrow.refundNotYetAvailable') : ''}
            >
              {t('invoice.detail.claimRefund')}
            </button>
          </div>

          {!isExpired && (
            <p className="text-xs text-amber-600 text-center">
              {t('escrow.refundNotYetAvailable')}
            </p>
          )}

          {/* Raise Dispute button for buyer */}
          {onRaiseDispute && !showDisputeForm && (
            <button
              onClick={onRaiseDispute}
              disabled={isAnyProcessing}
              className="w-full rounded-lg border-2 border-amber-300 bg-amber-50 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <AlertTriangle className="inline h-4 w-4 mr-1 -mt-0.5" />
              {t('dispute.raiseDispute')}
            </button>
          )}

          {/* Arbiter contact hint for buyer */}
          <div className="flex items-start gap-2 rounded-lg bg-slate-100/80 p-2.5 mt-1">
            <Shield className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
            <div className="text-xs text-slate-600">
              <p>{t('escrow.contactArbiter')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Seller (payee) view — only for non-resolved invoices */}
      {!isAnyProcessing && escrow.status === EscrowStatus.LOCKED && isCurrentUserPayee && !isCurrentUserPayer
        && invoice.status !== InvoiceStatus.RESOLVED_PAID
        && invoice.status !== InvoiceStatus.RESOLVED_CANCELLED && (
        <div className="space-y-2 pt-1">
          {!isExpired ? (
            <div className="flex items-start gap-2 rounded-lg bg-blue-100/60 p-3">
              <User className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-800">
                <p className="font-medium">{t('escrow.sellerReadonly')}</p>
                <p className="mt-1 text-blue-700">{t('escrow.sellerWaiting')}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg bg-amber-100/60 p-3">
              <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-800">
                <p className="font-medium">{t('escrow.sellerExpiredWarning')}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Arbiter actions — only for non-resolved invoices */}
      {!isAnyProcessing && escrow.status === EscrowStatus.LOCKED && isCurrentUserArbiter && !isCurrentUserPayer
        && invoice.status !== InvoiceStatus.RESOLVED_PAID
        && invoice.status !== InvoiceStatus.RESOLVED_CANCELLED && (
        <div className="space-y-2 pt-1">
          <div className="flex items-start gap-2 rounded-lg bg-purple-100/60 p-3">
            <Gavel className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
            <div className="text-xs text-purple-800">
              <p className="font-medium">{t('escrow.arbiterRoleTitle')}</p>
              <p className="mt-1 text-purple-700">{t('escrow.arbiterRoleDesc')}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setProcessing(true);
                try { await onArbiterRelease?.(); } finally { setProcessing(false); }
              }}
              disabled={isAnyProcessing}
              className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('escrow.arbiterRelease')}
            </button>
            <button
              onClick={async () => {
                setProcessing(true);
                try { await onArbiterRefund?.(); } finally { setProcessing(false); }
              }}
              disabled={isAnyProcessing}
              className="flex-1 rounded-lg border-2 border-amber-300 bg-amber-50 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('escrow.arbiterRefund')}
            </button>
          </div>
        </div>
      )}

      {/* Arbiter info - visible to both parties */}
      {escrow.status === EscrowStatus.LOCKED && escrow.arbiter && (
        <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60 text-xs text-slate-500">
          <Shield className="h-3.5 w-3.5 shrink-0" />
          <span>{t('escrow.arbiterLabel')}:</span>
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 break-all">
            {truncateAddress(escrow.arbiter)}
          </code>
        </div>
      )}
    </div>
  );
}
