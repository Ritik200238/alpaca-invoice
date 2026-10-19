import { useCallback, useMemo, useState } from 'react';
import { AuditService } from '@/services/AuditService/AuditServiceImpl';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { createInvoiceRegistryService } from '@/services/InvoiceRegistryService/createInvoiceRegistryService';
import type { AuditPackageEnvelope, AuditPackageEnvelopeV3 } from '@/types/audit-package';
import type {
  VerifyEnvelopePhasesResult,
  ValidateAuditPackageResult,
  VerifyAuditPackageV3Result
} from '@/services/AuditService/IAuditService';

/**
 * Audit Package Verify Controller
 *
 * - Preview: decrypt only (validateEnvelope), show disclosed content.
 * - Full verify: four-phase trustless verification (verifyEnvelopePhases).
 */
export function useAuditPackageVerify() {
  const [envelopeText, setEnvelopeText] = useState('');
  const [auditKey, setAuditKey] = useState('');
  const [result, setResult] = useState<VerifyEnvelopePhasesResult | null>(null);
  const [previewResult, setPreviewResult] = useState<ValidateAuditPackageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [v3Envelope, setV3Envelope] = useState<AuditPackageEnvelopeV3 | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerifyAuditPackageV3Result | null>(null);

  const auditService = useMemo(
    () =>
      new AuditService({
        signerAddress: null,
        signMessage: async () => {
          throw new Error('Not needed for verification');
        }
      }),
    []
  );
  const protocolService = useMemo(() => new AleoProtocolService(), []);
  const cryptoService = useMemo(() => new CryptoService(), []);
  const registry = useMemo(() => createInvoiceRegistryService(protocolService), [protocolService]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        const parsed = JSON.parse(text);
        setEnvelopeText(text);
        if (parsed?.version === '3.0.0' && parsed?.role) {
          setV3Envelope(parsed as AuditPackageEnvelopeV3);
        } else {
          setV3Envelope(null);
        }
        setVerificationResult(null);
        setError(null);
      } catch {
        setError('Invalid JSON file');
        setV3Envelope(null);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const importEnvelope = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json);
      setEnvelopeText(json);
      if (parsed?.version === '3.0.0' && parsed?.role) {
        setV3Envelope(parsed as AuditPackageEnvelopeV3);
      } else {
        setV3Envelope(null);
      }
      setVerificationResult(null);
      setError(null);
    } catch {
      setError('Invalid JSON');
      setV3Envelope(null);
    }
  }, []);

  const handlePreview = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      setError(null);
      setResult(null);
      setPreviewResult(null);
      setLoading(true);
      try {
        const envelope = JSON.parse(envelopeText) as AuditPackageEnvelope;
        const key = auditKey.trim().replace(/\s/g, '');
        if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
          setError('Audit Key must be 64 hex characters');
          return;
        }
        const res = await auditService.validateEnvelope(envelope, key);
        setPreviewResult(res);
      } catch (err: any) {
        setError(err?.message ?? 'Preview failed');
        setPreviewResult(null);
      } finally {
        setLoading(false);
      }
    },
    [envelopeText, auditKey, auditService]
  );

  const handleVerify = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setResult(null);
      setPreviewResult(null);
      setVerificationResult(null);
      setLoading(true);
      try {
        const key = auditKey.trim().replace(/\s/g, '');
        if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
          setError('Audit Key must be 64 hex characters');
          return;
        }
        const envelope = JSON.parse(envelopeText);
        if (envelope?.version === '3.0.0') {
          const res = await auditService.verifyV3(
            envelope as AuditPackageEnvelopeV3,
            key,
            { protocol: protocolService, crypto: cryptoService, registry }
          );
          setVerificationResult(res);
        } else {
          const res = await auditService.verifyEnvelopePhases(envelope as AuditPackageEnvelope, key, registry);
          setResult(res);
        }
      } catch (err: any) {
        setError(err?.message ?? 'Verification failed');
        setResult(null);
        setVerificationResult(null);
      } finally {
        setLoading(false);
      }
    },
    [envelopeText, auditKey, auditService, registry, protocolService, cryptoService]
  );

  const runVerification = useCallback(async () => {
    setError(null);
    setVerificationResult(null);
    setLoading(true);
    try {
      const key = auditKey.trim().replace(/\s/g, '');
      if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
        setError('Audit Key must be 64 hex characters');
        return;
      }
      if (!v3Envelope) {
        setError('Import a Wave 3 audit package (v3.0.0) first');
        return;
      }
      const res = await auditService.verifyV3(v3Envelope, key, {
        protocol: protocolService,
        crypto: cryptoService,
        registry
      });
      setVerificationResult(res);
    } catch (err: any) {
      setError(err?.message ?? 'Verification failed');
      setVerificationResult(null);
    } finally {
      setLoading(false);
    }
  }, [auditKey, v3Envelope, auditService, protocolService, cryptoService, registry]);

  const allStepsPassed =
    !!verificationResult?.step1Identity?.ok &&
    !!verificationResult?.step2MoneyFlow?.ok &&
    !!verificationResult?.step3TaxCheck?.ok;

  const exportPdfReport = useCallback(async () => {
    if (!verificationResult || !allStepsPassed) return;
    const report = {
      verifiedAt: new Date().toISOString(),
      overallValid: verificationResult.overallValid,
      step1Identity: verificationResult.step1Identity,
      step2MoneyFlow: verificationResult.step2MoneyFlow,
      step3TaxCheck: verificationResult.step3TaxCheck
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [verificationResult, allStepsPassed]);

  const handleExportReport = useCallback(() => {
    if (!result) return;
    const report = {
      verifiedAt: new Date().toISOString(),
      overallValid: result.overallValid,
      phases: {
        phase1: result.phase1,
        phase2: result.phase2,
        phase3: result.phase3,
        phase4: result.phase4,
        phase5: result.phase5
      },
      decryptedData: result.decrypted
        ? { invoiceId: result.decrypted.invoiceId, data: result.decrypted.data }
        : undefined
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-verification-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  /** Open a printable HTML report (user can "Print to PDF") */
  const handleExportPdfReport = useCallback(() => {
    const data = result ?? (verificationResult ? {
      overallValid: verificationResult.overallValid,
      phase1: { ok: verificationResult.step1Identity?.ok, message: verificationResult.step1Identity?.message },
      phase2: { ok: verificationResult.step2MoneyFlow?.ok, message: verificationResult.step2MoneyFlow?.message },
      phase3: { ok: verificationResult.step3TaxCheck?.ok, message: verificationResult.step3TaxCheck?.message }
    } : null);
    if (!data || !data.overallValid) return;
    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Compliance Report</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:1rem;}
h1{font-size:1.25rem;} .ok{color:#059669;} .fail{color:#dc2626;}
table{width:100%;border-collapse:collapse;} td,th{border:1px solid #e5e7eb;padding:0.5rem;text-align:left;}
</style></head><body>
<h1>Audit Compliance Report</h1>
<p>Generated: ${new Date().toISOString()}</p>
<p><strong>Result:</strong> <span class="${data.overallValid ? 'ok' : 'fail'}">${data.overallValid ? 'Valid' : 'Invalid'}</span></p>
<h2>Verification steps</h2>
<table>
<tr><th>Step</th><th>Status</th><th>Message</th></tr>
<tr><td>Step 1: Identity</td><td class="${data.phase1?.ok ? 'ok' : 'fail'}">${data.phase1?.ok ? 'Pass' : 'Fail'}</td><td>${data.phase1?.message ?? ''}</td></tr>
<tr><td>Step 2: Money flow</td><td class="${data.phase2?.ok ? 'ok' : 'fail'}">${data.phase2?.ok ? 'Pass' : 'Fail'}</td><td>${data.phase2?.message ?? ''}</td></tr>
<tr><td>Step 3: Tax check</td><td class="${data.phase3?.ok ? 'ok' : 'fail'}">${data.phase3?.ok ? 'Pass' : 'Fail'}</td><td>${data.phase3?.message ?? ''}</td></tr>
</table>
<p><small>Use your browser's Print dialog to save as PDF.</small></p>
</body></html>`;
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 300);
    }
  }, [result, verificationResult]);

  const detectedRole = v3Envelope?.role ?? null;

  return {
    envelopeText,
    setEnvelopeText,
    auditKey,
    setAuditKey,
    result,
    previewResult,
    loading,
    error,
    handleFileUpload,
    handlePreview,
    handleVerify,
    handleExportReport,
    handleExportPdfReport,
    envelope: v3Envelope,
    importEnvelope,
    detectedRole,
    runVerification,
    verificationResult,
    allStepsPassed,
    exportPdfReport
  };
}
