'use client';
import type {
  VerifyEnvelopePhasesResult,
  VerifyPhaseResult,
  ValidateAuditPackageResult,
  VerifyAuditPackageV3Result
} from '@/services/AuditService/IAuditService';
import { useTranslations } from 'next-intl';
import { Check, X, ChevronDown, ChevronRight, FileJson, Key, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

function PhaseCard({
  title,
  phase,
  defaultExpanded = true
}: {
  title: string;
  phase: VerifyPhaseResult;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div
      className={`overflow-hidden rounded-xl border ${
        phase.ok ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          {phase.ok ? (
            <Check className="h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <X className="h-5 w-5 shrink-0 text-red-600" />
          )}
          <span className="font-semibold text-slate-900">{title}</span>
          <span className="text-sm text-slate-600">{phase.message}</span>
        </div>
        {expanded ? (
          <ChevronDown className="h-5 w-5 text-slate-500" />
        ) : (
          <ChevronRight className="h-5 w-5 text-slate-500" />
        )}
      </button>
      {expanded && phase.checks && phase.checks.length > 0 && (
        <div className="border-t border-slate-200/80 bg-white/60 px-4 py-3">
          <div className="space-y-2">
            {phase.checks.map((c) => (
              <div
                key={c.key}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  c.ok ? 'bg-emerald-100/80 text-emerald-800' : 'bg-red-100/80 text-red-800'
                }`}
              >
                {c.ok ? <Check className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
                <span className="font-medium">{c.key}:</span>
                <span>{c.detail ?? (c.ok ? 'ok' : 'failed')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** V3 Step Card for 3-step verification (Identity, Money Flow, Tax Check) */
function V3StepCard({
  title,
  ok,
  message,
  checks,
  defaultExpanded = true
}: {
  title: string;
  ok: boolean;
  message: string;
  checks?: { key: string; ok: boolean; detail?: string }[];
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div
      className={`overflow-hidden rounded-xl border ${
        ok ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          {ok ? (
            <Check className="h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <X className="h-5 w-5 shrink-0 text-red-600" />
          )}
          <span className="font-semibold text-slate-900">{title}</span>
          <span className="text-sm text-slate-600">{message}</span>
        </div>
        {expanded ? (
          <ChevronDown className="h-5 w-5 text-slate-500" />
        ) : (
          <ChevronRight className="h-5 w-5 text-slate-500" />
        )}
      </button>
      {expanded && checks && checks.length > 0 && (
        <div className="border-t border-slate-200/80 bg-white/60 px-4 py-3">
          <div className="space-y-2">
            {checks.map((c) => (
              <div
                key={c.key}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  c.ok ? 'bg-emerald-100/80 text-emerald-800' : 'bg-red-100/80 text-red-800'
                }`}
              >
                {c.ok ? <Check className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
                <span className="font-medium">{c.key}:</span>
                <span>{c.detail ?? (c.ok ? 'ok' : 'failed')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export interface AuditVerifyFlowProps {
  envelopeText: string;
  setEnvelopeText: (value: string) => void;
  auditKey: string;
  setAuditKey: (value: string) => void;
  result: VerifyEnvelopePhasesResult | null;
  /** Wave 3 verification result (3-step: Identity, Money Flow, Tax Check) */
  v3Result?: VerifyAuditPackageV3Result | null;
  previewResult: ValidateAuditPackageResult | null;
  loading: boolean;
  error: string | null;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPreview: (e?: React.FormEvent) => void;
  onVerify: (e: React.FormEvent) => void;
  onExportReport: () => void;
  /** Export compliance report as printable PDF (opens print dialog) */
  onExportPdfReport?: () => void;
}

export default function AuditVerifyFlow({
  envelopeText,
  setEnvelopeText,
  auditKey,
  setAuditKey,
  result,
  v3Result,
  previewResult,
  loading,
  error,
  onFileUpload,
  onPreview,
  onVerify,
  onExportReport,
  onExportPdfReport
}: AuditVerifyFlowProps) {
  const t = useTranslations();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string>('');

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.files?.[0]?.name ?? '';
    setFileName(name);
    onFileUpload(e);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onVerify} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <FileJson className="h-4 w-4" />
              {t('audit.verify.packageJson')}
            </label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleChooseFile}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Upload className="h-4 w-4" />
                  {t('audit.verify.selectFile')}
                </button>
                {fileName && <span className="text-xs text-slate-500 truncate">{fileName}</span>}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
            <Textarea
              value={envelopeText}
              onChange={(e) => setEnvelopeText(e.target.value)}
              placeholder={t('audit.verify.pastePlaceholder')}
              rows={8}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Key className="h-4 w-4" />
              {t('audit.verify.auditKey')}
            </label>
            <p className="text-xs text-slate-500">
              {t('audit.verify.auditKeyDesc')}
            </p>
            <Input
              type="text"
              value={auditKey}
              onChange={(e) => setAuditKey(e.target.value)}
              placeholder={t('audit.verify.auditKeyPlaceholder')}
              className="font-mono"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onPreview()}
            disabled={loading || !envelopeText.trim() || !auditKey.trim()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? '...' : t('audit.verify.previewDisclosed')}
          </button>
          <button
            type="submit"
            disabled={loading || !envelopeText.trim() || !auditKey.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {loading ? t('audit.verify.verifying') : t('audit.verify.fullVerification')}
          </button>
        </div>
      </form>

      {previewResult !== null && (
        <div className="space-y-4">
          <div
            className={`flex items-center rounded-xl border px-4 py-3 ${
              previewResult.valid ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'
            }`}
          >
            <div className="flex items-center gap-3">
              {previewResult.valid ? (
                <Check className="h-6 w-6 text-emerald-600" />
              ) : (
                <X className="h-6 w-6 text-red-600" />
              )}
              <span className="font-semibold text-slate-900">
                {previewResult.valid ? t('audit.verify.disclosedDecrypted') : previewResult.reason ?? t('audit.verify.decryptionFailed')}
              </span>
            </div>
          </div>
          {previewResult.valid && previewResult.decrypted?.data && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">{t('audit.verify.disclosedPreview')}</h3>
              <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
                {JSON.stringify(previewResult.decrypted.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div
            className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
              result.overallValid ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'
            }`}
          >
            <div className="flex items-center gap-3">
              {result.overallValid ? (
                <Check className="h-6 w-6 text-emerald-600" />
              ) : (
                <X className="h-6 w-6 text-red-600" />
              )}
              <span className="font-semibold text-slate-900">
                {result.overallValid ? t('audit.verify.packageValid') : t('audit.verify.packageInvalid')}
              </span>
            </div>
            {result.overallValid && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onExportReport}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t('audit.verify.exportJson')}
                </button>
                {onExportPdfReport && (
                  <button
                    type="button"
                    onClick={onExportPdfReport}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    {t('audit.verify.exportPdf')}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">{t('audit.verify.pipelineTitle')}</h3>
            <PhaseCard title={t('audit.verify.step1')} phase={result.phase1} defaultExpanded={true} />
            <PhaseCard title={t('audit.verify.step2')} phase={result.phase2} defaultExpanded={true} />
            <div className="space-y-2">
              <PhaseCard title={t('audit.verify.step3a')} phase={result.phase3} defaultExpanded={false} />
              <PhaseCard title={t('audit.verify.step3b')} phase={result.phase4} defaultExpanded={false} />
              <PhaseCard title={t('audit.verify.step3c')} phase={result.phase5} defaultExpanded={false} />
            </div>
          </div>

          {result.decrypted && result.overallValid && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">{t('audit.verify.decryptedData')}</h3>
              <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
                {JSON.stringify(result.decrypted.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Wave 3 Verification Result (3-step) */}
      {v3Result && (
        <div className="space-y-4">
          <div
            className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
              v3Result.overallValid ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'
            }`}
          >
            <div className="flex items-center gap-3">
              {v3Result.overallValid ? (
                <Check className="h-6 w-6 text-emerald-600" />
              ) : (
                <X className="h-6 w-6 text-red-600" />
              )}
              <span className="font-semibold text-slate-900">
                {v3Result.overallValid ? t('audit.verify.packageValid') : t('audit.verify.packageInvalid')}
              </span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                Wave 3
              </span>
            </div>
            {v3Result.overallValid && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onExportReport}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t('audit.verify.exportJson')}
                </button>
                {onExportPdfReport && (
                  <button
                    type="button"
                    onClick={onExportPdfReport}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    {t('audit.verify.exportPdf')}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">{t('audit.verify.pipelineTitle')} (Wave 3)</h3>

            {/* Step 1: Identity */}
            <V3StepCard
              title="Step 1: Identity (JCT Registration)"
              ok={v3Result.step1Identity.ok}
              message={v3Result.step1Identity.message}
              checks={[
                ...(v3Result.step1Identity.tNumber ? [{ key: 'T-Number', ok: true, detail: v3Result.step1Identity.tNumber }] : []),
                ...(v3Result.step1Identity.hashMatch !== undefined ? [{ key: 'Hash Match', ok: v3Result.step1Identity.hashMatch, detail: v3Result.step1Identity.hashMatch ? 'Chain jct_registration matches' : 'Hash mismatch' }] : []),
                ...(v3Result.step1Identity.ntaApiResult ? [{ key: 'NTA API', ok: true, detail: `${v3Result.step1Identity.ntaApiResult.name} (${v3Result.step1Identity.ntaApiResult.status})` }] : [])
              ]}
              defaultExpanded={true}
            />

            {/* Step 2: Money Flow */}
            <V3StepCard
              title="Step 2: Money Flow (Payment Verification)"
              ok={v3Result.step2MoneyFlow.ok}
              message={v3Result.step2MoneyFlow.message}
              checks={[
                ...(v3Result.step2MoneyFlow.txIdHash ? [{ key: 'Settlement Anchor', ok: true, detail: `${String(v3Result.step2MoneyFlow.txIdHash).slice(0, 20)}...` }] : []),
                ...(v3Result.step2MoneyFlow.amountMatch !== undefined ? [{ key: 'Amount Match', ok: v3Result.step2MoneyFlow.amountMatch, detail: v3Result.step2MoneyFlow.amountMatch ? 'Payment amount verified' : 'Amount mismatch' }] : []),
                ...(v3Result.step2MoneyFlow.transfers?.map((t, i) => ({ key: `Transfer ${i + 1}`, ok: true, detail: `${String(t.from).slice(0, 12)}... → ${String(t.to).slice(0, 12)}... (${t.amount})` })) ?? [])
              ]}
              defaultExpanded={true}
            />

            {/* Step 3: Tax Check */}
            <V3StepCard
              title="Step 3: Tax Check (JCT Compliance)"
              ok={v3Result.step3TaxCheck.ok}
              message={v3Result.step3TaxCheck.message}
              checks={[
                ...(v3Result.step3TaxCheck.verificationA ? [{ key: 'A: Tax Calculation', ok: v3Result.step3TaxCheck.verificationA.ok, detail: v3Result.step3TaxCheck.verificationA.detail ?? (v3Result.step3TaxCheck.verificationA.ok ? 'net * rate = tax' : 'Calculation error') }] : []),
                ...(v3Result.step3TaxCheck.verificationB ? [{ key: 'B: Tax Tag Hash', ok: v3Result.step3TaxCheck.verificationB.ok, detail: v3Result.step3TaxCheck.verificationB.detail ?? (v3Result.step3TaxCheck.verificationB.ok ? 'BHP256(TaxGroups) matches' : 'Hash mismatch') }] : []),
                ...(v3Result.step3TaxCheck.verificationC ? [{ key: 'C: Total Amount', ok: v3Result.step3TaxCheck.verificationC.ok, detail: v3Result.step3TaxCheck.verificationC.detail ?? (v3Result.step3TaxCheck.verificationC.ok ? 'Sum equals total' : 'Total mismatch') }] : []),
                ...(v3Result.step3TaxCheck.chainTaxTag ? [{ key: 'Chain Tax Tag', ok: true, detail: `${String(v3Result.step3TaxCheck.chainTaxTag).slice(0, 20)}...` }] : [])
              ]}
              defaultExpanded={true}
            />
          </div>

          {/* Tax Groups Details */}
          {v3Result.step3TaxCheck.taxGroups && v3Result.overallValid && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Tax Groups (Decrypted)</h3>
              <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
                {JSON.stringify(v3Result.step3TaxCheck.taxGroups, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
