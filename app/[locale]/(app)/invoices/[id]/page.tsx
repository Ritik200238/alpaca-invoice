'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw, ArrowLeft, AlertTriangle, Lock, Shield } from 'lucide-react';
import { useInvoiceDetailPage } from '@/controller/Invoice/useInvoiceDetailPage';
import WalletOperationProgress from '@/components/wallet-operation-progress';
import DisputeForm from '@/components/dispute-form';
import EscrowStatusCard from '@/components/escrow-status-card';
import { CurrencyFlag } from '@/lib/types';
import { useAuthCheck } from '@/controller/Auth/useAuthCheck';
import { AleoAddress, AleoField, InvoiceStatus } from '@/lib/types';
import { getTaxRateLabelFromTaxGroups } from '@/lib/invoice';
import { useDisputeController } from '@/controller/Dispute/useDisputeController';
import { useEscrowController } from '@/controller/Escrow/useEscrowController';
import { useEscrowStatusPoller } from '@/controller/Escrow/useEscrowStatusPoller';
import { useInvoiceStatusPoller } from '@/controller/Invoice/useInvoiceStatusPoller';
import { useDisputeEscrowChainSync } from '@/controller/Dispute/useDisputeEscrowChainSync';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { toast } from 'sonner';
import { useEscrowStore } from '@/stores/Escrow/useEscrowStore';
import { useDisputeStore } from '@/stores/Dispute/useDisputeStore';
import { useTransactionStore } from '@/stores/Transaction/useTransactionStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

