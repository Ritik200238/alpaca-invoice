'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import AuditCenterV3 from '@/components/audit-center-v3';
import { ShieldCheck, FileSearch } from 'lucide-react';

export default function AuditPage() {
  const t = useTranslations();
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info-100">
              <ShieldCheck className="h-5 w-5 text-info-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-primary-900">{t('audit.center.title')}</h1>
              <p className="text-sm text-primary-500">
                {t('audit.center.description')}
              </p>
            </div>
          </div>
        </div>
        <div className="relative hidden h-20 w-20 md:block">
          <Image
            src="/images/mascot/mascot-shield.png"
            alt="Audit"
            fill
            className="object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      </div>

      <Link
        href="/audit/verify"
        data-tour="audit-center"
        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/50"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
          <FileSearch className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <div className="font-semibold text-slate-900">{t('audit.verify.linkTitle')}</div>
          <div className="text-sm text-slate-500">
            {t('audit.verify.linkDescription')}
          </div>
        </div>
      </Link>

      <AuditCenterV3 />
    </div>
  );
}
