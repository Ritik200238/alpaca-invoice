'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Loader2 } from 'lucide-react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useCreditProof } from '@/controller/Credit/useCreditProof';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useInvoiceListInitialize } from '@/controller/Invoice/useInvoiceListInitialize';
import { CreditService } from '@/services/CreditService/CreditServiceImpl';
import ConnectWalletCard from '@/components/connect-wallet-card';
import { EmptyState } from '@/components/ui/empty-state';
import { MotionContainer, MotionItem } from '@/components/ui/motion';
import type { CreditMetrics } from '@/lib/types';

import ZkValueBanner from '@/components/credit/zk-value-banner';
import CreditScoreRing from '@/components/credit/credit-score-ring';
import CreditRadarChart from '@/components/credit/credit-radar-chart';
import CreditDimensionCards from '@/components/credit/credit-dimension-cards';
import CreditProofGenerator from '@/components/credit-proof-generator';
import CreditProofVerifier from '@/components/credit-proof-verifier';

const DEMO_METRICS: CreditMetrics = {
  totalInvoices: 12,
  paidOnTime: 10,
  onTimeRate: 83.3,
  totalPaidAmount: BigInt(45_000_000),
  firstInvoiceDate: Math.floor(Date.now() / 1000) - 60 * 86400,
  disputeCount: 1,
};

const creditService = new CreditService();

export default function CreditCenterPage() {
  const t = useTranslations();
  const creditProof = useCreditProof();
  const wallet = useWallet();
  const { publicKey } = useUserStore();
  const invoices = useInvoiceStore((s) => s.invoices);
  const { isLoading: isInitializing, initialize } = useInvoiceListInitialize();
  const [demoMode, setDemoMode] = useState(false);
  const didAutoCollect = useRef(false);

  useEffect(() => {
    if (publicKey && wallet?.connected) {
      initialize();
    }
  }, [publicKey, wallet?.connected, initialize]);

  useEffect(() => {
    if (invoices.length > 0 && !creditProof.metrics && !didAutoCollect.current) {
      didAutoCollect.current = true;
      creditProof.collectLocalMetrics();
    }
  }, [invoices.length, creditProof.metrics, creditProof.collectLocalMetrics]);

  const activeMetrics = demoMode ? DEMO_METRICS : creditProof.metrics;

  const grade = useMemo(
    () => (activeMetrics ? creditService.computeGrade(activeMetrics) : null),
    [activeMetrics]
  );

  const handleLoadDemo = () => {
    setDemoMode(true);
  };

  const handleCollect = async () => {
    setDemoMode(false);
    didAutoCollect.current = false;
    await creditProof.collectLocalMetrics();
  };

  if (!publicKey) {
    return <ConnectWalletCard />;
  }

  if (isInitializing) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
        <p className="mt-4 text-sm text-primary-500">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <ZkValueBanner />

      {!activeMetrics && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-primary-300 bg-primary-50 py-12">
          <p className="text-sm text-primary-600">{t('credit.noDataYet')}</p>
          <div className="flex gap-3">
            <button
              onClick={handleCollect}
              disabled={creditProof.isProcessing}
              className="rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-accent-600 disabled:opacity-50"
            >
              {creditProof.isProcessing ? t('credit.collecting') : t('credit.collectButton')}
            </button>
            <button
              onClick={handleLoadDemo}
              className="flex items-center gap-2 rounded-lg border border-accent-300 bg-white px-5 py-2.5 text-sm font-medium text-accent-700 hover:bg-accent-50"
            >
              <Sparkles className="h-4 w-4" />
              {t('credit.loadDemo')}
            </button>
          </div>
        </div>
      )}

      {activeMetrics && grade && (
        <>
          {demoMode && (
            <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-2 text-sm text-warning-700">
              {t('credit.demoLoaded')}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="surface-card flex flex-col items-center justify-center p-6">
              <h3 className="mb-4 text-sm font-semibold text-primary-600 uppercase tracking-wide">
                {t('credit.overallGrade')}
              </h3>
              <CreditScoreRing score={grade.score} grade={grade.letter} size={200} />
              <p className="mt-4 text-center text-sm text-primary-500 max-w-[280px]">
                {t('credit.gradeExplain')}
              </p>
            </div>

            <div className="surface-card flex flex-col items-center justify-center p-6">
              <h3 className="mb-4 text-sm font-semibold text-primary-600 uppercase tracking-wide">
                {t('credit.creditProfile')}
              </h3>
              <CreditRadarChart dimensions={grade.dimensions} size={260} />
            </div>
          </div>

          <CreditDimensionCards metrics={activeMetrics} dimensions={grade.dimensions} />

          <div className="surface-card p-5">
            <h2 className="text-lg font-semibold text-primary-900 mb-4">{t('credit.generate')}</h2>
            <CreditProofGenerator
              onGenerateProof={creditProof.generateProof}
              isProcessing={creditProof.isProcessing}
            />
          </div>

          <div className="surface-card p-5">
            <h2 className="text-lg font-semibold text-primary-900 mb-4">{t('credit.verify')}</h2>
            <CreditProofVerifier
              onVerify={creditProof.verifyProof}
              isProcessing={creditProof.isProcessing}
            />
          </div>
        </>
      )}
    </div>
  );
}