export default function InvoiceDetailPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const invoiceHash = useMemo(
    () => (Array.isArray(params?.id) ? params.id[0] : (params?.id as string)) as AleoField | null,
    [params]
  );
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [escrowProcessing, setEscrowProcessing] = useState(false);
  const [walletOp, setWalletOp] = useState<'idle' | 'paying' | 'cancelling'>('idle');
  const disputeController = useDisputeController();
  const escrowController = useEscrowController();
  const escrowPoller = useEscrowStatusPoller();
  const invoicePoller = useInvoiceStatusPoller();
  const { syncFromChain: syncDisputeEscrow } = useDisputeEscrowChainSync();
  const { escrows } = useEscrowStore();
  const { disputes } = useDisputeStore();
  const publicKey = useUserStore((s) => s.publicKey);

  useEffect(() => {
    if (publicKey) syncDisputeEscrow();
  }, [publicKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Granular tx progress for escrow operations (shared with all txController calls)
  const { progress: txProgress, logs: txLogs } = useTransactionStore();
  const txCurrentLog = txLogs[txLogs.length - 1] ?? '';

  const { isAuthRequired, handleUnlock } = useAuthCheck();
  const { handleError } = useErrorHandler();

  const {
    invoice,
    isLoadingInvoice,
    isSyncing,
    isConfirmed,
    userRole,
    statusConfig,
    isProcessing,
    isSyncingStatus,
    handlePay,
    handleCancel,
    handleSyncStatus,
    displayCurrency,
    chainArbiter: hookChainArbiter,
    anchors,
    isFetchingAnchors,
    downloadMsg,
    safeStringify,
    handleDownloadPackage
  } = useInvoiceDetailPage(invoiceHash);

  if (isAuthRequired) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">{t('invoice.detail.title')}</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <div className="mb-4">
            <div className="text-lg font-semibold text-slate-900 mb-2">
              {t('wallet.unlockTitle')}
            </div>
            <p className="text-sm text-slate-600 mb-4">
              {t('wallet.unlockDescription')}
            </p>
            <button
              onClick={handleUnlock}
              className="rounded-lg bg-amber-600 px-6 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
            >
              {t('wallet.unlock')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoadingInvoice) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">{t('invoice.detail.title')}</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <div className="text-sm text-slate-600">{t('invoice.detail.loadingData')}</div>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">{t('invoice.detail.title')}</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <p className="text-sm text-slate-600 mb-2">
            {t('errors.invoiceNotFound')}: {invoiceHash}
          </p>
          <p className="text-xs text-slate-500">
            {t('invoice.detail.processingOnChain')}
          </p>
        </div>
      </div>
    );
  }

  const chainArbiter = hookChainArbiter
    ?? escrows.find(e => e.invoiceId === invoice.id)?.arbiter
    ?? invoice.details?.arbiter;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            title={t('invoice.detail.backToInvoices')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h2 className="text-xl font-bold text-slate-900">{t('invoice.detail.title')}</h2>
        </div>
        {/* Chain confirmation status and sync button */}
        <div className="flex items-center gap-3">
          {isSyncing && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-600">
              <RefreshCw className={cn('h-3.5 w-3.5', 'animate-spin')} />
              {t('invoice.detail.syncing')}
            </span>
          )}
          {isConfirmed && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              ✓ {t('invoice.detail.confirmedOnChain')}
            </span>
          )}
          {!isConfirmed && !isSyncing && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
              ⏳ {t('invoice.detail.sending')}
            </span>
          )}
          {isConfirmed && (
            <button
              onClick={handleSyncStatus}
              disabled={isSyncingStatus || isProcessing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={t('invoice.detail.syncStatus')}
            >
              <svg className={`w-3.5 h-3.5 ${isSyncingStatus ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isSyncingStatus ? t('common.syncing') : t('invoice.detail.syncStatus')}
            </button>
          )}
        </div>
      </div>

      {/* Invoice detail card */}
      <div className="rounded-xl border-2 border-amber-200 bg-white p-5">
        {/* Header with Status */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs text-slate-500 mb-1">{t('invoice.detail.invoiceId')}</div>
            <code className="text-sm font-mono font-semibold text-slate-900 break-all">
              {invoice.id}
            </code>
          </div>
          <span
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border-2 ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
          >
            <span>{statusConfig.icon}</span>
            <span>{statusConfig.label}</span>
          </span>
        </div>

        {/* Amount */}
        <div className="mb-4 pb-4 border-b border-amber-100">
          <div className="text-xs text-slate-500 mb-1">{t('invoice.detail.amount')}</div>
          <div className="text-2xl font-bold text-slate-900">
            {(Number(invoice.amount) / 1_000_000).toFixed(2)}
            <span className="text-sm font-normal text-slate-600 ml-2">{displayCurrency}</span>
          </div>
        </div>

        {/* Details — all 9 scope fields + metadata */}
        <div className="space-y-2 mb-4 text-sm">
          {/* buyer */}
          <div className="flex justify-between">
            <span className="text-slate-600">{t('invoice.detail.buyer')}</span>
            <code className="text-xs bg-amber-50 px-2 py-1 rounded text-slate-900 break-all">
              {invoice.buyer}
            </code>
          </div>
          {/* seller */}
          <div className="flex justify-between">
            <span className="text-slate-600">{t('invoice.detail.seller')}</span>
            <code className="text-xs bg-amber-50 px-2 py-1 rounded text-slate-900 break-all">
              {invoice.seller}
            </code>
          </div>
          {/* arbiter (from chain EscrowRecord or in-memory) */}
          {chainArbiter && (
            <div className="flex justify-between">
              <span className="text-slate-600">{t('invoice.detail.arbiterLabel')}</span>
              <code className="text-xs bg-purple-50 px-2 py-1 rounded text-slate-900 break-all">
                {chainArbiter}
              </code>
            </div>
          )}
          {/* due_date */}
          <div className="flex justify-between">
            <span className="text-slate-600">{t('invoice.detail.dueDate')}</span>
            <span className="font-medium text-slate-900">
              {format(invoice.dueDate, 'yyyy-MM-dd')}
            </span>
          </div>
          {/* created_at */}
          <div className="flex justify-between">
            <span className="text-slate-600">{t('invoice.detail.createdAt')}</span>
            <span className="font-medium text-slate-900">
              {format(invoice.createdAt, 'yyyy-MM-dd HH:mm')}
            </span>
          </div>
          {/* role */}
          <div className="flex justify-between">
            <span className="text-slate-600">{t('invoice.detail.yourRole')}</span>
            <span className="font-medium text-slate-900 capitalize">
              {userRole === 'seller' ? `🏪 ${t('invoice.detail.seller')}` : userRole === 'buyer' ? `🛒 ${t('invoice.detail.buyer')}` : `❓ ${t('invoice.detail.unknown')}`}
            </span>
          </div>
          {/* tax_amount */}
          <div className="flex justify-between">
            <span className="text-slate-600">{t('invoice.detail.taxAmount')}</span>
            <span className="font-medium text-slate-900">
              {(Number(invoice.taxAmount ?? 0) / 1_000_000).toFixed(2)} {displayCurrency}
            </span>
          </div>
          {/* currency */}
          <div className="flex justify-between">
            <span className="text-slate-600">{t('invoice.detail.currency')}</span>
            <span className="font-medium text-slate-900">{displayCurrency}</span>
          </div>
          {/* order_id */}
          <div className="flex justify-between">
            <span className="text-slate-600">{t('invoice.detail.orderId')}</span>
            {invoice.details?.orderId || invoice.details?.invoiceNumber ? (
              <span className="font-medium text-slate-900">
                {invoice.details.orderId ?? invoice.details.invoiceNumber}
              </span>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </div>
          {/* memo_hash / notes */}
          <div className="flex justify-between">
            <span className="text-slate-600">{t('invoice.detail.memo')}</span>
            {invoice.details?.notes ? (
              <span className="font-medium text-slate-900">{invoice.details.notes}</span>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </div>
          {/* invoice_hash */}
          <div className="flex justify-between">
            <span className="text-slate-600">{t('invoice.detail.invoiceHash')}</span>
            <code className="text-xs bg-amber-50 px-2 py-1 rounded text-slate-900 break-all max-w-[60%] text-right">
              {invoice.invoiceHash}
            </code>
          </div>
        </div>
      {/* Line Items & Summary */}
      {invoice.details && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">{t('invoice.create.lineItems')}</div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[360px] text-sm text-slate-700 border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <th className="py-2 pr-2">{t('invoice.create.description')}</th>
                  <th className="py-2 pr-2 text-right">{t('invoice.create.quantity')}</th>
                  <th className="py-2 pr-2 text-right">{t('invoice.create.unitPrice')}</th>
                  <th className="py-2 pr-2 text-right">{t('invoice.create.taxRate')}</th>
                  <th className="py-2 text-right">{t('invoice.create.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const taxRateFromGroups = getTaxRateLabelFromTaxGroups(invoice.taxGroups);
                  return invoice.details.lineItems.map((item, idx) => {
                    const fallbackRaw = (item as { taxRate?: number }).taxRate ?? invoice.details!.taxRate;
                    const fallbackPct = fallbackRaw != null && Number(fallbackRaw) > 0
                      ? (Number(fallbackRaw) <= 1 ? Number(fallbackRaw) * 100 : Number(fallbackRaw))
                      : 0;
                    const taxRateLabel = taxRateFromGroups ?? (fallbackPct > 0 ? `${fallbackPct.toFixed(0)}%` : null);
                    return (
                      <tr key={idx} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-2">{item.description}</td>
                        <td className="py-2 pr-2 text-right">{item.quantity}</td>
                        <td className="py-2 pr-2 text-right">{item.unitPrice}</td>
                        <td className="py-2 pr-2 text-right">
                          {taxRateLabel ?? '—'}
                        </td>
                        <td className="py-2 text-right">{item.amount}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-700">
            <div className="flex justify-between">
              <span>{t('invoice.create.subtotal')}</span>
              <span>{invoice.details.subtotal} {invoice.details.currency}</span>
            </div>
            {invoice.details.taxRate > 0 && (
              <div className="flex justify-between">
                <span>{t('invoice.detail.tax')} ({(invoice.details.taxRate * 100).toFixed(2)}%)</span>
                <span>{invoice.details.taxAmount} {invoice.details.currency}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-slate-900">
              <span>{t('invoice.create.total')}</span>
              <span>{invoice.details.total} {invoice.details.currency}</span>
            </div>
          </div>
        </div>
      )}

        {/* Audit anchors */}
        {!isFetchingAnchors && (anchors.commitment || anchors.rules || anchors.fieldCommitments || anchors.auth || anchors.counter != null) && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="font-semibold text-slate-900">{t('invoice.detail.chainAnchors')}</div>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 text-xs text-slate-800">
              {anchors.commitment && (
                <div>
                  <div className="text-slate-500">{t('invoice.detail.commitmentRoot')}</div>
                  <div className="font-mono break-all">{anchors.commitment}</div>
                </div>
              )}
              {anchors.rules && (
                <div>
                  <div className="text-slate-500">{t('invoice.detail.rulesResult')}</div>
                  <div className="font-mono break-all">{anchors.rules}</div>
                </div>
              )}
              {anchors.fieldCommitments && (
                <div className="md:col-span-2">
                  <div className="text-slate-500">{t('invoice.detail.fieldCommitments')}</div>
                  <pre className="mt-1 max-h-28 overflow-auto rounded border border-slate-200 bg-white p-2">
                    {safeStringify(anchors.fieldCommitments)}
                  </pre>
                </div>
              )}
              {anchors.auth && (
                <div className="md:col-span-2">
                  <div className="text-slate-500">{t('settings.auditAuth')}</div>
                  <pre className="mt-1 max-h-24 overflow-auto rounded border border-slate-200 bg-white p-2">
                    {safeStringify(anchors.auth)}
                  </pre>
                </div>
              )}
              {anchors.counter != null && (
                <div>
                  <div className="text-slate-500">{t('invoice.detail.sellerAuditCounter')}</div>
                  <div className="font-mono break-all">{anchors.counter}</div>
                </div>
              )}
            </div>
          </div>
        )}
              

        {/* Audit package download */}
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="font-semibold text-slate-900">{t('invoice.detail.auditPackage')}</div>
          {invoice.details ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => handleDownloadPackage('minimal')}
                className="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                {t('invoice.detail.downloadMinimalPackage')}
              </button>
              <button
                onClick={() => handleDownloadPackage('full')}
                className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                {t('invoice.detail.downloadFullPackage')}
              </button>
              {downloadMsg && <span className="text-xs text-slate-600">{downloadMsg}</span>}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-400">
              {t('invoice.detail.auditPackageRequiresDetails')}
            </p>
          )}
        </div>

        {/* Escrow Status Card */}
        {(() => {
          const escrow = escrows.find(e => e.invoiceId === invoice.id);
          if (!escrow) return null;
          return (
            <div className="mt-4">
              <EscrowStatusCard
                escrow={escrow}
                invoice={invoice}
                isCurrentUserPayer={publicKey === escrow.payer}
                isCurrentUserPayee={publicKey === escrow.payee}
                isCurrentUserArbiter={publicKey === escrow.arbiter}
                isExternallyProcessing={escrowProcessing}
                txProgress={txProgress}
                txLog={txCurrentLog}
                isPollingChain={escrowPoller.isPolling}
                pollLog={escrowPoller.pollLog}
                onRaiseDispute={() => setShowDisputeForm(true)}
                showDisputeForm={showDisputeForm}
                onConfirmDelivery={async () => {
                  setEscrowProcessing(true);
                  try {
                    await escrowController.executeConfirmDelivery({ escrow, invoice });
                    // Phase 1 done (wallet accepted). Now poll chain for PAID status.
                    setEscrowProcessing(false);
                    escrowPoller.startPolling({
                      invoice,
                      escrowId: escrow.escrowId,
                      operation: 'confirm_delivery',
                      onConfirmed: () => {
                        toast.success('Delivery confirmed — funds released!');
                      },
                      onTimeout: () => {
                        toast.warning('Confirmation timeout', {
                          description: 'Transaction may still be pending. Please sync manually.'
                        });
                      },
                    });
                  } catch (err) {
                    handleError(err);
                    setEscrowProcessing(false);
                  }
                }}
                onClaimRefund={async () => {
                  setEscrowProcessing(true);
                  try {
                    await escrowController.executeTimeoutRefund({ escrow, invoice });
                    setEscrowProcessing(false);
                    escrowPoller.startPolling({
                      invoice,
                      escrowId: escrow.escrowId,
                      operation: 'timeout_refund',
                      onConfirmed: () => {
                        toast.success('Refund confirmed — payment returned!');
                      },
                      onTimeout: () => {
                        toast.warning('Confirmation timeout', {
                          description: 'Transaction may still be pending. Please sync manually.'
                        });
                      },
                    });
                  } catch (err) {
                    handleError(err);
                    setEscrowProcessing(false);
                  }
                }}
                onArbiterRelease={async () => {
                  setEscrowProcessing(true);
                  try {
                    await escrowController.executeArbiterResolve({ escrow, invoice, decision: 'release' });
                    setEscrowProcessing(false);
                    escrowPoller.startPolling({
                      invoice,
                      escrowId: escrow.escrowId,
                      operation: 'arbiter_resolve',
                      decision: 'release',
                      onConfirmed: () => {
                        toast.success('Arbiter released funds to seller!');
                      },
                      onTimeout: () => {
                        toast.warning('Confirmation timeout', {
                          description: 'Transaction may still be pending. Please sync manually.'
                        });
                      },
                    });
                  } catch (err) {
                    handleError(err);
                    setEscrowProcessing(false);
                  }
                }}
                onArbiterRefund={async () => {
                  setEscrowProcessing(true);
                  try {
                    await escrowController.executeArbiterResolve({ escrow, invoice, decision: 'refund' });
                    setEscrowProcessing(false);
                    escrowPoller.startPolling({
                      invoice,
                      escrowId: escrow.escrowId,
                      operation: 'arbiter_resolve',
                      decision: 'refund',
                      onConfirmed: () => {
                        toast.success('Arbiter refunded payment to buyer!');
                      },
                      onTimeout: () => {
                        toast.warning('Confirmation timeout', {
                          description: 'Transaction may still be pending. Please sync manually.'
                        });
                      },
                    });
                  } catch (err) {
                    handleError(err);
                    setEscrowProcessing(false);
                  }
                }}
              />
            </div>
          );
        })()}

        {/* Wallet operation progress — Pay / Cancel / Escrow Pay / AutoPoller confirmation */}
        {(isProcessing || escrowProcessing || invoicePoller.isPolling || (isSyncing && invoice.status === InvoiceStatus.PENDING)) && (
          <div className="mt-4">
            <WalletOperationProgress
              isProving={(isProcessing || escrowProcessing) && !invoicePoller.isPolling && !isSyncing}
              txProgress={txProgress}
              txLog={txCurrentLog}
              isConfirming={invoicePoller.isPolling || isSyncing}
              pollLog={invoicePoller.isPolling ? invoicePoller.pollLog : t('walletProgress.confirmingOnChainDesc')}
              operationLabel={
                isSyncing && !isProcessing && !escrowProcessing
                  ? t('walletProgress.confirmingOnChain')
                  : escrowProcessing
                  ? t('walletProgress.lockingEscrow')
                  : walletOp === 'cancelling'
                  ? t('walletProgress.cancellingInvoice')
                  : t('walletProgress.processingPayment')
              }
            />
          </div>
        )}

        {/* Dispute Form (only available for buyer when ESCROWED, hosted inside EscrowStatusCard) */}
        {showDisputeForm && invoice.status === InvoiceStatus.ESCROWED && userRole === 'buyer' && (
          <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50/50 p-4">
            <DisputeForm
              invoice={invoice}
              arbiter={escrows.find(e => e.invoiceId === invoice.id)?.arbiter}
              onSubmit={async (params) => {
                await disputeController.executeRaiseDispute({ invoice, ...params });
                setShowDisputeForm(false);
                router.push('/disputes');
              }}
              onCancel={() => setShowDisputeForm(false)}
              txProgress={txProgress}
              txLog={txCurrentLog}
            />
          </div>
        )}

        {/* Arbiter info for buyer (visible before paying) */}
        {invoice.status === InvoiceStatus.PENDING && userRole === 'buyer' && chainArbiter && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-purple-50 border border-purple-200 p-3">
            <Shield className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
            <div className="text-xs text-purple-800">
              <p className="font-medium">{t('invoice.detail.arbiterSetBySeller')}</p>
              <code className="mt-1 block bg-purple-100 px-1.5 py-0.5 rounded text-purple-900 break-all">
                {chainArbiter}
              </code>
            </div>
          </div>
        )}

        {/* Action Buttons - Role-based (hidden while escrow tx is in flight) */}
        {invoice.status === InvoiceStatus.PENDING && !escrowProcessing && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-amber-100">
            {userRole === 'buyer' && (
              <>
                {(() => {
                  const hasActiveEscrow = escrows.some(e => e.invoiceId === invoice.id);
                  return (
                    <>
                      <button
                        onClick={async () => {
                          setWalletOp('paying');
                          const ok = await handlePay();
                          if (ok && invoice) {
                            invoicePoller.startPolling({
                              invoiceId: invoice.id,
                              invoiceHash: invoice.invoiceHash,
                              expectedStatus: InvoiceStatus.PAID,
                              onConfirmed: () => { setWalletOp('idle'); toast.success(t('invoice.detail.statusPaidMessage')); },
                              onTimeout: () => { setWalletOp('idle'); toast.warning(t('walletProgress.timeoutTitle'), { description: t('walletProgress.timeoutDesc') }); },
                            });
                          } else {
                            setWalletOp('idle');
                          }
                        }}
                        disabled={isProcessing || !isConfirmed || escrowProcessing || hasActiveEscrow || invoicePoller.isPolling}
                        className="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isProcessing
                          ? t('common.loading')
                          : (invoice.currencyFlag === CurrencyFlag.USDCX ? t('invoice.detail.approveAndPay') : `💳 ${t('invoice.detail.payButton')}`)}
                      </button>
                      {chainArbiter ? (
                        <button
                          onClick={async () => {
                            setEscrowProcessing(true);
                            try {
                              const deadline = new Date(invoice.dueDate);
                              deadline.setDate(deadline.getDate() + 7);
                              await escrowController.executeEscrowPayment({
                                invoice,
                                escrowConfig: {
                                  deliveryDeadline: deadline,
                                  autoRelease: false,
                                  arbiter: chainArbiter as AleoAddress,
                                  releaseConditionHash: '0field' as AleoField,
                                },
                              });
                              invoicePoller.startPolling({
                                invoiceId: invoice.id,
                                invoiceHash: invoice.invoiceHash,
                                expectedStatus: InvoiceStatus.ESCROWED,
                                onConfirmed: () => { setEscrowProcessing(false); toast.success(t('escrow.lockedSuccess')); },
                                onTimeout: () => { setEscrowProcessing(false); toast.warning(t('walletProgress.timeoutTitle'), { description: t('walletProgress.timeoutDesc') }); },
                              });
                            } catch (err) {
                              handleError(err);
                              setEscrowProcessing(false);
                            }
                          }}
                          disabled={isProcessing || !isConfirmed || escrowProcessing || hasActiveEscrow}
                          className="rounded-lg border-2 border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title={t('escrow.lockPaymentHint')}
                        >
                          <Lock className="inline h-4 w-4 mr-1 -mt-0.5" />
                          {escrowProcessing ? t('common.loading') : t('invoice.detail.lockPayment')}
                        </button>
                      ) : (
                        <button
                          disabled
                          className="rounded-lg border-2 border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-400 cursor-not-allowed"
                          title={t('invoice.detail.arbiterNotSet')}
                        >
                          <Lock className="inline h-4 w-4 mr-1 -mt-0.5" />
                          {t('invoice.detail.lockPayment')}
                        </button>
                      )}
                    </>
                  );
                })()}
              </>
            )}
            {userRole === 'seller' && (
              <button
                onClick={async () => {
                  setWalletOp('cancelling');
                  const ok = await handleCancel();
                  if (ok && invoice) {
                    invoicePoller.startPolling({
                      invoiceId: invoice.id,
                      invoiceHash: invoice.invoiceHash,
                      expectedStatus: InvoiceStatus.CANCELLED,
                      onConfirmed: () => { setWalletOp('idle'); toast.success(t('invoice.detail.statusCancelledMessage')); },
                      onTimeout: () => { setWalletOp('idle'); toast.warning(t('walletProgress.timeoutTitle'), { description: t('walletProgress.timeoutDesc') }); },
                    });
                  } else {
                    setWalletOp('idle');
                  }
                }}
                disabled={isProcessing || !isConfirmed || invoicePoller.isPolling}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing ? t('common.loading') : `❌ ${t('invoice.detail.cancelButton')}`}
              </button>
            )}
            {userRole === 'unknown' && (
              <div className="flex-1 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 text-center">
                ⚠️ {t('invoice.detail.notBuyerOrSeller')}
              </div>
            )}
          </div>
        )}
        
        {invoice.status !== InvoiceStatus.PENDING && invoice.status !== InvoiceStatus.ESCROWED && (
          <div className="mt-4 pt-4 border-t border-amber-100">
            <div className="text-sm text-slate-600 text-center">
              {invoice.status === InvoiceStatus.PAID && `✅ ${t('invoice.detail.statusPaidMessage')}`}
              {invoice.status === InvoiceStatus.CANCELLED && `❌ ${t('invoice.detail.statusCancelledMessage')}`}
              {invoice.status === InvoiceStatus.EXPIRED && `⚠️ ${t('invoice.detail.statusExpiredMessage')}`}
              {invoice.status === InvoiceStatus.DISPUTED && (() => {
                const relDispute = disputes.find((d) => d.invoiceId === invoice.id);
                return (
                  <div className="space-y-2">
                    <p>⚠️ {t('invoice.detail.statusDisputedMessage')}</p>
                    {relDispute && (
                      <Link
                        href={`/disputes/${encodeURIComponent(relDispute.disputeId)}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-200 transition-colors"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {t('dispute.viewDispute')}
                      </Link>
                    )}
                  </div>
                );
              })()}
              {invoice.status === InvoiceStatus.REFUNDED && `↩️ ${t('invoice.detail.statusRefundedMessage')}`}
              {invoice.status === InvoiceStatus.RESOLVED_CANCELLED && `❌ ${t('invoice.detail.statusResolvedCancelledMessage')}`}
              {invoice.status === InvoiceStatus.RESOLVED_PAID && `✅ ${t('invoice.detail.statusResolvedPaidMessage')}`}
            </div>
          </div>
        )}

        {invoice.status === InvoiceStatus.ESCROWED && (
          <div className="mt-4 pt-4 border-t border-amber-100">
            <div className="text-sm text-slate-600 text-center">
              🔒 {t('invoice.detail.statusEscrowedMessage')}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
