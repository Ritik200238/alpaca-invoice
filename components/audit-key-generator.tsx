'use client';

import { useTranslations } from 'next-intl';
import { useAuditPackageGenerate } from '@/controller/Audit/useAuditPackageGenerate';
import { useAuthCheck } from '@/controller/Auth/useAuthCheck';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';

export default function AuditKeyGenerator() {
  const t = useTranslations();
  const { isAuthRequired, handleUnlock, isRequestingAuth } = useAuthCheck();
  const {
    invoices,
    invoiceId,
    expiresAt,
    fields,
    result,
    keyCopied,
    setInvoiceId,
    setExpiresAt,
    toggleField,
    loadInvoiceOptions,
    downloadResult,
    copyAuditKey,
    handleSubmit,
    loading,
    loadingInvoices,
    fieldsList,
    submitAuthorization,
    submittingAuth
  } = useAuditPackageGenerate();

  const resultSidebar = result ? (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">{t('audit.generator.resultTitle')}</div>
      <div className="space-y-3 text-sm text-slate-800">
        <div>
          <div className="mb-1 font-medium text-slate-700">{t('audit.generator.encryptedPackage')}</div>
          <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            {JSON.stringify(result.envelope, null, 2)}
          </pre>
        </div>
        <div className="space-y-1">
          <div className="font-medium text-slate-700">{t('audit.generator.auditKey')}</div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
              {result.auditKey}
            </code>
            <button
              type="button"
              onClick={copyAuditKey}
              className="shrink-0 rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              {keyCopied ? t('common.copied') : t('common.copy')}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={downloadResult}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {t('audit.generator.downloadEnvelope')}
        </button>
        <button
          type="button"
          onClick={submitAuthorization}
          disabled={submittingAuth}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {submittingAuth ? t('audit.generator.submitting') : t('audit.generator.submitOnChain')}
        </button>
        <p className="text-xs text-slate-500">
          {t('audit.generator.submitNote')}
        </p>
      </div>
    </div>
  ) : null;

  return (
    <div
      className={
        result
          ? 'grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(320px,400px)]'
          : 'block'
      }
    >
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {isAuthRequired && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">{t('audit.generator.authDescription')}</p>
            <p className="mt-1 text-amber-700">
              {t('audit.generator.authDetail')}
            </p>
            <button
              type="button"
              onClick={handleUnlock}
              disabled={isRequestingAuth}
              className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {isRequestingAuth ? t('audit.center.authorizing') : t('audit.generator.authorize')}
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="text-sm font-semibold text-slate-900">{t('audit.generator.title')}</div>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>{t('audit.generator.selectOrPaste')}</span>
            <button
              type="button"
              onClick={loadInvoiceOptions}
              disabled={loadingInvoices}
              className="rounded border border-slate-200 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingInvoices ? t('common.loading') : t('audit.generator.refreshList')}
            </button>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-800">{t('audit.generator.invoiceId')}</label>
            <Select value={invoiceId || undefined} onValueChange={(v) => setInvoiceId(v)}>
              <SelectTrigger>
                <SelectValue placeholder={t('audit.generator.chooseFromLocal')} />
              </SelectTrigger>
              <SelectContent>
                {invoices.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {inv.id} ({inv.invoiceHash})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="text"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              placeholder={t('audit.generator.pasteInvoiceId')}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-800">{t('audit.generator.expirationDate')}</label>
            <DatePicker
              value={expiresAt}
              onChange={(v) => setExpiresAt(v)}
            />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-800">{t('audit.generator.fieldsToDisclose')}</div>
            <div className="grid grid-cols-2 gap-2">
              {fieldsList.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <Checkbox
                    checked={fields.includes(p.key)}
                    onCheckedChange={() => toggleField(p.key)}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || isAuthRequired}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? t('audit.generator.generating') : t('audit.generator.generate')}
          </button>
        </form>
      </div>

      {resultSidebar}
    </div>
  );
}
