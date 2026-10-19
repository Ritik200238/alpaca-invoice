'use client';

import Image from 'next/image';
import InvoiceForm from '@/components/invoice-form';
import ConnectWalletCard from '@/components/connect-wallet-card';
import { FilePlus } from 'lucide-react';
import { useCreateInvoicePage } from '@/controller/Invoice/useCreateInvoicePage';
import { useUserStore } from '@/stores/User/useUserStore';

export default function CreateInvoicePage() {
  const { title, description, mascotSrc, mascotAlt } = useCreateInvoicePage();
  const publicKey = useUserStore((s) => s.publicKey);

  if (!publicKey) {
    return <ConnectWalletCard />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-3" data-tour="invoice-form">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-100">
              <FilePlus className="h-5 w-5 text-accent-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-primary-900">{title}</h1>
              <p className="text-sm text-primary-500">{description}</p>
            </div>
          </div>
        </div>
        <div className="relative hidden h-20 w-20 md:block">
          <Image
            src={mascotSrc}
            alt={mascotAlt}
            fill
            className="object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      </div>

      <div className="rounded-xl border border-primary-200 bg-white p-3 shadow-sm">
        <InvoiceForm />
      </div>
    </div>
  );
}
