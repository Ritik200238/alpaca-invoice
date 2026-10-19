'use client';

import { Plus, Trash2, Lock, ShieldCheck, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import JctPdfPreview from '@/components/jct-pdf-preview';
import WalletOperationProgress from '@/components/wallet-operation-progress';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { useInvoiceForm, type LineItemRow } from '@/controller/Invoice/useInvoiceForm';

export default function InvoiceForm() {
  const t = useTranslations();
  const form = useInvoiceForm();
  const { audit } = form;

  const formContent = (
    <form
      onSubmit={form.handleSubmit}
      className="surface-card space-y-4 p-3 ring-2 ring-amber-200/80 bg-amber-50/30"
    >
      {/* ── Seller (auto, read-only) ── */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">
          {t('invoice.create.sellerAddress')} <span className="text-xs text-slate-400">{t('invoice.create.currentWallet')}</span>
        </label>
        <div className="rounded-lg border border-primary-200/60 bg-primary-50/70 px-3 py-2 text-sm text-slate-700">
          {form.publicKey || t('invoice.create.notConnected')}
        </div>
      </div>

      {/* ── T number (JCT registration) ── */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">
          {t('invoice.create.tNumberRegistration')} <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={13}
            value={form.tNumber}
            onChange={(e) => form.setTNumber(e.target.value)}
            className="font-mono"
            placeholder={t('invoice.create.tNumberPlaceholder')}
          />
          {form.tNumber.length === 13 && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-600" title={t('invoice.create.tNumberVerified')}>
              <ShieldCheck className="h-5 w-5" />
            </span>
          )}
        </div>
        {form.errors.tNumber && <p className="text-xs text-red-500">{form.errors.tNumber}</p>}
        <p className="text-xs text-slate-400">
          {t('invoice.create.tNumberHint')}
        </p>
        {form.tNumber.length === 13 && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs">
            <p className="text-amber-800">
              {t('invoice.create.formatValid')}
            </p>
            <button
              type="button"
              onClick={form.verifyTNumberWithNta}
              disabled={form.ntaCheck === 'checking'}
              className="mt-1.5 rounded border border-amber-300 bg-white px-2 py-1 font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
            >
              {form.ntaCheck === 'checking'
                ? t('invoice.create.ntaChecking')
                : form.ntaCheck === 'ok'
                ? `✓ ${t('invoice.create.ntaVerified')}`
                : t('invoice.create.ntaVerifyButton')}
            </button>
            {form.ntaCheck === 'unavailable' && (
              <p className="mt-1 text-amber-700">
                {t('invoice.create.ntaDemoNote')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Buyer ── */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">
          {t('invoice.create.buyerAddress')} <span className="text-red-500">*</span>
        </label>
        <Input
          type="text"
          required
          value={form.buyer}
          onChange={(e) => form.setBuyer(e.target.value)}
          placeholder={t('invoice.create.buyerPlaceholder')}
        />
        {form.errors.buyer && <p className="text-xs text-red-500">{form.errors.buyer}</p>}
      </div>

      {/* ── Arbiter (optional, for escrow disputes) ── */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">
          {t('invoice.create.arbiterAddress')} <span className="text-xs text-slate-400">({t('common.optional')})</span>
        </label>
        <Input
          type="text"
          value={form.arbiter}
          onChange={(e) => form.setArbiter(e.target.value)}
          placeholder={t('invoice.create.arbiterPlaceholder')}
        />
        {form.errors.arbiter && <p className="text-xs text-red-500">{form.errors.arbiter}</p>}
        <p className="text-xs text-slate-400">
          {t('invoice.create.arbiterHint')}
        </p>
      </div>

      {/* ── Line items ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-800">
            {t('invoice.create.lineItems')} <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={form.addLineItem}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" /> {t('invoice.create.addItem')}
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-600">
                <th className="px-3 py-2">{t('invoice.create.description')}</th>
                <th className="w-20 px-3 py-2">{t('invoice.create.quantity')}</th>
                <th className="w-24 px-3 py-2">{t('invoice.create.unitPrice')}</th>
                <th className="w-20 px-3 py-2">{t('invoice.create.amount')}</th>
                <th className="w-24 px-3 py-2">{t('invoice.create.taxJct')}</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {form.lineItems.map((row, i) => {
                const parsed = form.parsedLineItems[i];
                const amount = parsed?.amount ?? 0;
                const lineTaxRate = row.jctTaxRate === '10' ? 0.1 : row.jctTaxRate === '8' ? 0.08 : 0;
                const lineTax = Math.round(amount * lineTaxRate * 100) / 100;
                return (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        value={row.description}
                        onChange={(e) => form.updateLineItem(row.id, 'description', e.target.value)}
                        className="min-w-0 py-1.5"
                        placeholder={t('invoice.create.descriptionPlaceholder')}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={row.quantity}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '' || /^\d*\.?\d*$/.test(v)) form.updateLineItem(row.id, 'quantity', v);
                        }}
                        className="py-1.5"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={row.unitPrice}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '' || /^\d*\.?\d*$/.test(v)) form.updateLineItem(row.id, 'unitPrice', v);
                        }}
                        className="py-1.5"
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-600">{amount.toFixed(2)}</td>
                    <td className="px-1 py-2">
                      <Select
                        value={row.jctTaxRate}
                        onValueChange={(v) =>
                          form.updateLineItem(row.id, 'jctTaxRate', v as LineItemRow['jctTaxRate'])
                        }
                      >
                        <SelectTrigger className="py-1.5 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10%</SelectItem>
                          <SelectItem value="8">8%</SelectItem>
                          <SelectItem value="0">0%</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="ml-1 inline-flex items-center text-xs text-slate-500" title="Locked">
                        <Lock className="h-3 w-3" />
                        {lineTax.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => form.removeLineItem(row.id)}
                        disabled={form.lineItems.length <= 1}
                        title={t('invoice.create.removeLine')}
                        className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {form.errors.lineItems && <p className="text-xs text-red-500">{form.errors.lineItems}</p>}
        {form.errors.amount && <p className="text-xs text-red-500">{form.errors.amount}</p>}
      </div>

      {/* ── Subtotal + tax summary ── */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">
          {t('invoice.create.subtotalLabel')} <span className="text-xs text-slate-400">{t('invoice.create.fromLineItems')}</span>
        </label>
        <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800">
          {form.parsedAmount.toFixed(2)} {form.currency}
        </div>
        <p className="text-xs text-slate-400">
          {t('invoice.create.taxPerLine')}: {form.taxAmount.toFixed(2)} {form.currency} · {t('invoice.create.total')}: {form.total.toFixed(2)} {form.currency}
        </p>
      </div>

      {/* ── Due date + currency ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">
            {t('invoice.create.dueDate')} <span className="text-red-500">*</span>
          </label>
          <DatePicker
            required
            value={form.dueDate}
            min={new Date().toISOString().split('T')[0]}
            onChange={(v) => form.setDueDate(v)}
          />
          {form.errors.dueDate && <p className="text-xs text-red-500">{form.errors.dueDate}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">
            {t('invoice.create.paymentCurrency')} <span className="text-red-500">*</span>
          </label>
          <Select value={form.currency} onValueChange={(v) => form.setCurrency(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CREDITS">CREDITS</SelectItem>
              <SelectItem value="USDCx">USDCx</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-400">{t('invoice.create.currencyNote')}</p>
          {form.errors.currency && <p className="text-xs text-red-500">{form.errors.currency}</p>}
        </div>
      </div>

      {/* ── Order ID + memo ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">
            {t('invoice.create.orderId')}
          </label>
          <Input
            type="text"
            value={form.orderId}
            onChange={(e) => form.setOrderId(e.target.value)}
            placeholder={t('invoice.create.orderIdPlaceholder')}
          />
          <p className="text-xs text-slate-400">{t('invoice.create.orderIdAutoGenerate')}</p>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">
            {t('invoice.create.memo')}
          </label>
          <Input
            type="text"
            value={form.notes}
            onChange={(e) => form.setNotes(e.target.value)}
            placeholder={t('invoice.create.memoPlaceholder')}
          />
        </div>
      </div>

      {/* ── Audit authorization ── */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">{t('invoice.create.auditAuthorization')}</div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <Checkbox
              checked={audit.enableAuditAuth}
              onCheckedChange={(v) => audit.setEnableAuditAuth(v === true)}
            />
            {t('invoice.create.enable')}
          </label>
        </div>
        {audit.enableAuditAuth && (
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">{t('invoice.create.auditKey')}</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800">
                  {audit.auditKey || '—'}
                </code>
                <button
                  type="button"
                  onClick={() => audit.generateAuditKey()}
                  title={t('invoice.create.generateAuditKey')}
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {t('invoice.create.auditKeyHint')}
              </p>
              {form.errors.auditKey && <p className="text-xs text-red-500">{form.errors.auditKey}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">{t('invoice.create.expiry')}</label>
              <DatePicker
                value={audit.expiresAt}
                min={new Date().toISOString().split('T')[0]}
                onChange={(v) => audit.setExpiresAt(v)}
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-700">{t('invoice.create.scopes')}</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  'amount', 'tax_amount', 'due_date',
                  'buyer', 'seller', 'currency',
                  'items_hash', 'memo_hash', 'order_id'
                ].map((s) => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={audit.scopes.includes(s)}
                      onCheckedChange={() => audit.toggleScope(s)}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Progress indicator ── */}
      {form.isProcessing && (
        <WalletOperationProgress
          isProving
          txProgress={form.currentProgress}
          txLog={form.currentLog}
          isConfirming={false}
          pollLog=""
          operationLabel={t('walletProgress.creatingInvoice')}
        />
      )}

      {/* ── Submit ── */}
      <button
        type="submit"
        disabled={form.isProcessing}
        className="w-full cursor-pointer rounded-lg bg-primary-900 px-4 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {form.isProcessing ? t('invoice.create.processing') : t('invoice.create.submitButton')}
      </button>
    </form>
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,380px]">
      <div className="min-w-0">{formContent}</div>
      <div className="lg:sticky lg:top-4 lg:self-start">
        <JctPdfPreview
          sellerName={form.publicKey ? `${form.publicKey.slice(0, 12)}…` : '—'}
          sellerTNumber={form.tNumber}
          buyerName={form.buyer.trim() || '—'}
          issueDate={form.dueDate ? new Date(form.dueDate) : new Date()}
          lineItems={form.jctPreviewData.lineItemsV3}
          summary={form.jctPreviewData.summary}
          currency={form.currency}
        />
      </div>
    </div>
  );
}
