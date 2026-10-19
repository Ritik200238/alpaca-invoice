'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import { useInvoicesPageController } from '@/controller/Invoice/useInvoicesPageController';
import { useAuthCheck } from '@/controller/Auth/useAuthCheck';
import InvoiceCard from '@/components/invoice-card';
import ConnectWalletCard from '@/components/connect-wallet-card';
import { EmptyState } from '@/components/ui/empty-state';
import { MotionContainer, MotionItem } from '@/components/ui/motion';
import {
  FilePlus,
  RefreshCw,
  Loader2,
  Shield,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { useTransactionStore } from '@/stores/Transaction/useTransactionStore';
import type { InvoiceListFilter } from '@/controller/Invoice/IInvoices';

export default function InvoicesPage() {
  const t = useTranslations();
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">{t('invoice.list.loading')}</div>}>
      <InvoicesPageInner />
    </Suspense>
  );
}

function InvoicesPageInner() {
  const t = useTranslations();
  const tabs: Array<{ key: InvoiceListFilter; label: string }> = [
    { key: 'all', label: t('invoice.list.filterAll') },
    { key: 'pending', label: t('invoice.list.filterPending') },
    { key: 'paid', label: t('invoice.list.filterPaid') },
    { key: 'escrowed', label: t('invoice.list.filterEscrowed') },
    { key: 'cancelled', label: t('invoice.list.filterCancelled') },
    { key: 'resolved', label: t('invoice.list.filterResolved') },
  ];
  const roleTabs: Array<{ key: 'all' | 'sent' | 'received'; label: string }> = [
    { key: 'all', label: t('invoice.list.roleAll') },
    { key: 'sent', label: t('invoice.list.roleSent') },
    { key: 'received', label: t('invoice.list.roleReceived') },
  ];
  const { isAuthRequired, handleUnlock } = useAuthCheck();
  const {
    displayInvoices,
    filter,
    search,
    isLoading,
    isSyncing,
    showLoading,
    showWalletPrompt,
    showMainContent,
    setFilter,
    setSearch,
    handleSyncAll,
    isInvoiceProcessing,
    isInvoiceSyncing,
    roleFilter,
    handleRoleChange,
    exportCsv,
    handlePayWithGuard,
    handleCancelWithGuard,
    getExplorerUrl
  } = useInvoicesPageController();
  const { progress: txProgress, logs: txLogs } = useTransactionStore();
  const txCurrentLog = txLogs[txLogs.length - 1] ?? '';

  // Authorization modal
  if (isAuthRequired) {
    return (
      <div className="flex min-h-[400px] items-center justify-center" data-tour="invoice-list">
        <MotionContainer>
          <MotionItem className="surface-card p-8 text-center">
          <div className="relative mx-auto mb-4 h-20 w-20">
            <Image
              src="/images/mascot/mascot-shield.png"
              alt="Unlock"
              fill
              className="object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-100/80 ring-1 ring-accent-200/40">
            <Shield className="h-6 w-6 text-accent-600" />
          </div>
          <h3 className="text-lg font-semibold text-primary-900">{t('wallet.unlockTitle')}</h3>
          <p className="mt-2 text-sm text-primary-500">
            {t('wallet.unlockDescription')}
          </p>
          <button
            onClick={handleUnlock}
            disabled={isLoading}
            className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              t('wallet.unlock')
            )}
          </button>
          </MotionItem>
        </MotionContainer>
      </div>
    );
  }

  // Loading state
  if (showLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center" data-tour="invoice-list">
        <MotionContainer>
          <MotionItem className="text-center">
          <div className="relative mx-auto mb-4 h-20 w-20">
            <Image
              src="/images/mascot/mascot-thinking.png"
              alt="Loading"
              fill
              className="animate-pulse object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100/80 ring-1 ring-primary-200/40">
            <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
          </div>
          <p className="text-sm text-primary-500">{t('invoice.list.loading')}</p>
          </MotionItem>
        </MotionContainer>
      </div>
    );
  }

  // Wallet connection prompt
  if (showWalletPrompt) {
    return <ConnectWalletCard />;
  }

  if (!showMainContent) {
    return <div data-tour="invoice-list" />;
  }

  return (
    <div data-tour="invoice-list">
    <MotionContainer className="space-y-6">
      {/* Actions */}
      <MotionItem className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex overflow-hidden rounded-lg border border-slate-200">
          {roleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleRoleChange(tab.key)}
              className={cn(
                'px-3 py-2 text-sm font-semibold transition-colors',
                roleFilter === tab.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Link
          href="/invoices/create"
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-accent-600"
        >
          <FilePlus className="h-4 w-4" />
          {t('invoice.list.createFirst')}
        </Link>
        <button
          onClick={handleSyncAll}
          disabled={isSyncing || isLoading}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-primary-200/60 bg-white/70 px-4 py-2.5 text-sm font-medium text-primary-700 shadow-sm transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          title={t('common.sync')}
        >
          <RefreshCw className={cn('h-4 w-4', isSyncing && 'animate-spin')} />
          {isSyncing ? t('common.syncing') : t('common.sync')}
        </button>
        <button
          onClick={exportCsv}
          disabled={!displayInvoices.length}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          title={t('invoice.list.exportCsv')}
        >
          {t('invoice.list.exportCsv')}
        </button>
      </MotionItem>

      {/* Filter tabs */}
      <MotionItem className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer',
              filter === tab.key
                ? 'bg-primary-900 text-white shadow-[0_12px_26px_-18px_rgba(15,23,42,0.5)]'
                : 'bg-primary-100/80 text-primary-700 hover:bg-primary-200/80'
            )}
          >
            {tab.label}
          </button>
        ))}
      </MotionItem>

      {/* Search */}
      <MotionItem>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('invoice.list.searchPlaceholder')}
          className="max-w-md"
        />
      </MotionItem>

      {/* Invoice list */}
      {displayInvoices.length === 0 ? (
        <MotionItem className="surface-card p-8">
          <EmptyState
            icon={FileText}
            mascot="sleeping"
            title={t('invoice.list.emptyTitle')}
            description={search ? t('invoice.list.emptySearchDescription') : t('invoice.list.emptyDescription')}
            action={
              !search && (
                <Link
                  href="/invoices/create"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-accent-600"
                >
                  <FilePlus className="h-4 w-4" />
                  {t('invoice.list.createFirst')}
                </Link>
              )
            }
          />
        </MotionItem>
      ) : (
        <MotionContainer className="grid gap-4 md:grid-cols-2" stagger={0.06}>
          {displayInvoices.map(({ invoice, role, chainStatus, statusConfig }) => {
            const isProcessing = isInvoiceProcessing(invoice.id);
            const isSyncingInvoice = isInvoiceSyncing(invoice);

            return (
              <MotionItem key={invoice.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-primary-500">
                    {role === 'BOTH'
                      ? t('invoice.detail.roleBoth')
                      : role === 'SELLER'
                        ? t('invoice.detail.roleAsSeller')
                        : role === 'BUYER'
                          ? t('invoice.detail.roleAsBuyer')
                          : t('invoice.detail.roleUnrelated')}
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-white/60',
                      chainStatus === 'CONFIRMED'
                        ? 'bg-success-100/80 text-success-700'
                        : 'bg-warning-50/80 text-warning-700'
                    )}
                  >
                    {chainStatus === 'CONFIRMED' ? t('invoice.detail.confirmed') : t('invoice.detail.sending')}
                  </span>
                </div>
                <InvoiceCard
                  invoice={invoice}
                  role={role}
                  statusConfig={statusConfig}
                  isLoading={isLoading}
                  isProcessing={isProcessing}
                  isSyncing={isSyncingInvoice}
                  explorerTxUrl={getExplorerUrl(invoice)}
                  txProgress={isProcessing ? txProgress : 0}
                  txLog={isProcessing ? txCurrentLog : ''}
                  onPay={(inv) => handlePayWithGuard(inv, chainStatus)}
                  onCancel={(inv) => handleCancelWithGuard(inv, chainStatus)}
                />
              </MotionItem>
            );
          })}
        </MotionContainer>
      )}
    </MotionContainer>
    </div>
  );
}
