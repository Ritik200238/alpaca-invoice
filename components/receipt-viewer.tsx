'use client';

import { Download, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useReceipts } from '@/controller/Receipt/useReceipts';

export default function ReceiptViewer() {
  const t = useTranslations();
  const { receipts, isSyncing, handleSyncAllReceipts, exportCsv } = useReceipts();
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

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">{t('receipt.paymentReceipts')}</div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncAllReceipts}
            className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={isSyncing}
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? t('common.syncing') : t('common.sync')}
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={!hasData}
          >
            <Download className="h-4 w-4" /> {t('receipt.exportCsv')}
          </button>
        </div>
      </div>
      {!hasData && <p className="text-sm text-slate-500">{t('receipt.emptyTitle')}</p>}
      <div className="space-y-3">
        {receipts.map((r) => (
          <div key={r.paymentId} className="rounded-lg border border-slate-100 p-3">
            <div className="text-xs text-slate-500">{t('receipt.paymentId')}: {r.paymentId}</div>
            <div className="text-sm text-slate-700">
              {t('receipt.amount')}: {(Number(r.amount) / 1_000_000).toFixed(2)} {t('receipt.credits')}
            </div>
            <div className="text-xs text-slate-500">
              {t('receipt.buyer')}: {r.payer.slice(0, 12)}... → {t('receipt.seller')}: {r.payee.slice(0, 12)}...
            </div>
            <div className="text-xs text-slate-500">
              {t('receipt.invoiceLabel')}: {r.invoiceId}
            </div>
            <div className="text-xs text-slate-500">
              {t('receipt.paidAt')}: {r.paidAt.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500">
              {t('receipt.tx')}: {r.txId}
            </div>
            {r.blockHeight != null && (
              <div className="text-xs text-slate-500">
                {t('receipt.blockHeight')}: {r.blockHeight}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
