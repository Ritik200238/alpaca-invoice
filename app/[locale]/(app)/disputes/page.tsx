'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDisputeStore } from '@/stores/Dispute/useDisputeStore';
import { useEscrowStore } from '@/stores/Escrow/useEscrowStore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { useDisputeEscrowChainSync } from '@/controller/Dispute/useDisputeEscrowChainSync';
import ConnectWalletCard from '@/components/connect-wallet-card';
import { AlertTriangle, ArrowRight, Gavel, Scale, User, Shield, RefreshCw, Store } from 'lucide-react';
import Link from 'next/link';
import { DisputeStatus, InvoiceStatus } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type TabKey = 'all' | 'my_disputes' | 'pending_arbitration';

function truncateAddr(addr: string) {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

export default function DisputesPage() {
  const t = useTranslations();
  const { disputes } = useDisputeStore();
  const { escrows } = useEscrowStore();
  const { invoices } = useInvoiceStore();
  const publicKey = useUserStore((s) => s.publicKey);
  const { syncFromChain, isSyncing, lastSyncAt } = useDisputeEscrowChainSync();
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  const myDisputes = useMemo(
    () => disputes.filter((d) => d.disputant === publicKey),
    [disputes, publicKey]
  );

  const pendingArbitration = useMemo(
    () => disputes.filter((d) => d.arbiter === publicKey && d.status === DisputeStatus.OPEN),
    [disputes, publicKey]
  );

  const filtered = activeTab === 'my_disputes' ? myDisputes : activeTab === 'pending_arbitration' ? pendingArbitration : disputes;

  useEffect(() => {
    if (publicKey) {
      syncFromChain();
    }
  }, [publicKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!publicKey) {
    return <ConnectWalletCard />;
  }

  const tabs: { key: TabKey; label: string; count: number; icon: React.ReactNode }[] = [
    { key: 'all', label: t('dispute.tabAll'), count: disputes.length, icon: <AlertTriangle className="h-4 w-4" /> },
    { key: 'my_disputes', label: t('dispute.tabMyDisputes'), count: myDisputes.length, icon: <User className="h-4 w-4" /> },
    { key: 'pending_arbitration', label: t('dispute.tabPendingArbitration'), count: pendingArbitration.length, icon: <Gavel className="h-4 w-4" /> },
  ];

  const statusLabels: Record<number, { text: string; className: string }> = {
    [DisputeStatus.OPEN]: { text: t('dispute.statusOpen'), className: 'bg-amber-100 text-amber-700' },
    [DisputeStatus.RESOLVED_CANCEL]: { text: t('dispute.resolvedCancelStatus'), className: 'bg-amber-100 text-amber-700' },
    [DisputeStatus.RESOLVED_PAY]: { text: t('dispute.resolvedPay'), className: 'bg-emerald-100 text-emerald-700' },
  };

  const getRole = (d: typeof disputes[0]) => {
    if (d.disputant === publicKey) return 'disputant';
    if (d.arbiter === publicKey) return 'arbiter';
    const inv = invoices.find((inv) => inv.id === d.invoiceId);
    if (inv && inv.seller === publicKey) return 'seller';
    return 'observer';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('dispute.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('dispute.pageDescription')}</p>
        </div>
        <div className="flex items-center gap-2">
          {lastSyncAt && (
            <span className="text-xs text-slate-400">
              {t('dispute.lastSync')}: {lastSyncAt.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => syncFromChain()}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
            {isSyncing ? t('common.syncing') : t('dispute.syncChain')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all',
              activeTab === tab.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span className={cn(
                'ml-1 rounded-full px-1.5 py-0.5 text-xs font-semibold',
                activeTab === tab.key ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Pending arbitration alert */}
      {pendingArbitration.length > 0 && activeTab !== 'pending_arbitration' && (
        <button
          onClick={() => setActiveTab('pending_arbitration')}
          className="w-full flex items-center gap-3 rounded-xl border-2 border-purple-200 bg-purple-50 p-4 text-left transition-colors hover:bg-purple-100"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100">
            <Gavel className="h-5 w-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-purple-900">
              {t('dispute.arbitrationPendingAlert', { count: pendingArbitration.length })}
            </p>
            <p className="text-xs text-purple-700 mt-0.5">
              {t('dispute.arbitrationPendingDesc')}
            </p>
          </div>
          <ArrowRight className="h-5 w-5 text-purple-400" />
        </button>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            {activeTab === 'pending_arbitration'
              ? <Gavel className="h-8 w-8 text-slate-400" />
              : <AlertTriangle className="h-8 w-8 text-slate-400" />}
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-700">
            {activeTab === 'pending_arbitration' ? t('dispute.noArbitrationPending') : t('dispute.emptyTitle')}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {activeTab === 'pending_arbitration' ? t('dispute.noArbitrationPendingDesc') : t('dispute.emptyDescription')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((dispute) => {
            const status = statusLabels[dispute.status] ?? statusLabels[0];
            const role = getRole(dispute);
            const relatedInvoice = invoices.find((inv) => inv.id === dispute.invoiceId);
            const relatedEscrow = escrows.find((e) => e.invoiceId === dispute.invoiceId);
            const amount = relatedEscrow
              ? `${(Number(relatedEscrow.amount) / 1_000_000).toLocaleString()} Credits`
              : relatedInvoice
              ? `${(Number(relatedInvoice.amount) / 1_000_000).toLocaleString()} Credits`
              : null;

            return (
              <Link
                key={dispute.disputeId}
                href={`/disputes/${encodeURIComponent(dispute.disputeId)}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md"
              >
                  <div className="flex items-center gap-4">
                  <div className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg',
                    role === 'arbiter' ? 'bg-purple-100' : role === 'seller' ? 'bg-emerald-100' : 'bg-amber-100'
                  )}>
                    {role === 'arbiter'
                      ? <Gavel className="h-5 w-5 text-purple-600" />
                      : role === 'seller'
                      ? <Store className="h-5 w-5 text-emerald-600" />
                      : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {t('dispute.invoiceLabel')} {dispute.invoiceId.slice(0, 12)}…
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        role === 'arbiter' ? 'bg-purple-100 text-purple-700'
                          : role === 'disputant' ? 'bg-blue-100 text-blue-700'
                          : role === 'seller' ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      )}>
                        {role === 'arbiter' && <><Gavel className="h-2.5 w-2.5" /> {t('dispute.roleArbiter')}</>}
                        {role === 'disputant' && <><User className="h-2.5 w-2.5" /> {t('dispute.roleDisputant')}</>}
                        {role === 'seller' && <><Store className="h-2.5 w-2.5" /> {t('dispute.roleSeller')}</>}
                        {role === 'observer' && <><Shield className="h-2.5 w-2.5" /> {t('dispute.roleObserver')}</>}
                      </span>
                      {amount && (
                        <span className="text-xs text-slate-500">{amount}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t('dispute.raisedAt')} {dispute.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                    {status.text}
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
