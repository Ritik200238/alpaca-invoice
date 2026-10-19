'use client';

import Image from 'next/image';
import { Receipt, Download, RefreshCw, FileText } from 'lucide-react';
import { useReceipts } from '@/controller/Receipt/useReceipts';
import ReceiptCard from '@/components/receipt-card';
import ConnectWalletCard from '@/components/connect-wallet-card';
import { EmptyState } from '@/components/ui/empty-state';
import { MotionContainer, MotionItem } from '@/components/ui/motion';
import type { AleoTransactionId } from '@/lib/types';
import { useTranslations } from 'next-intl';

function buildExplorerTxUrl(transactionId?: AleoTransactionId): string | null {
  if (!transactionId) return null;
  const cleanTx = String(transactionId).trim();
  // Only build URL for valid on-chain Aleo transaction IDs (at1... prefix, 61+ chars)
  // Shield wallet may return short internal tracking IDs (e.g. "shield_xxx") before confirmation
  if (!cleanTx.startsWith('at1') || cleanTx.length < 61) return null;
  return `https://testnet.explorer.provable.com/transaction/${encodeURIComponent(cleanTx)}`;
}

export default function ReceiptsPage() {
  const t = useTranslations();
  const { receipts, isSyncing, showWalletPrompt, handleSyncAllReceipts, exportCsv } = useReceipts();
  const hasData = receipts.length > 0;

  const handleExport = () => {
    const csv = exportCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'receipts.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Wallet connection prompt
  if (showWalletPrompt) {
    return <ConnectWalletCard />;
  }

  return (
    <div>
      <MotionContainer className="space-y-6">
        {/* Header: same style as invoices — icon + title + mascot */}
        <MotionItem className="flex items-start gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-100">
                <Receipt className="h-5 w-5 text-success-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-primary-900">{t('receipt.title')}</h1>
                <p className="text-sm text-primary-500">
                  {t('receipt.description')}
                </p>
              </div>
            </div>
          </div>
          <div className="relative hidden h-20 w-20 md:block">
            <Image
              src="/images/mascot/mascot-happy.png"
              alt={t('receipt.title')}
              fill
              className="object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        </MotionItem>

        {/* Actions: same button styles as invoices page */}
        <MotionItem className="flex flex-wrap items-center justify-end gap-3">
          <button
            onClick={handleSyncAllReceipts}
            disabled={isSyncing}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-primary-200/60 bg-white/70 px-4 py-2.5 text-sm font-medium text-primary-700 shadow-sm transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            title={t('common.sync')}
          >
            <RefreshCw className={isSyncing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            {isSyncing ? t('common.syncing') : t('common.sync')}
          </button>
          <button
            onClick={handleExport}
            disabled={!hasData}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            title={t('invoice.list.exportCsv')}
          >
            <Download className="h-4 w-4" />
            {t('invoice.list.exportCsv')}
          </button>
        </MotionItem>

        {/* Receipt list: card grid like invoices */}
        {!hasData ? (
          <MotionItem className="surface-card p-8">
            <EmptyState
              icon={FileText}
              mascot="sleeping"
              title={t('receipt.emptyTitle')}
              description={t('receipt.emptyDescription')}
            />
          </MotionItem>
        ) : (
          <MotionContainer className="grid gap-4 md:grid-cols-2" stagger={0.06}>
            {receipts.map((receipt) => (
              <MotionItem key={String(receipt.paymentId)} className="space-y-2">
                <ReceiptCard
                  receipt={receipt}
                  explorerTxUrl={buildExplorerTxUrl(receipt.txId)}
                />
              </MotionItem>
            ))}
          </MotionContainer>
        )}
      </MotionContainer>
    </div>
  );
}
