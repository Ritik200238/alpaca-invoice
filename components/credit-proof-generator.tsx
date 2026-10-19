'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Shield, TrendingUp, Clock, AlertTriangle, Award, BarChart3, Loader2, Copy, CheckCheck } from 'lucide-react';
import { CreditClaimType } from '@/lib/types';
import type { CreditClaim, CreditProofToken } from '@/lib/types';
import { encodeProofCode, thresholdDisplay, claimTypeLabel } from '@/lib/credit-proof-code';
import { Input } from '@/components/ui/input';

interface CreditProofGeneratorProps {
  onGenerateProof: (claim: CreditClaim) => Promise<CreditProofToken>;
  isProcessing: boolean;
}

export default function CreditProofGenerator({
  onGenerateProof,
  isProcessing,
}: CreditProofGeneratorProps) {
  const t = useTranslations();

  const claimTypes = [
    { type: CreditClaimType.ON_TIME_RATE, label: t('credit.claimType.onTimeRate'), icon: Clock },
    { type: CreditClaimType.VOLUME, label: t('credit.claimType.volume'), icon: BarChart3 },
    { type: CreditClaimType.AMOUNT_RANGE, label: t('credit.claimType.amountRange'), icon: TrendingUp },
    { type: CreditClaimType.ACCOUNT_AGE, label: t('credit.claimType.accountAge'), icon: Award },
    { type: CreditClaimType.DISPUTE_RATE, label: t('credit.claimType.disputeRate'), icon: AlertTriangle },
  ];

  const [selectedType, setSelectedType] = useState<CreditClaimType>(CreditClaimType.ON_TIME_RATE);
  const [threshold, setThreshold] = useState(90);
  const [generatedProof, setGeneratedProof] = useState<CreditProofToken | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [proofCode, setProofCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastClaim, setLastClaim] = useState<{ type: CreditClaimType; threshold: number } | null>(null);

  const handleGenerate = async () => {
    setGenerateError(null);
    setProofCode(null);
    setCopied(false);
    const claim: CreditClaim = {
      claimType: selectedType,
      threshold,
      periodStart: new Date(Date.now() - 365 * 86400 * 1000),
      periodEnd: new Date(),
    };
    try {
      const proof = await onGenerateProof(claim);
      setGeneratedProof(proof);
      setLastClaim({ type: selectedType, threshold });

      const code = encodeProofCode({
        txId: proof.transactionId,
        claimType: selectedType,
        threshold,
        generatedAt: Math.floor(proof.generatedAt.getTime() / 1000),
        expiresAt: Math.floor(proof.expiresAt.getTime() / 1000),
      });
      setProofCode(code);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? 'Unknown error');
      setGenerateError(msg);
    }
  };

  const handleCopy = async () => {
    if (!proofCode) return;
    await navigator.clipboard.writeText(proofCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {claimTypes.map(ct => {
          const Icon = ct.icon;
          const active = selectedType === ct.type;
          return (
            <button
              key={ct.type}
              onClick={() => setSelectedType(ct.type)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? 'border-accent-400 bg-accent-50 text-accent-800'
                  : 'border-primary-200 text-primary-600 hover:bg-primary-50'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {ct.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-primary-600 mb-1">
            {t('credit.threshold')}
          </label>
          <Input
            type="number"
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
          />
        </div>
        <button
          onClick={handleGenerate}
          disabled={isProcessing}
          className="flex items-center gap-2 rounded-lg bg-accent-500 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-600 disabled:opacity-50"
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Shield className="h-4 w-4" />
          )}
          {isProcessing ? t('credit.generating') : t('credit.generateButton')}
        </button>
      </div>

      {generateError && (
        <div className="rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-700">
          {generateError}
        </div>
      )}

      {generatedProof && proofCode && lastClaim && (
        <div className="rounded-xl border-2 border-success-200 bg-success-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-success-600" />
            <span className="font-semibold text-success-700">{t('credit.proofGenerated')}</span>
          </div>

          <div className="rounded-lg bg-white/70 border border-success-200 p-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-primary-500">{t('credit.claimLabel')}</span>
              <span className="font-medium text-primary-800">
                {t(`credit.claimType.${claimTypeLabel(lastClaim.type)}`)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-primary-500">{t('credit.thresholdLabel')}</span>
              <span className="font-semibold text-accent-700">
                {thresholdDisplay(lastClaim.type, lastClaim.threshold)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-primary-500">{t('credit.expiresLabel')}</span>
              <span className="text-primary-800">{generatedProof.expiresAt.toLocaleDateString()}</span>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-primary-600 mb-1.5">{t('credit.proofCodeLabel')}</p>
            <div className="flex gap-2">
              <code className="flex-1 rounded-lg bg-white/80 border border-primary-200 px-3 py-2 text-xs text-primary-700 break-all select-all leading-relaxed">
                {proofCode}
              </code>
              <button
                onClick={handleCopy}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-primary-200 bg-white px-3 py-2 text-xs font-medium text-primary-600 hover:bg-primary-50 transition-colors"
              >
                {copied ? (
                  <><CheckCheck className="h-3.5 w-3.5 text-success-600" />{t('credit.copied')}</>
                ) : (
                  <><Copy className="h-3.5 w-3.5" />{t('credit.copyCode')}</>
                )}
              </button>
            </div>
            <p className="text-xs text-primary-400 mt-2">
              {t('credit.shareProofCode')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
