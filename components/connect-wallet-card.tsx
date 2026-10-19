'use client';

import Image from 'next/image';
import { Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ConnectWalletCardProps {
  className?: string;
}

export default function ConnectWalletCard({ className }: ConnectWalletCardProps) {
  const t = useTranslations();

  return (
    <div className={className}>
      <div className="flex min-h-[40vh] flex-col items-center justify-center">
        <div className="rounded-2xl border border-slate-200/60 bg-white px-10 py-10 text-center shadow-sm">
          <div className="relative mx-auto mb-6 h-32 w-32">
            <Image
              src="/images/mascot/mascot-waiting.png"
              alt="Connect wallet"
              fill
              className="object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-100/80 ring-1 ring-accent-200/40">
            <Wallet className="h-6 w-6 text-accent-600" />
          </div>
          <h2 className="text-xl font-bold text-primary-900">
            {t('wallet.connect')}
          </h2>
          <p className="mt-2 max-w-xs text-sm text-primary-500">
            {t('wallet.connectPrompt')}
          </p>
        </div>
      </div>
    </div>
  );
}
