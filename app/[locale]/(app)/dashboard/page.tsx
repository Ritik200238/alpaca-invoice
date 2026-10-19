'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import InvoiceCard from '@/components/invoice-card';
import CreditDashboardCard from '@/components/credit-dashboard-card';
import ConnectWalletCard from '@/components/connect-wallet-card';
import { EmptyState } from '@/components/ui/empty-state';
import { useInvoices } from '@/controller/Invoice/useInvoices';
import { useCreditProof } from '@/controller/Credit/useCreditProof';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { InvoiceStatus } from '@/lib/types';
import type { AuditKey } from '@/lib/types';
import { listAuditKeys } from '@/lib/storage';
import { MotionContainer, MotionItem } from '@/components/ui/motion';
import {
  Send,
  Inbox,
  Clock,
  CheckCircle,
  FilePlus,
  CreditCard,
  Receipt,
  Search,
  ArrowRight,
  Loader2,
  RefreshCw,
  PieChart as PieChartIcon,
  TrendingUp,
  Key,
} from 'lucide-react';

function formatMicrocredits(n: bigint): string {
  return (Number(n) / 1_000_000).toFixed(2);
}

export default function DashboardPage() {
  const t = useTranslations();
  const {
    receivedInvoices,
    sentInvoices,
    pending,
    complete,
    showLoading,
    showWalletPrompt,
    isInvoiceProcessing,
    isInvoiceSyncing,
    totalAccountPayable,
    totalPaidThisMonth,
    jctDeductibleAmount,
    currencyDistribution,
    taxTrend,
  } = useInvoices();

  const [auditKeys, setAuditKeys] = useState<AuditKey[]>([]);
  useEffect(() => {
    listAuditKeys().then(setAuditKeys).catch(() => setAuditKeys([]));
  }, []);

  const creditProof = useCreditProof();
  
  // Subscribe to sendingInvoiceHashes in the store (real-time updates)
  const sendingInvoiceHashes = useInvoiceStore((state) => state.sendingInvoiceHashes);
  const sendingCount = Object.keys(sendingInvoiceHashes).length;

  // Statistics
  const stats = {
    totalSent: sentInvoices.length,
    totalReceived: receivedInvoices.length,
    pendingSent: sentInvoices.filter(
      (item) => item.invoice.status === InvoiceStatus.PENDING
    ).length,
    pendingReceived: receivedInvoices.filter(
      (item) => item.invoice.status === InvoiceStatus.PENDING
    ).length,
    paidSent: sentInvoices.filter(
      (item) => item.invoice.status === InvoiceStatus.PAID
    ).length,
    paidReceived: receivedInvoices.filter(
      (item) => item.invoice.status === InvoiceStatus.PAID
    ).length,
    totalPending: pending.length,
    totalComplete: complete.length,
    // Real-time SENDING statistics
    totalSending: sendingCount,
  };

  // Display loading state
  if (showLoading) {
    return (
      <div className="space-y-6">
        <div className="flex min-h-[40vh] flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
          <p className="mt-4 text-sm text-primary-500">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Display wallet connection prompt
  if (showWalletPrompt) {
    return <ConnectWalletCard className="space-y-6" />;
  }

  return (
    <MotionContainer className="space-y-6">
      {/* Stats Cards */}
      <MotionContainer className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" stagger={0.06}>
        <MotionItem className="surface-card card-hover p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-info-100/80 ring-1 ring-info-200/40">
              <Send className="h-6 w-6 text-info-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-900">{stats.totalSent}</p>
              <p className="text-sm text-primary-500">{t('invoice.list.roleSent')}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-primary-400">
            {t('dashboard.stats.pendingCount')}: {stats.pendingSent} · {t('dashboard.stats.paidCount')}: {stats.paidSent}
          </p>
        </MotionItem>

        <MotionItem className="surface-card card-hover p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-100/80 ring-1 ring-accent-200/40">
              <Inbox className="h-6 w-6 text-accent-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-900">{stats.totalReceived}</p>
              <p className="text-sm text-primary-500">{t('invoice.list.roleReceived')}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-primary-400">
            {t('dashboard.stats.pendingCount')}: {stats.pendingReceived} · {t('dashboard.stats.paidCount')}: {stats.paidReceived}
          </p>
        </MotionItem>
        
        {/* SENDING status card (real-time updates) */}
        {stats.totalSending > 0 && (
          <MotionItem className="surface-card-muted card-hover p-5 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-info-100/80 ring-1 ring-info-200/40">
                <RefreshCw className="h-6 w-6 text-info-600 animate-spin" />
              </div>
              <div>
                <p className="text-2xl font-bold text-info-900">{stats.totalSending}</p>
                <p className="text-sm text-info-700">{t('invoice.detail.syncing')}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-info-600">
              {t('dashboard.syncStatus')}
            </p>
          </MotionItem>
        )}

        <MotionItem className="surface-card-muted card-hover p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning-100/80 ring-1 ring-warning-200/40">
              <Clock className="h-6 w-6 text-warning-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-warning-900">{stats.totalPending}</p>
              <p className="text-sm text-warning-700">{t('dashboard.stats.pendingCount')}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-warning-600">{t('invoice.status.pending')}</p>
        </MotionItem>

        <MotionItem className="surface-card-muted card-hover p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success-100/80 ring-1 ring-success-200/40">
              <CheckCircle className="h-6 w-6 text-success-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-success-900">{stats.totalComplete}</p>
              <p className="text-sm text-success-700">{t('dashboard.stats.paidCount')}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-success-600">{t('invoice.status.paid')}</p>
        </MotionItem>
      </MotionContainer>

      {/* Wave 3 核心财务磁贴 */}
      <MotionItem className="surface-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-primary-900">{t('dashboard.financialOverview')}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <p className="text-xs font-medium text-amber-800">{t('dashboard.stats.accountsPayable')}</p>
            <p className="mt-1 text-xl font-bold text-amber-900">{formatMicrocredits(totalAccountPayable)}</p>
            <p className="text-xs text-amber-700">PENDING incoming invoices total</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <p className="text-xs font-medium text-emerald-800">{t('dashboard.stats.totalPaid')}</p>
            <p className="mt-1 text-xl font-bold text-emerald-900">{formatMicrocredits(totalPaidThisMonth)}</p>
            <p className="text-xs text-emerald-700">Credits / USDCx settled</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
            <p className="text-xs font-medium text-blue-800">{t('dashboard.stats.jctDeductible')}</p>
            <p className="mt-1 text-xl font-bold text-blue-900">{formatMicrocredits(jctDeductibleAmount)}</p>
            <p className="text-xs text-blue-700">Input tax (tax_tag verified)</p>
          </div>
        </div>
      </MotionItem>

      {/* 资产比例饼图 + 税务趋势 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <MotionItem className="surface-card p-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <PieChartIcon className="h-4 w-4" />
            Payment mix (Credits vs USDCx)
          </h3>
          <div className="flex items-center gap-6">
            <div className="relative h-32 w-32 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                {(() => {
                  const total = currencyDistribution.credits + currencyDistribution.usdcx;
                  const creditsPct = total > 0n ? Number(currencyDistribution.credits) / Number(total) : 0.5;
                  const dash = creditsPct * 100;
                  return (
                    <>
                      <path
                        d="M18 2.084 a 15.916 15.916 0 0 1 0 31.832 a 15.916 15.916 0 0 1 0 -31.832"
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth="3"
                        strokeDasharray="100"
                        strokeDashoffset={-dash}
                        strokeLinecap="round"
                      />
                      <path
                        d="M18 2.084 a 15.916 15.916 0 0 1 0 31.832 a 15.916 15.916 0 0 1 0 -31.832"
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="3"
                        strokeDasharray={`${dash} ${100 - dash}`}
                        strokeLinecap="round"
                      />
                    </>
                  );
                })()}
              </svg>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-blue-500" />
                <span>Credits: {formatMicrocredits(currencyDistribution.credits)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-slate-300" />
                <span>USDCx: {formatMicrocredits(currencyDistribution.usdcx)}</span>
              </div>
            </div>
          </div>
        </MotionItem>
        <MotionItem className="surface-card p-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <TrendingUp className="h-4 w-4" />
            Tax trend (6 months)
          </h3>
          <div className="space-y-2">
            {taxTrend.map(({ month, inputTax, outputTax }) => (
              <div key={month} className="flex items-center justify-between rounded border border-slate-100 bg-slate-50/50 px-3 py-2 text-xs">
                <span className="font-medium text-slate-700">{month}</span>
                <span className="text-slate-600">In: {formatMicrocredits(inputTax)}</span>
                <span className="text-slate-600">Out: {formatMicrocredits(outputTax)}</span>
              </div>
            ))}
          </div>
        </MotionItem>
      </div>

      {/* 审计包监控：已发放 Audit Key 列表 + 失效倒计时 */}
      <MotionItem className="surface-card p-6">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Key className="h-4 w-4" />
          Audit keys issued
        </h3>
        {auditKeys.length === 0 ? (
          <p className="text-sm text-slate-500">No audit keys issued yet. Generate one from the Audit Center.</p>
        ) : (
          <ul className="space-y-2">
            {auditKeys.slice(0, 10).map((ak) => {
              const exp = ak.config.expiresAt < 1e12 ? ak.config.expiresAt * 1000 : ak.config.expiresAt;
              const expiresAt = new Date(exp);
              const now = Date.now();
              const msLeft = expiresAt.getTime() - now;
              const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
              const expired = msLeft <= 0;
              return (
                <li
                  key={ak.key}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm"
                >
                  <code className="truncate max-w-[200px] text-slate-700">{ak.key.slice(0, 16)}…</code>
                  <span className={expired ? 'text-red-600 font-medium' : 'text-slate-600'}>
                    {expired ? 'Expired' : `Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {auditKeys.length > 10 && (
          <p className="mt-2 text-xs text-slate-500">Showing 10 of {auditKeys.length}</p>
        )}
      </MotionItem>

      {/* Credit Score Card */}
      <MotionItem>
        <CreditDashboardCard
          metrics={creditProof.metrics}
          onCollect={creditProof.collectLocalMetrics}
          isLoading={creditProof.isProcessing}
        />
      </MotionItem>

      {/* Quick Actions */}
      <MotionItem className="surface-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-primary-900">{t('dashboard.quickActions')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-tour="dashboard-stats">
          <Link
            href="/invoices/create"
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-primary-200/60 bg-white/70 p-4 transition-all hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-md"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-100/80 ring-1 ring-accent-200/40">
              <FilePlus className="h-5 w-5 text-accent-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-primary-900">{t('nav.createInvoice')}</div>
              <div className="text-xs text-primary-500">{t('dashboard.createNew')}</div>
            </div>
          </Link>

          <Link
            href="/invoices?filter=pending"
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-primary-200/60 bg-white/70 p-4 transition-all hover:-translate-y-0.5 hover:border-warning-300 hover:shadow-md"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-100/80 ring-1 ring-warning-200/40">
              <CreditCard className="h-5 w-5 text-warning-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-primary-900">{t('dashboard.stats.pendingCount')}</div>
              <div className="text-xs text-primary-500">{t('invoice.status.pending')}</div>
            </div>
          </Link>

          <Link
            href="/receipts"
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-primary-200/60 bg-white/70 p-4 transition-all hover:-translate-y-0.5 hover:border-success-300 hover:shadow-md"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-100/80 ring-1 ring-success-200/40">
              <Receipt className="h-5 w-5 text-success-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-primary-900">{t('nav.receipts')}</div>
              <div className="text-xs text-primary-500">{t('receipt.emptyDescription')}</div>
            </div>
          </Link>

          <Link
            href="/audit"
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-primary-200/60 bg-white/70 p-4 transition-all hover:-translate-y-0.5 hover:border-info-300 hover:shadow-md"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info-100/80 ring-1 ring-info-200/40">
              <Search className="h-5 w-5 text-info-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-primary-900">{t('nav.auditCenter')}</div>
              <div className="text-xs text-primary-500">{t('audit.center.downloadKey')}</div>
            </div>
          </Link>
        </div>
      </MotionItem>

      {/* Sent Invoices */}
      <MotionItem className="surface-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary-900">{t('invoice.list.roleSent')} {t('nav.invoices')}</h2>
          <Link
            href="/invoices/create"
            className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-accent-600 transition-colors hover:text-accent-700"
          >
            {t('dashboard.createNew')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {sentInvoices.length === 0 ? (
          <EmptyState
            mascot="sleeping"
            title={t('invoice.list.emptyTitle')}
            description={t('invoice.list.emptyDescription')}
            action={
              <Link
                href="/invoices/create"
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-accent-600"
              >
                <FilePlus className="h-4 w-4" />
                {t('nav.createInvoice')}
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sentInvoices.slice(0, 4).map((item) => (
              <InvoiceCard
                key={item.invoice.id}
                invoice={item.invoice}
                role={item.role}
                statusConfig={item.statusConfig}
                isProcessing={isInvoiceProcessing(item.invoice.id)}
                isSyncing={isInvoiceSyncing(item.invoice)}
              />
            ))}
          </div>
        )}

        {sentInvoices.length > 4 && (
          <div className="mt-4 text-center">
            <Link
              href="/invoices?filter=sent"
            className="inline-flex cursor-pointer items-center gap-1 text-sm text-primary-600 hover:text-primary-800"
            >
              {t('common.viewAll')} ({sentInvoices.length})
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </MotionItem>

      {/* Received Invoices */}
      <MotionItem className="surface-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary-900">{t('invoice.list.roleReceived')} {t('nav.invoices')}</h2>
          <Link
            href="/invoices?filter=received"
            className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-accent-600 transition-colors hover:text-accent-700"
          >
            {t('common.viewAll')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {receivedInvoices.length === 0 ? (
          <EmptyState
            mascot="sleeping"
            title={t('invoice.list.emptyTitle')}
            description={t('invoice.list.emptyDescription')}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {receivedInvoices.slice(0, 4).map((item) => (
              <InvoiceCard
                key={item.invoice.id}
                invoice={item.invoice}
                role={item.role}
                statusConfig={item.statusConfig}
                isProcessing={isInvoiceProcessing(item.invoice.id)}
                isSyncing={isInvoiceSyncing(item.invoice)}
              />
            ))}
          </div>
        )}

        {receivedInvoices.length > 4 && (
          <div className="mt-4 text-center">
            <Link
              href="/invoices?filter=received"
            className="inline-flex cursor-pointer items-center gap-1 text-sm text-primary-600 hover:text-primary-800"
            >
              {t('common.viewAll')} ({receivedInvoices.length})
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </MotionItem>
    </MotionContainer>
  );
}
