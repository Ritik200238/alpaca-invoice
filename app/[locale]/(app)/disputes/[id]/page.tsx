'use client';

import { useParams, useRouter } from 'next/navigation';
import { useDisputeStore } from '@/stores/Dispute/useDisputeStore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useEscrowStore } from '@/stores/Escrow/useEscrowStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { useDisputeController } from '@/controller/Dispute/useDisputeController';
import { useEscrowController } from '@/controller/Escrow/useEscrowController';
import { useEscrowStatusPoller } from '@/controller/Escrow/useEscrowStatusPoller';
import { useDisputeEscrowChainSync } from '@/controller/Dispute/useDisputeEscrowChainSync';
import { useTransactionStore } from '@/stores/Transaction/useTransactionStore';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Scale, Gavel, AlertTriangle, CheckCircle, XCircle, MessageSquareText, Clock, Users, Store } from 'lucide-react';
import { DisputeStatus, InvoiceStatus } from '@/lib/types';
import type { AleoField } from '@/lib/types';
import { useEffect, useMemo, useState } from 'react';
import { cn, cleanAleoNumber } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { PROGRAM_ID_V4 } from '@/lib/contract';
import WalletOperationProgress from '@/components/wallet-operation-progress';

function truncateAddr(addr: string) {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

export default function DisputeDetailPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const disputeId = decodeURIComponent(params.id as string) as AleoField;
  const { disputes } = useDisputeStore();
  const { invoices } = useInvoiceStore();
  const { escrows } = useEscrowStore();
  const publicKey = useUserStore((s) => s.publicKey);
  const controller = useDisputeController();
  const escrowController = useEscrowController();
  const escrowPoller = useEscrowStatusPoller();
  const { syncFromChain } = useDisputeEscrowChainSync();
  const { progress: txProgress, logs: txLogs } = useTransactionStore();
  const txCurrentLog = txLogs[txLogs.length - 1] ?? '';
  const protocolService = useMemo(() => new AleoProtocolService(), []);
  const [resolving, setResolving] = useState(false);
  const [resolveStep, setResolveStep] = useState<'' | 'dismiss' | 'step1' | 'step2' | 'polling' | 'done'>('');
  const [error, setError] = useState('');
  const [reasonText, setReasonText] = useState<string | null>(null);

  useEffect(() => {
    if (publicKey) syncFromChain();
  }, [publicKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const dispute = disputes.find((d) => d.disputeId === disputeId);

  useEffect(() => {
    if (!dispute) return;
    if (dispute.reasonText) {
      setReasonText(dispute.reasonText);
      return;
    }
    // Check if any other local dispute for the same invoice has reasonText
    const siblingWithReason = disputes.find(
      (d) => d.invoiceId === dispute.invoiceId && d.reasonText
    );
    if (siblingWithReason?.reasonText) {
      setReasonText(siblingWithReason.reasonText);
      return;
    }
    // Fallback: fetch from server-side KV
    fetch(`/api/dispute-reason?invoiceId=${encodeURIComponent(dispute.invoiceId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.reasonText) setReasonText(data.reasonText);
      })
      .catch(() => {});
  }, [dispute?.disputeId, dispute?.invoiceId, dispute?.reasonText, disputes]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dispute) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-slate-500">{t('dispute.notFound')}</p>
        <button
          onClick={() => router.push('/disputes')}
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          {t('dispute.backToDisputes')}
        </button>
      </div>
    );
  }

  const relatedInvoice = invoices.find((inv) => inv.id === dispute.invoiceId);
  const relatedEscrow = escrows.find((e) => e.invoiceId === dispute.invoiceId);
  const isArbiter = publicKey === dispute.arbiter;
  const isDisputant = publicKey === dispute.disputant;
  const isSeller = !isArbiter && !isDisputant && relatedInvoice?.seller === publicKey;
  const isOpen = dispute.status === DisputeStatus.OPEN;

  const amount = relatedEscrow
    ? (Number(relatedEscrow.amount) / 1_000_000).toLocaleString()
    : relatedInvoice
    ? (Number(relatedInvoice.amount) / 1_000_000).toLocaleString()
    : null;

  const statusConfig = isOpen
    ? { label: t('dispute.statusOpen'), color: 'bg-amber-100 text-amber-700', icon: <Clock className="h-3.5 w-3.5" /> }
    : dispute.status === DisputeStatus.RESOLVED_PAY
    ? { label: t('dispute.resolvedPay'), color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle className="h-3.5 w-3.5" /> }
    : { label: t('dispute.resolvedCancelStatus'), color: 'bg-amber-100 text-amber-700', icon: <XCircle className="h-3.5 w-3.5" /> };

  const handleResolve = async (resolution: DisputeStatus.RESOLVED_CANCEL | DisputeStatus.RESOLVED_PAY) => {
    if (!isArbiter) {
      setError(t('dispute.errorNotArbiter'));
      return;
    }
    setResolving(true);
    setError('');

    // Pre-check: verify the dispute hasn't already been resolved on chain
    try {
      const chainStatus = await protocolService.getProgramMappingValue(
        PROGRAM_ID_V4, 'dispute_status', dispute.disputeId
      ).catch(() => null);
      if (chainStatus) {
        const statusNum = Number(cleanAleoNumber(chainStatus.replace(/"/g, '').trim()));
        if (statusNum === DisputeStatus.RESOLVED_CANCEL || statusNum === DisputeStatus.RESOLVED_PAY) {
          useDisputeStore.getState().updateDispute(dispute.disputeId, {
            status: statusNum as DisputeStatus,
          });
          setResolving(false);
          toast.info(statusNum === DisputeStatus.RESOLVED_PAY
            ? t('dispute.resolveUpheldSuccess')
            : t('dispute.resolveDismissedSuccess'));
          return;
        }
      }
    } catch {
      // Non-fatal: continue with the resolve attempt
    }

    const invoiceProxy = relatedInvoice ?? { id: dispute.invoiceId } as any;
    const isUphold = resolution === DisputeStatus.RESOLVED_PAY;
    let currentStep: 'step1' | 'step2' = 'step1';

    try {
      setResolveStep(isUphold ? 'step1' : 'dismiss');
      await controller.executeResolveDispute({ dispute, invoice: invoiceProxy, resolution });

      if (isUphold) {
        // Step 2 (Uphold only): Refund buyer via arbiter_resolve(REFUND)
        currentStep = 'step2';
        setResolveStep('step2');

        if (!relatedEscrow) {
          setError(t('dispute.resolveStep2Failed'));
          setResolving(false);
          setResolveStep('');
          return;
        }

        await escrowController.executeArbiterResolve({
          escrow: relatedEscrow,
          invoice: invoiceProxy,
          decision: 'refund',
        });

        setResolveStep('polling');
        escrowPoller.startPolling({
          invoice: { ...invoiceProxy, status: InvoiceStatus.DISPUTED },
          escrowId: relatedEscrow.escrowId,
          operation: 'dispute_uphold',
          decision: 'refund',
          onConfirmed: () => {
            useDisputeStore.getState().updateDispute(dispute.disputeId, { status: DisputeStatus.RESOLVED_PAY });
            setResolveStep('done');
            setResolving(false);
            toast.success(t('dispute.resolveUpheldSuccess'));
          },
          onTimeout: () => {
            setResolveStep('done');
            setResolving(false);
            toast.warning(t('walletProgress.timeoutTitle'), { description: t('walletProgress.timeoutDesc') });
          },
        });
      } else {
        // Dismiss: poll for RESOLVED_CANCELLED status
        setResolveStep('polling');
        if (relatedEscrow) {
          escrowPoller.startPolling({
            invoice: { ...invoiceProxy, status: InvoiceStatus.DISPUTED },
            escrowId: relatedEscrow.escrowId,
            operation: 'dispute_dismiss',
            onConfirmed: () => {
              useDisputeStore.getState().updateDispute(dispute.disputeId, { status: DisputeStatus.RESOLVED_CANCEL });
              setResolveStep('done');
              setResolving(false);
              toast.success(t('dispute.resolveDismissedSuccess'));
            },
            onTimeout: () => {
              setResolveStep('done');
              setResolving(false);
              toast.warning(t('walletProgress.timeoutTitle'), { description: t('walletProgress.timeoutDesc') });
            },
          });
        } else {
          setResolveStep('done');
          setResolving(false);
          toast.success(t('dispute.resolveDismissedSuccess'));
        }
      }
    } catch (err) {
      console.error('Resolve dispute failed:', err);
      const msg = err instanceof Error ? err.message : 'Failed to resolve dispute';
      setError(currentStep === 'step2' ? t('dispute.resolveStep2Failed') : msg);
      setResolving(false);
      setResolveStep('');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button
        onClick={() => router.push('/disputes')}
        className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('dispute.backToDisputes')}
      </button>

      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl',
              isOpen ? 'bg-amber-100' : 'bg-slate-100'
            )}>
              <AlertTriangle className={cn('h-5 w-5', isOpen ? 'text-amber-600' : 'text-slate-500')} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{t('dispute.detail')}</h1>
              {amount && (
                <p className="text-sm font-medium text-slate-600">{amount} Credits</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isArbiter && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                <Gavel className="h-3 w-3" />
                {t('dispute.roleArbiter')}
              </span>
            )}
            {isDisputant && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                <AlertTriangle className="h-3 w-3" />
                {t('dispute.roleDisputant')}
              </span>
            )}
            {isSeller && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <Store className="h-3 w-3" />
                {t('dispute.roleSeller')}
              </span>
            )}
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', statusConfig.color)}>
              {statusConfig.icon}
              {statusConfig.label}
            </span>
          </div>
        </div>

        {/* Reason */}
        {reasonText && (
          <div className="mt-4 rounded-xl border border-amber-200/60 bg-amber-50/50 p-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-700">
              <MessageSquareText className="h-3.5 w-3.5" />
              {t('dispute.reason')}
            </div>
            <p className="text-sm leading-relaxed text-slate-800">{reasonText}</p>
          </div>
        )}

        {/* Key info grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">{t('dispute.disputant')}</p>
            <p className="mt-0.5 font-medium text-slate-800">
              {truncateAddr(dispute.disputant)}
              {isDisputant && <span className="ml-1 text-xs text-blue-600">({t('dispute.you')})</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t('dispute.arbiterLabel')}</p>
            <p className="mt-0.5 font-medium text-slate-800">
              {truncateAddr(dispute.arbiter)}
              {isArbiter && <span className="ml-1 text-xs text-purple-600">({t('dispute.you')})</span>}
            </p>
          </div>
          {relatedInvoice && (
            <div>
              <p className="text-xs text-slate-500">{t('invoice.detail.seller')}</p>
              <p className="mt-0.5 font-medium text-slate-800">
                {truncateAddr(relatedInvoice.seller)}
                {isSeller && <span className="ml-1 text-xs text-emerald-600">({t('dispute.you')})</span>}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-500">{t('dispute.createdAt')}</p>
            <p className="mt-0.5 text-slate-800">{format(dispute.createdAt, 'yyyy-MM-dd HH:mm')}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t('dispute.resolutionDeadline')}</p>
            <p className="mt-0.5 text-slate-800">{format(dispute.resolutionDeadline, 'yyyy-MM-dd HH:mm')}</p>
          </div>
        </div>

        {/* Invoice link */}
        {relatedInvoice && (
          <button
            onClick={() => router.push(`/invoices/${relatedInvoice.invoiceHash}`)}
            className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            {t('dispute.viewInvoice')} →
          </button>
        )}
      </div>

      {/* Resolve actions — only for arbiter */}
      {isOpen && isArbiter && (
        <div className="rounded-2xl border-2 border-purple-200 bg-purple-50/50 p-5 shadow-sm">
          <h2 className="mb-1.5 flex items-center gap-2 text-base font-semibold text-purple-900">
            <Scale className="h-5 w-5" />
            {t('dispute.resolve')}
          </h2>
          <p className="mb-4 text-sm text-purple-700">
            {t('dispute.resolveArbiterDesc')}
          </p>
          {error && (
            <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>
          )}

          {resolving && resolveStep && (
            <div className="mb-4">
              <WalletOperationProgress
                isProving={resolveStep !== 'polling' && resolveStep !== 'done'}
                txProgress={txProgress}
                txLog={txCurrentLog}
                isConfirming={resolveStep === 'polling'}
                pollLog={escrowPoller.pollLog}
                operationLabel={
                  resolveStep === 'dismiss'
                    ? t('dispute.resolvingDismiss')
                    : resolveStep === 'step2'
                    ? t('walletProgress.refundingBuyer')
                    : t('walletProgress.resolvingDispute')
                }
                stepLabel={
                  resolveStep === 'step1' ? 'Step 1 / 2'
                  : resolveStep === 'step2' ? 'Step 2 / 2'
                  : undefined
                }
              />
            </div>
          )}

          <div className="flex gap-3">
            <button
              disabled={resolving}
              onClick={() => handleResolve(DisputeStatus.RESOLVED_CANCEL)}
              className="flex-1 rounded-lg border border-red-300 bg-red-50 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('dispute.dismissCancel')}
            </button>
            <button
              disabled={resolving}
              onClick={() => handleResolve(DisputeStatus.RESOLVED_PAY)}
              className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('dispute.upholdPay')}
            </button>
          </div>
        </div>
      )}

      {/* Post-resolution explanation */}
      {!isOpen && dispute.status === DisputeStatus.RESOLVED_CANCEL && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="h-5 w-5 text-amber-600" />
            <h3 className="font-semibold text-amber-900">{t('dispute.resolvedCancelStatus')}</h3>
          </div>
          <p className="text-sm text-amber-800">{t('dispute.dismissedExplanation')}</p>
        </div>
      )}
      {!isOpen && dispute.status === DisputeStatus.RESOLVED_PAY && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            <h3 className="font-semibold text-emerald-900">{t('dispute.resolvedPay')}</h3>
          </div>
          <p className="text-sm text-emerald-800">{t('dispute.upheldExplanation')}</p>
        </div>
      )}

      {/* Non-arbiter waiting notice */}
      {isOpen && !isArbiter && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
          <Users className="h-7 w-7 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-600">{t('dispute.waitingForArbiter')}</p>
          <p className="text-xs text-slate-500 mt-1">
            {t('dispute.arbiterLabel')}: {truncateAddr(dispute.arbiter)}
          </p>
        </div>
      )}
    </div>
  );
}
