import { useCallback, useMemo, useState } from 'react';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { FIELD_SCOPE_IDS, getDefaultAuditExpiresAt } from '@/controller/Audit/auditConstants';

const DEFAULT_SCOPES = ['amount', 'tax_amount', 'buyer', 'seller'];

/**
 * useInvoiceFormAudit
 *
 * Manages audit authorization state for the invoice creation form.
 * - enableAuditAuth, auditKey, scopes, expiresAt
 * - generateAuditKey, toggleScope
 * - scopesBitmask, expiresAtSeconds (computed for submit)
 */
export function useInvoiceFormAudit() {
  const cryptoService = useMemo(() => new CryptoService(), []);

  const [enableAuditAuth, setEnableAuditAuth] = useState(false);
  const [auditKey, setAuditKey] = useState('');
  const [scopes, setScopes] = useState<string[]>(DEFAULT_SCOPES);
  const [expiresAt, setExpiresAt] = useState(getDefaultAuditExpiresAt);

  const toggleScope = useCallback((key: string) => {
    setScopes((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));
  }, []);

  const generateAuditKey = useCallback(() => {
    const key = cryptoService.generateAuditKey();
    setAuditKey(key);
    return key;
  }, [cryptoService]);

  const scopesBitmask = useMemo(() => {
    return scopes.reduce((mask, key) => {
      const id = FIELD_SCOPE_IDS[key];
      return id ? mask | (1n << BigInt(id - 1)) : mask;
    }, 0n);
  }, [scopes]);

  const expiresAtSeconds = useMemo(() => {
    return Math.floor(new Date(expiresAt).getTime() / 1000);
  }, [expiresAt]);

  const isAuditKeyValid = useCallback(() => {
    return !!auditKey && /^[0-9a-fA-F]{64}$/.test(auditKey.trim().replace(/\s/g, ''));
  }, [auditKey]);

  const normalizedAuditKey = useMemo(() => {
    return auditKey.trim().replace(/\s/g, '');
  }, [auditKey]);

  return {
    enableAuditAuth,
    setEnableAuditAuth,
    auditKey,
    setAuditKey,
    scopes,
    setScopes,
    expiresAt,
    setExpiresAt,
    toggleScope,
    generateAuditKey,
    scopesBitmask,
    expiresAtSeconds,
    isAuditKeyValid,
    normalizedAuditKey,
    cryptoService
  };
}
