'use client';

import { useState } from 'react';
import type { ReceiptItem } from '@/stores/Receipt/useReceiptStore';
import type { InvoiceDetails, LineItem } from '@/lib/types';
import { format } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ChevronDown, Copy, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';

type ReceiptCardDetails = InvoiceDetails & { lineItems: (LineItem & { taxRate?: number })[] };
type ReceiptCardItem = ReceiptItem & { details?: ReceiptCardDetails };

interface ReceiptCardProps {
  receipt: ReceiptCardItem;
  explorerTxUrl?: string | null;
}

export default function ReceiptCard({ receipt, explorerTxUrl = null }: ReceiptCardProps) {
  const t = useTranslations();
  const truncateAddress = (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-6)}`;
  const [expanded, setExpanded] = useState(false);

  return (
    <TooltipProvider>
      <div className="group relative overflow-hidden rounded-2xl border border-white/60 bg-white/80 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-[0_22px_46px_-24px_rgba(15,23,42,0.35)]">
        {/* Left status bar — paid */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-success-500" />

        <div className="p-5 pl-6">
          {/* Header: Payment ID */}
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="mb-1 text-xs font-medium text-primary-500">{t('receipt.paymentId')}</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm font-semibold text-primary-900">
                      {String(receipt.paymentId).slice(0, 16)}...
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(String(receipt.paymentId))}
                      className="cursor-pointer text-primary-400 hover:text-primary-600"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-mono text-xs">{String(receipt.paymentId)}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-success-100/80 px-2.5 py-1 text-xs font-semibold text-success-700 ring-1 ring-white/60">
              {t('invoice.status.paid')}
            </span>
          </div>

          {/* Amount */}
          <div className="mb-4">
            <p className="mb-1 text-xs font-medium text-primary-500">{t('receipt.amount')}</p>
            <p className="text-2xl font-bold text-primary-900">
              {(Number(receipt.amount) / 1_000_000).toFixed(2)}
              <span className="ml-1.5 text-sm font-normal text-primary-500">{t('invoice.card.credits')}</span>
            </p>
          </div>

          {/* Details grid */}
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="mb-0.5 text-xs text-primary-500">{t('receipt.payer')}</p>
              <div className="flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded bg-primary-50 px-2 py-1 text-xs text-primary-700">
                  {truncateAddress(receipt.payer)}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(receipt.payer)}
                  className="shrink-0 cursor-pointer rounded p-1 text-primary-400 hover:bg-primary-100 hover:text-primary-600"
                  title={t('receipt.copyPayer')}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div>
              <p className="mb-0.5 text-xs text-primary-500">{t('receipt.payee')}</p>
              <div className="flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded bg-primary-50 px-2 py-1 text-xs text-primary-700">
                  {truncateAddress(receipt.payee)}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(receipt.payee)}
                  className="shrink-0 cursor-pointer rounded p-1 text-primary-400 hover:bg-primary-100 hover:text-primary-600"
                  title={t('receipt.copyPayee')}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div>
              <p className="mb-0.5 text-xs text-primary-500">{t('receipt.paidAt')}</p>
              <p className="font-medium text-primary-800">
                {format(receipt.paidAt, 'MMM dd, yyyy HH:mm')}
              </p>
            </div>
            <div>
              <p className="mb-0.5 text-xs text-primary-500">{t('receipt.invoiceId')}</p>
              <div className="flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded bg-primary-50 px-2 py-1 text-xs text-primary-700">
                  {String(receipt.invoiceId).slice(0, 12)}...
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(String(receipt.invoiceId))}
                  className="shrink-0 cursor-pointer rounded p-1 text-primary-400 hover:bg-primary-100 hover:text-primary-600"
                  title={t('receipt.copyInvoiceId')}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {receipt.details && (
            <div className="mb-4 flex items-center justify-between rounded-lg bg-accent-50/60 px-3 py-2 ring-1 ring-accent-200/30">
              <div className="flex items-center gap-2 text-xs text-accent-700">
                <span className="font-medium">
                  {receipt.details.lineItems.length} {receipt.details.lineItems.length !== 1 ? t('invoice.card.items') : t('invoice.card.item')}
                </span>
                {receipt.details.currency && (
                  <>
                    <span className="text-accent-500">·</span>
                    <span>{receipt.details.currency}</span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex cursor-pointer items-center gap-1 text-xs font-medium text-accent-600 transition-colors hover:text-accent-800"
              >
                {expanded ? t('invoice.card.hide') : t('invoice.card.details')}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )}

          {/* Expandable line items — inside the card, same as invoice-card */}
          {receipt.details && expanded && (
            <div className="border-t border-primary-100/60">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-primary-100/60 bg-primary-50/50">
                    <th className="px-4 py-2 font-medium text-primary-500">{t('invoice.card.item')}</th>
                    <th className="px-3 py-2 text-right font-medium text-primary-500">{t('invoice.card.qty')}</th>
                    <th className="px-3 py-2 text-right font-medium text-primary-500">{t('invoice.card.price')}</th>
                    <th className="px-4 py-2 text-right font-medium text-primary-500">{t('receipt.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.details.lineItems.map((item, idx) => (
                    <tr key={idx} className="border-b border-primary-50/80 last:border-0">
                      <td className="px-4 py-2 text-primary-800">{item.description}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-primary-700">{item.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-primary-700">{Number(item.unitPrice).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-primary-900">{Number(item.amount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-primary-100/60 bg-primary-50/30">
                    <td colSpan={3} className="px-3 py-2 text-right text-primary-500">{t('invoice.create.subtotal')}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-primary-800">{Number(receipt.details.subtotal).toFixed(2)}</td>
                  </tr>
                  {receipt.details.taxAmount > 0 && (
                    <tr className="bg-primary-50/30">
                      <td colSpan={3} className="px-3 py-2 text-right text-primary-500">{t('invoice.card.tax')}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-primary-800">{Number(receipt.details.taxAmount).toFixed(2)}</td>
                    </tr>
                  )}
                  <tr className="bg-primary-50/30">
                    <td colSpan={3} className="px-3 py-2 text-right font-semibold text-primary-700">{t('invoice.create.total')}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-bold text-primary-900">{Number(receipt.details.total).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {explorerTxUrl && (
            <div className="flex gap-2 border-t border-primary-100/70 pt-4">
              <a
                href={explorerTxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary-200/60 bg-white/70 px-3 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-white"
                title="View transaction on explorer"
              >
                <ExternalLink className="h-4 w-4" />
                {t('invoice.card.explorer')}
              </a>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
