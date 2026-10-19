'use client';

import { Lock, Link2, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function ZkValueBanner() {
  const t = useTranslations('credit');

  const features = [
    { icon: Lock, titleKey: 'zkPrivacy', descKey: 'zkPrivacyDesc' },
    { icon: Link2, titleKey: 'zkOnChain', descKey: 'zkOnChainDesc' },
    { icon: ShieldCheck, titleKey: 'zkUnforgeable', descKey: 'zkUnforgeableDesc' },
  ] as const;

  return (
    <div className="rounded-2xl bg-gradient-to-r from-primary-900 via-primary-800 to-primary-900 p-6 text-white shadow-lg">
      <h2 className="text-xl font-bold tracking-tight">
        {t('zkBannerTitle')}
      </h2>
      <p className="mt-1 text-sm text-primary-300">
        {t('zkBannerSubtitle')}
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {features.map((f) => {
          const Icon = f.icon;
          return (
            <div
              key={f.titleKey}
              className="flex items-start gap-3 rounded-xl bg-white/8 p-3 backdrop-blur-sm"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-500/20">
                <Icon className="h-4.5 w-4.5 text-accent-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">{t(f.titleKey)}</p>
                <p className="text-xs text-primary-400">{t(f.descKey)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
