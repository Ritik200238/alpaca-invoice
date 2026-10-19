'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import AuditVerifyFlow from '@/components/audit-verify-flow';
import { useAuditPackageVerify } from '@/controller/Audit/useAuditPackageVerify';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

export default function AuditVerifyPage() {
  const t = useTranslations();
  const controller = useAuditPackageVerify();
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6">
        <div className="flex-1">
          <Link
            href="/audit"
            className="mb-4 inline-flex items-center gap-2 text-sm text-primary-500 hover:text-primary-700"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('audit.verify.backToCenter')}
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-primary-900">{t('audit.verify.title')}</h1>
              <p className="text-sm text-primary-500">
                {t('audit.verify.pageDescription')}
              </p>
            </div>
          </div>
        </div>
        <div className="relative hidden h-20 w-20 md:block">
          <Image
            src="/images/mascot/mascot-shield.png"
            alt="Verify"
            fill
            className="object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      </div>

      <AuditVerifyFlow
        envelopeText={controller.envelopeText}
        setEnvelopeText={controller.setEnvelopeText}
        auditKey={controller.auditKey}
        setAuditKey={controller.setAuditKey}
        result={controller.result}
        v3Result={controller.verificationResult}
        previewResult={controller.previewResult}
        loading={controller.loading}
        error={controller.error}
        onFileUpload={controller.handleFileUpload}
        onPreview={controller.handlePreview}
        onVerify={controller.handleVerify}
        onExportReport={controller.handleExportReport}
        onExportPdfReport={controller.handleExportPdfReport}
      />
    </div>
  );
}
