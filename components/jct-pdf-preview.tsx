'use client';

import type { LineItemV3 } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';

export interface JctPdfPreviewSummary {
  net10: number;
  tax10: number;
  net8: number;
  tax8: number;
  total: number;
}

export interface JctPdfPreviewProps {
  sellerName: string;
  sellerTNumber: string;
  buyerName: string;
  issueDate: Date;
  lineItems: LineItemV3[];
  summary: JctPdfPreviewSummary;
  currency: string;
}

/**
 * JCT PDF preview component (NTA six-element compliance)
 * - Issuer ID (T+13), issue date, line item details (※), tax rate breakdown, exact tax amount, buyer ID
 * - 8% items automatically prefixed with ※
 * - Bottom breakdown table and legal disclaimer footnote
 */
export default function JctPdfPreview({
  sellerName,
  sellerTNumber,
  buyerName,
  issueDate,
  lineItems,
  summary,
  currency
}: JctPdfPreviewProps) {
  const t = useTranslations();
  const displaySeller = sellerName.trim() || '—';
  const displayT = sellerTNumber.replace(/\D/g, '').slice(0, 13);
  const displayBuyer = buyerName.trim() || '—';
  const dateStr = format(issueDate, 'MMM dd, yyyy');
  const displayCurrency = currency.trim() || 'CREDITS';

  return (
    <div
      className="rounded-xl border-2 border-amber-200 bg-white shadow-sm print:shadow-none"
      style={{ minHeight: 420 }}
    >
      <div className="border-b border-amber-200 bg-amber-50/50 px-4 py-2 text-center text-sm font-semibold text-amber-900">
        {t('jctPreview.title')}
      </div>

      <div className="p-4 space-y-4 text-sm text-slate-800">
        {/* 1. Issuer: seller name + registration number T+13 */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-slate-900">{t('jctPreview.issuer')}</span>
          <span>{displaySeller}</span>
          {displayT.length === 13 && (
            <span className="text-slate-600">
              {t('jctPreview.regNo')} T{displayT}
            </span>
          )}
        </div>

        {/* 2. Issue date */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-slate-900">{t('jctPreview.issueDate')}</span>
          <span>{dateStr}</span>
        </div>

        {/* 3. Line items: 8% rows prefixed with ※ */}
        <div>
          <div className="font-medium text-slate-900 mb-2">{t('jctPreview.lineItems')}</div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-100 text-left">
                <th className="px-2 py-1.5 font-semibold">{t('jctPreview.item')}</th>
                <th className="px-2 py-1.5 font-semibold w-16 text-right">{t('jctPreview.qty')}</th>
                <th className="px-2 py-1.5 font-semibold w-20 text-right">{t('jctPreview.unitPriceInclTax')}</th>
                <th className="px-2 py-1.5 font-semibold w-16 text-right">{t('jctPreview.taxRate')}</th>
                <th className="px-2 py-1.5 font-semibold w-24 text-right">{t('jctPreview.amountExclTax')}</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-3 text-slate-400 text-center">
                    {t('jctPreview.addLineItems')}
                  </td>
                </tr>
              ) : (
                lineItems.map((item, i) => {
                  const isReduced = item.taxRate === 8;
                  const desc = (item.description || '—').trim();
                  const displayDesc = isReduced ? `※ ${desc}` : desc;
                  const net = item.amount ?? 0;
                  const rateLabel = item.taxRate === 10 ? '10%' : item.taxRate === 8 ? '8%' : '0%';
                  return (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-2 py-1.5">{displayDesc}</td>
                      <td className="px-2 py-1.5 text-right">{item.quantity}</td>
                      <td className="px-2 py-1.5 text-right">{item.unitPrice.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-right">{rateLabel}</td>
                      <td className="px-2 py-1.5 text-right">{net.toLocaleString()}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 4 & 5. Tax rate breakdown + exact tax amount */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="font-medium text-slate-700">{t('jctPreview.base10ExclTax')}</div>
            <div className="text-right">{summary.net10.toLocaleString()} {displayCurrency}</div>
            <div className="font-medium text-slate-700">{t('jctPreview.consumptionTax10')}</div>
            <div className="text-right">{summary.tax10.toLocaleString()} {displayCurrency}</div>
            <div className="font-medium text-slate-700">{t('jctPreview.base8ExclTax')}</div>
            <div className="text-right">{summary.net8.toLocaleString()} {displayCurrency}</div>
            <div className="font-medium text-slate-700">{t('jctPreview.consumptionTax8')}</div>
            <div className="text-right">{summary.tax8.toLocaleString()} {displayCurrency}</div>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
            <span>{t('jctPreview.totalInclTax')}</span>
            <span>{summary.total.toLocaleString()} {displayCurrency}</span>
          </div>
        </div>

        {/* 6. Buyer ID */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-slate-900">{t('jctPreview.billTo')}</span>
          <span>{displayBuyer}</span>
        </div>

        {/* Legal disclaimer footnote */}
        <p className="text-[10px] text-slate-500 border-t border-slate-100 pt-3 mt-3">
          {t('jctPreview.disclaimer')}
        </p>
      </div>
    </div>
  );
}
