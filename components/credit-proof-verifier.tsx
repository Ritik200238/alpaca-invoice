'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search, CheckCircle, XCircle, Loader2, ShieldCheck, Clock, Info } from 'lucide-react';
import type { CreditVerifyResult } from '@/lib/types';
import { decodeProofCode, claimTypeLabel, thresholdDisplay, type ShareableProof } from '@/lib/credit-proof-code';
import { Input } from '@/components/ui/input';

interface CreditProofVerifierProps {
  onVerify: (proofId: string) => Promise<CreditVerifyResult>;
  isProcessing: boolean;
}

export default function CreditProofVerifier({
  onVerify,
  isProcessing,
}: CreditProofVerifierProps) {
  const t = useTranslations();
  const [input, setInput] = useState('');
  const [result, setResult] = useState<CreditVerifyResult | null>(null);
  const [decodedClaim, setDecodedClaim] = useState<ShareableProof | null>(null);

  const handleVerify = async () => {
    if (!input.trim()) return;

    const decoded = decodeProofCode(input.trim());
    setDecodedClaim(decoded);

    const txId = decoded ? decoded.txId : input.trim();
    const res = await onVerify(txId);
    setResult(res);
  };

  const isExpired = decodedClaim
    ? decodedClaim.expiresAt * 1000 < Date.now()
    : false;

  return (
    <div className="space-y-4">
      <p className="text-xs text-primary-500">
        {t('credit.verifyDescription')}
      </p>

      <div className="flex gap-2">
        <Input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={t('credit.verifyInput')}
          className="flex-1"
        />
        <button
          onClick={handleVerify}
          disabled={isProcessing || !input.trim()}
          className="flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-600 disabled:opacity-50"
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {isProcessing ? t('credit.verifying') : t('credit.verifyButton')}
        </button>
      </div>

      {result && (
        <div className="space-y-3">
          {decodedClaim && (
            <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-4">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 uppercase tracking-wide mb-3">
                <Info className="h-3.5 w-3.5" />
                {t('credit.claimDetails')}
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-primary-500">{t('credit.claimLabel')}</span>
                  <span className="font-medium text-primary-800">
                    {t(`credit.claimType.${claimTypeLabel(decodedClaim.claimType)}`)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-primary-500">{t('credit.thresholdLabel')}</span>
                  <span className="font-semibold text-accent-700">
                    {thresholdDisplay(decodedClaim.claimType, decodedClaim.threshold)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-primary-500">{t('credit.generatedAtLabel')}</span>
                  <span className="text-primary-800">
                    {new Date(decodedClaim.generatedAt * 1000).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-primary-500">{t('credit.expiresLabel')}</span>
                  <span className={isExpired ? 'font-medium text-error-600' : 'text-primary-800'}>
                    {new Date(decodedClaim.expiresAt * 1000).toLocaleDateString()}
                    {isExpired && ` (${t('credit.expired')})`}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div
            className={`rounded-xl border-2 p-4 ${
              result.isValid && !isExpired
                ? 'border-success-200 bg-success-50'
                : 'border-error-200 bg-error-50'
            }`}
          >
            <div className="flex items-center gap-2">
              {result.isValid && !isExpired ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-success-600" />
                  <span className="font-semibold text-success-700">{t('credit.chainVerified')}</span>
                </>
              ) : isExpired && result.isValid ? (
                <>
                  <Clock className="h-5 w-5 text-error-600" />
                  <span className="font-semibold text-error-700">{t('credit.proofExpired')}</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-error-600" />
                  <span className="font-semibold text-error-700">{t('credit.invalidProof')}</span>
                </>
              )}
            </div>
            <p className="mt-2 text-sm text-primary-600">
              {result.isValid && !isExpired
                ? (decodedClaim
                    ? t('credit.verifiedWithClaim')
                    : t('credit.valid'))
                : isExpired
                  ? t('credit.expiredExplain')
                  : result.error ?? t('credit.invalid')}
            </p>
          </div>

          {!decodedClaim && result.isValid && (
            <div className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-700">
              {t('credit.rawTxWarning')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
