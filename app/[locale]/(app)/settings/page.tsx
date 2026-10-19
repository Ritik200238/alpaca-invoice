'use client';

import { useMemo, useState } from 'react';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { createInvoiceRegistryService } from '@/services/InvoiceRegistryService/createInvoiceRegistryService';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { AleoField } from '@/lib/types';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';

const SCOPE_KEYS = [
  'amount',
  'tax_amount',
  'due_date',
  'buyer',
  'seller',
  'currency',
  'items_hash',
  'memo_hash',
  'order_id'
] as const;

export default function SettingsPage() {
  const t = useTranslations();
  const { executeSetAuditAuthorization, isProcessing, currentProgress, currentLog } =
    useTransactionController();
  const protocolService = useMemo(() => new AleoProtocolService(), []);
  const registry = useMemo(() => createInvoiceRegistryService(protocolService), [protocolService]);
  const cryptoService = useMemo(() => new CryptoService(), []);
  const { handleError } = useErrorHandler();

  const [invoiceId, setInvoiceId] = useState('');
  const [auditKey, setAuditKey] = useState('');
  const [scopes, setScopes] = useState<string[]>(['amount', 'tax_amount', 'buyer', 'seller']);
  const [expiresAt, setExpiresAt] = useState(
    new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );
  const [currentAuth, setCurrentAuth] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [message, setMessage] = useState('');

  const toggleScope = (key: string) =>
    setScopes((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));

  const loadAuth = async () => {
    setLoadingAuth(true);
    setMessage('');
    try {
      const auth = await registry.getAuditAuthorization(invoiceId as AleoField);
      setCurrentAuth(auth);
      if (!auth) setMessage(t('settings.noAuthFound'));
    } catch (e: any) {
      handleError(e);
    } finally {
      setLoadingAuth(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    try {
      const scopesBitmask = scopes.reduce((mask, key) => {
        const ids: Record<string, number> = {
          amount: 1,
          tax_amount: 2,
          due_date: 3,
          buyer: 4,
          seller: 5,
          currency: 6,
          items_hash: 7,
          memo_hash: 8,
          order_id: 9
        };
        const id = ids[key];
        if (id) {
          return mask | (1n << BigInt(id - 1));
        }
        return mask;
      }, 0n);
      const auditKeyHash = await cryptoService.hashObjectToField(auditKey || 'audit-key');
      const expiresSec = Math.floor(new Date(expiresAt).getTime() / 1000);

      await executeSetAuditAuthorization(
        {
          id: invoiceId as AleoField,
          invoiceHash: invoiceId as AleoField,
          seller: '' as any,
          buyer: '' as any,
          amount: 0n,
          dueDate: new Date(),
          createdAt: new Date(),
          status: 0
        } as any,
        auditKeyHash,
        scopesBitmask,
        expiresSec
      );
      setMessage(t('settings.authSubmitted'));
    } catch (err) {
      handleError(err);
    }
  };

  const revoke = async () => {
    if (!invoiceId) return;
    setMessage('');
    try {
      const expiresSec = Math.floor(Date.now() / 1000);
      await executeSetAuditAuthorization(
        {
          id: invoiceId as AleoField,
          invoiceHash: invoiceId as AleoField,
          seller: '' as any,
          buyer: '' as any,
          amount: 0n,
          dueDate: new Date(),
          createdAt: new Date(),
          status: 0
        } as any,
        '0field',
        0n,
        expiresSec
      );
      setMessage(t('settings.authRevoked'));
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">{t('settings.title')}</h1>

      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">{t('invoice.detail.invoiceId')}</label>
          <Input
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            placeholder={t('settings.invoiceIdPlaceholder')}
            required
          />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-800">{t('settings.auditKey')}</label>
            <Input
              value={auditKey}
              onChange={(e) => setAuditKey(e.target.value)}
              placeholder={t('settings.auditKeyPlaceholder')}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-800">{t('settings.expiry')}</label>
            <DatePicker
              value={expiresAt}
              onChange={(v) => setExpiresAt(v)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium text-slate-800">{t('settings.scopes')}</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {SCOPE_KEYS.map((s) => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={scopes.includes(s)}
                  onCheckedChange={() => toggleScope(s)}
                />
                {s}
              </label>
            ))}
          </div>
        </div>

        {isProcessing && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            <div className="flex items-center justify-between">
              <span>{t('common.submitting')}</span>
              <span>{currentProgress}%</span>
            </div>
            {currentLog && <div className="mt-1 text-xs">{currentLog}</div>}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isProcessing}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {t('settings.setAuthorization')}
          </button>
          <button
            type="button"
            onClick={revoke}
            disabled={isProcessing || !invoiceId}
            className="rounded border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {t('settings.revoke')}
          </button>
          <button
            type="button"
            onClick={loadAuth}
            disabled={loadingAuth}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
          >
            {loadingAuth ? t('common.loading') : t('settings.fetchCurrent')}
          </button>
        </div>
        {message && <div className="text-xs text-slate-700">{message}</div>}
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-sm text-slate-900">
        <div className="font-semibold">{t('settings.currentAuthorization')}</div>
        <pre className="mt-2 max-h-64 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-xs">
          {currentAuth ? JSON.stringify(currentAuth, null, 2) : 'N/A'}
        </pre>
      </div>
    </div>
  );
}
