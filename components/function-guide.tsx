'use client';

import { useTranslations } from 'next-intl';

export default function FunctionGuide() {
  const t = useTranslations();
  const functions = [
    {
      name: 'create_invoice',
      icon: '✏️',
      desc: t('functionGuide.createInvoice.desc'),
      params: [
        { name: 'buyer', desc: t('functionGuide.createInvoice.buyerParam') },
        { name: 'amount', desc: t('functionGuide.createInvoice.amountParam') },
        { name: 'due_date', desc: t('functionGuide.createInvoice.dueDateParam') },
        { name: 'invoice_hash', desc: t('functionGuide.createInvoice.invoiceHashParam') },
        { name: 'nonce', desc: t('functionGuide.createInvoice.nonceParam') }
      ],
      returns: t('functionGuide.createInvoice.returns'),
      role: 'Seller'
    },
    {
      name: 'verify_invoice',
      icon: '✅',
      desc: t('functionGuide.verifyInvoice.desc'),
      params: [
        { name: 'invoice', desc: t('functionGuide.verifyInvoice.invoiceParam') },
        { name: 'expected_hash', desc: t('functionGuide.verifyInvoice.expectedHashParam') }
      ],
      returns: t('functionGuide.verifyInvoice.returns'),
      role: 'Anyone'
    },
    {
      name: 'pay_invoice_credits_private',
      icon: '💰',
      desc: t('functionGuide.payInvoice.desc'),
      params: [
        { name: 'invoice', desc: t('functionGuide.payInvoice.invoiceParam') },
        { name: 'payment_nonce', desc: t('functionGuide.payInvoice.paymentNonceParam') },
        { name: 'paid_at', desc: t('functionGuide.payInvoice.paidAtParam') },
        { name: 'tx_id_hash', desc: t('functionGuide.payInvoice.txIdHashParam') }
      ],
      returns: t('functionGuide.payInvoice.returns'),
      role: 'Buyer',
      note: t('functionGuide.payInvoice.note')
    },
    {
      name: 'create_seller_receipt',
      icon: '🧾',
      desc: t('functionGuide.createSellerReceipt.desc'),
      params: [
        { name: 'invoice_id', desc: t('functionGuide.createSellerReceipt.invoiceIdParam') },
        { name: 'payer', desc: t('functionGuide.createSellerReceipt.payerParam') },
        { name: 'payee', desc: t('functionGuide.createSellerReceipt.payeeParam') },
        { name: 'amount', desc: t('functionGuide.createSellerReceipt.amountParam') },
        { name: 'payment_nonce', desc: t('functionGuide.createSellerReceipt.paymentNonceParam') }
      ],
      returns: t('functionGuide.createSellerReceipt.returns'),
      role: 'Seller'
    },
    {
      name: 'cancel_invoice',
      icon: '❌',
      desc: t('functionGuide.cancelInvoice.desc'),
      params: [
        { name: 'invoice', desc: t('functionGuide.cancelInvoice.invoiceParam') }
      ],
      returns: t('functionGuide.cancelInvoice.returns'),
      role: 'Seller',
      note: t('functionGuide.cancelInvoice.note')
    },
    {
      name: 'verify_payment',
      icon: '🔍',
      desc: t('functionGuide.verifyPayment.desc'),
      params: [
        { name: 'receipt', desc: t('functionGuide.verifyPayment.receiptParam') },
        { name: 'invoice', desc: t('functionGuide.verifyPayment.invoiceParam') }
      ],
      returns: t('functionGuide.verifyPayment.returns'),
      role: 'Anyone'
    }
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-slate-900">{t('functionGuide.title')}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {functions.map((fn) => (
          <div
            key={fn.name}
            className="rounded-xl bg-white border border-amber-200 p-5 hover:border-amber-400 transition-colors"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="text-2xl">{fn.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-sm font-mono font-semibold text-slate-900">
                    {fn.name}
                  </code>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                    {fn.role}
                  </span>
                </div>
                <p className="text-sm text-slate-600">{fn.desc}</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <div className="font-semibold text-slate-700 mb-1">{t('functionGuide.parameters')}</div>
                <ul className="space-y-1 pl-3">
                  {fn.params.map((p) => (
                    <li key={p.name} className="text-slate-600">
                      <code className="text-amber-700">{p.name}</code>: {p.desc}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="font-semibold text-slate-700 mb-1">{t('functionGuide.returnsLabel')}</div>
                <p className="text-slate-600 pl-3">{fn.returns}</p>
              </div>

              {fn.note && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2 mt-2">
                  <span className="font-semibold text-amber-700">{t('functionGuide.noteLabel')} </span>
                  <span className="text-slate-600">{fn.note}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
