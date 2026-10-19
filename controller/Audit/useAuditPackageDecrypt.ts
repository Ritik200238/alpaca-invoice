import { useCallback, useMemo, useState } from 'react';
import { AuditService } from '@/services/AuditService/AuditServiceImpl';
import type { AuditPackageEnvelope } from '@/types/audit-package';
import type { ValidateAuditPackageResult } from '@/services/AuditService/IAuditService';

/**
 * Audit Package Decrypt Controller
 *
 * Single responsibility: decrypt audit package (envelope + auditKey → decrypted payload).
 * Uses AuditService.validateEnvelope (decrypt + integrity check; no on-chain asserts).
 */
export function useAuditPackageDecrypt() {
  const [envelopeText, setEnvelopeText] = useState('');
  const [auditKey, setAuditKey] = useState('');
  const [decryptResult, setDecryptResult] = useState<ValidateAuditPackageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auditService = useMemo(
    () =>
      new AuditService({
        signerAddress: null,
        signMessage: async () => {
          throw new Error('Not needed for decryption');
        }
      }),
    []
  );

  /**
   * Decrypt envelope with audit key. Returns valid + decrypted payload or reason on failure.
   */
  const decrypt = useCallback(
    async (
      envelope: AuditPackageEnvelope,
      key: string
    ): Promise<ValidateAuditPackageResult> => {
      const result = await auditService.validateEnvelope(envelope, key);
      return result;
    },
    [auditService]
  );

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        JSON.parse(text);
        setEnvelopeText(text);
        setError(null);
      } catch {
        setError('Invalid JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const handleDecrypt = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      setError(null);
      setDecryptResult(null);
      setLoading(true);
      try {
        const envelope = JSON.parse(envelopeText) as AuditPackageEnvelope;
        const key = auditKey.trim().replace(/\s/g, '');
        if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
          setError('Audit Key must be 64 hex characters');
          return;
        }
        const result = await auditService.validateEnvelope(envelope, key);
        setDecryptResult(result);
      } catch (err: any) {
        setError(err?.message ?? 'Decryption failed');
        setDecryptResult(null);
      } finally {
        setLoading(false);
      }
    },
    [envelopeText, auditKey, auditService]
  );

  return {
    envelopeText,
    setEnvelopeText,
    auditKey,
    setAuditKey,
    decryptResult,
    loading,
    error,
    decrypt,
    handleFileUpload,
    handleDecrypt
  };
}
