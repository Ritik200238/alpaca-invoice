'use client';

import { useState } from 'react';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { createInvoiceRegistryService } from '@/services/InvoiceRegistryService/createInvoiceRegistryService';
import { InvoiceStatus } from '@/lib/types';
import { PROGRAM_ID } from '@/lib/contract';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';

const protocolService = new AleoProtocolService();

export default function VerifyPage() {
  const t = useTranslations();
  const [invoiceId, setInvoiceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    exists: boolean;
    hash?: string | null;
    status?: InvoiceStatus | null;
    rulesResult?: string | null;
    error?: string;
  } | null>(null);

  const formatStatus = (status: InvoiceStatus | null): string => {
    if (status === null || status === undefined) return t('verify.unknown');
    switch (status) {
      case InvoiceStatus.PENDING:
        return t('invoice.status.pending');
      case InvoiceStatus.PAID:
        return t('invoice.status.paid');
      case InvoiceStatus.CANCELLED:
        return t('invoice.status.cancelled');
      case InvoiceStatus.EXPIRED:
        return t('invoice.status.expired');
      default:
        return t('verify.unknown');
    }
  };

  const handleCheck = async () => {
    setLoading(true);
    setResult(null);
    try {
      const normalized = invoiceId.trim();
      if (!normalized.endsWith('field')) {
        throw new Error('Invoice ID must be a field (suffix "field").');
      }
      const registry = createInvoiceRegistryService(protocolService);
      const [hash, status, rulesResult] = await Promise.all([
        registry.getInvoiceHash(normalized as any),
        registry.getInvoiceStatus(normalized as any),
        registry.getRulesResult(normalized as any)
      ]);
      setResult({
        exists: hash !== null,
        hash,
        status,
        rulesResult
      });
    } catch (error: any) {
      setResult({ exists: false, error: error?.message || 'Lookup failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{t('verify.title')}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {t('verify.description', { programId: PROGRAM_ID })}
        </p>

        <div className="mt-4 space-y-3">
          <label className="text-sm font-medium text-slate-800">{t('verify.invoiceIdLabel')}</label>
          <Input
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            placeholder={t('verify.placeholder')}
          />
          <button
            onClick={handleCheck}
            disabled={loading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {loading ? t('verify.checking') : t('verify.checkOnChain')}
          </button>
        </div>

        {result && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
            {result.error && <div className="text-red-600">{t('common.error')}: {result.error}</div>}
            {!result.error && (
              <>
                <div>{t('verify.exists')}: {result.exists ? t('verify.yes') : t('verify.no')}</div>
                <div>{t('verify.hash')}: {result.hash ?? 'N/A'}</div>
                <div>{t('verify.status')}: {formatStatus(result.status ?? null)}</div>
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <span className="font-medium text-slate-700">{t('verify.rulesResult')}:</span>{' '}
                  {result.rulesResult ?? 'N/A'}
                  <p className="mt-1 text-xs text-slate-500">
                    {t('verify.rulesDescription')}
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
