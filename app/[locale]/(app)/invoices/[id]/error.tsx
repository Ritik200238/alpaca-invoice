'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function InvoiceDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations();
  useEffect(() => {
    console.error('[InvoiceDetail] Uncaught error:', error);
  }, [error]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/invoices"
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h2 className="text-xl font-bold text-slate-900">{t('invoice.detail.title')}</h2>
      </div>

      <div className="rounded-2xl border border-red-200 bg-white p-8 shadow-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-100">
          <AlertTriangle className="h-6 w-6 text-red-600" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">
          {t('errors.somethingWentWrong')}
        </h3>
        <p className="text-sm text-slate-600 mb-1">
          {t('errors.failedToLoadInvoice')}
        </p>
        <p className="text-xs text-slate-400 mb-6 font-mono break-all max-w-md mx-auto">
          {error.message}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" />
            {t('common.retry')}
          </button>
          <Link
            href="/invoices"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('invoice.detail.backToInvoices')}
          </Link>
        </div>
      </div>
    </div>
  );
}
