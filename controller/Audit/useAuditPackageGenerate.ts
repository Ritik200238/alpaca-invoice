import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import type { AleoAddress, AleoField, Invoice } from '@/lib/types';
import type { AuditPackageEnvelope, AuditPackageEnvelopeV3 } from '@/types/audit-package';
import type { GenerateAuditPackageResultV3 } from '@/services/AuditService/IAuditService';
import { AuditService } from '@/services/AuditService/AuditServiceImpl';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { createWalletAdapter } from '@/services/WalletService/createWalletAdapter';
import { DEFAULT_FIELDS, AUDIT_FIELDS_LIST, getDefaultAuditExpiresAt } from './auditConstants';
import { fieldsToPermissions, buildScopesBitmask } from './auditHelpers';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { useInvoiceChainScan } from '@/controller/Invoice/useInvoiceChainScan';
import { InvoiceStatus } from '@/lib/types';

/**
 * Audit Package Generate Controller
 *
 * Single responsibility: generate audit package (envelope + auditKey encrypted with user's audit key).
 * Used by Audit Center (/audit) and invoice detail page for "Download audit package".
 */
export function useAuditPackageGenerate() {
  const wallet = useWallet();
  const { publicKey, masterKey } = useUserStore();
  const { getAllInvoices } = useInvoiceStore.getState();
  const { handleError } = useErrorHandler();
  const [loading, setLoading] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const [invoices, setInvoices] = useState<{ id: AleoField; invoiceHash: AleoField }[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [expiresAt, setExpiresAt] = useState(() => getDefaultAuditExpiresAt());
  const [fields, setFields] = useState<string[]>(() => [...DEFAULT_FIELDS]);
  const [result, setResult] = useState<{ envelope: AuditPackageEnvelope; auditKey: string } | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  // Snapshot of the invoice and fields used for the last successful generation.
  // Needed so submitAuthorization can use the exact same data even if the user edits the form afterward.
  const [generatedInvoice, setGeneratedInvoice] = useState<Invoice | null>(null);
  const [generatedFields, setGeneratedFields] = useState<string[]>([]);
  const [submittingAuth, setSubmittingAuth] = useState(false);

  // Wave 3: role-based multi-record
  const [role, setRoleState] = useState<'buyer' | 'seller' | null>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [v3Result, setV3Result] = useState<GenerateAuditPackageResultV3 | null>(null);
  const [tNumberHint, setTNumberHint] = useState('');
  const { executeSetAuditAuthorization } = useTransactionController();
  const { scanAllPaymentRecords, scanAllInvoiceRecords } = useInvoiceChainScan();

  const walletService = useMemo(
    () => (wallet ? new WalletService(createWalletAdapter(wallet)) : null),
    [wallet]
  );

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!walletService || !publicKey) {
        throw new Error('Wallet not connected. Please connect first.');
      }
      return walletService.signMessage(message, String(publicKey));
    },
    [walletService, publicKey]
  );

  const auditService = useMemo(
    () =>
      new AuditService({
        signerAddress: (publicKey ? String(publicKey) : null) as AleoAddress | null,
        signMessage
      }),
    [publicKey, signMessage]
  );

  const copyAuditKey = useCallback(() => {
    const key = v3Result?.auditKey ?? result?.auditKey;
    if (!key) return;
    navigator.clipboard.writeText(key);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  }, [result?.auditKey, v3Result?.auditKey]);

  const downloadPackage = useCallback(
    (envelope: AuditPackageEnvelope, id: string) => {
      try {
        const blob = new Blob([JSON.stringify(envelope, null, 2)], {
          type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-package-${id}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err: any) {
        handleError(err);
      }
    },
    [handleError]
  );

  const loadInvoiceOptions = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const list = await getAllInvoices({ refreshMemory: true });
      setInvoices(list.map((inv) => ({ id: inv.id, invoiceHash: inv.invoiceHash })));
    } finally {
      setLoadingInvoices(false);
    }
  }, [getAllInvoices]);

  // Auto-load invoice list from IndexedDB when the audit page mounts.
  useEffect(() => {
    loadInvoiceOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleField = useCallback((key: string) => {
    setFields((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }, []);

  const downloadResult = useCallback(() => {
    if (v3Result) {
      const blob = new Blob([JSON.stringify(v3Result.envelope, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-package-v3-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (!result) return;
    downloadPackage(result.envelope, result.envelope.context.invoice_id);
  }, [result, v3Result, downloadPackage]);

  const setRole = useCallback((r: 'buyer' | 'seller') => {
    setRoleState(r);
    setSelectedRecordIds(new Set());
    setV3Result(null);
  }, []);

  const loadAvailableRecords = useCallback(async (r: 'buyer' | 'seller') => {
    const list = await getAllInvoices({ refreshMemory: true });
    if (r === 'buyer') {
      const paymentMap = await scanAllPaymentRecords();
      return list
        .filter((inv) => paymentMap.has(inv.id))
        .map((inv) => {
          const rec = paymentMap.get(inv.id)!;
          const amt = String(rec.amount).replace(/u64$/i, '');
          return {
            id: inv.id,
            amount: BigInt(amt || 0),
            paidAt: new Date(typeof rec.paid_at === 'number' ? rec.paid_at * 1000 : Number(rec.paid_at) * 1000),
            status: undefined as InvoiceStatus | undefined
          };
        });
    }
    return list
      .filter((inv) => inv.status === InvoiceStatus.PAID)
      .map((inv) => ({
        id: inv.id,
        amount: inv.totalAmount ?? inv.amount,
        paidAt: undefined as Date | undefined,
        status: inv.status
      }));
  }, [getAllInvoices, scanAllPaymentRecords]);

  const [availableRecordsList, setAvailableRecordsList] = useState<Array<{ id: AleoField; amount: bigint; paidAt?: Date; status?: InvoiceStatus }>>([]);
  useEffect(() => {
    if (!role) {
      setAvailableRecordsList([]);
      return;
    }
    loadAvailableRecords(role).then(setAvailableRecordsList);
  }, [role, loadAvailableRecords]);

  const availableRecords = useMemo(
    () =>
      availableRecordsList.map((r) => ({
        ...r,
        selected: selectedRecordIds.has(r.id)
      })),
    [availableRecordsList, selectedRecordIds]
  );

  const toggleRecord = useCallback((id: AleoField) => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      const k = String(id);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedRecordIds(new Set(availableRecordsList.map((r) => r.id as string)));
  }, [availableRecordsList]);

  const deselectAll = useCallback(() => setSelectedRecordIds(new Set()), []);

  const selectionSummary = useMemo(() => {
    let totalAmount = 0n;
    let totalTax = 0n;
    const selected = availableRecordsList.filter((r) => selectedRecordIds.has(r.id));
    for (const r of selected) {
      totalAmount += r.amount;
      if (role === 'seller') {
        const list = useInvoiceStore.getState().invoices;
        const full = list.find((i: Invoice) => i.id === r.id);
        if (full?.taxGroups) {
          totalTax += full.taxGroups.group_a.tax_sum + full.taxGroups.group_b.tax_sum;
        }
      }
    }
    return { count: selected.length, totalAmount, totalTax };
  }, [availableRecordsList, selectedRecordIds, role]);

  const expiresAtUnix = useMemo(
    () => (typeof expiresAt === 'string' ? new Date(expiresAt).getTime() / 1000 : Math.floor(Number(expiresAt) / 1000)),
    [expiresAt]
  );

  const setExpiresAtUnix = useCallback((ts: number) => {
    setExpiresAt(new Date(ts * 1000).toISOString().split('T')[0]);
  }, []);

  const generateV3FromSelection = useCallback(async () => {
    if (!role || selectedRecordIds.size === 0 || !auditService) return;
    setLoading(true);
    setV3Result(null);
    try {
      const list = await getAllInvoices({ masterKey: masterKey ?? undefined, refreshMemory: false });
      const receipts = role === 'buyer' ? await scanAllPaymentRecords() : new Map<string, any>();
      const records = Array.from(selectedRecordIds).map((invoiceIdStr) => {
        const invoiceId = invoiceIdStr as AleoField;
        const invoice = list.find((i) => i.id === invoiceId || i.invoiceHash === invoiceId);
        const receipt = receipts.get(invoiceIdStr);
        return {
          invoiceId,
          invoice: role === 'seller' ? invoice : undefined,
          receipt: role === 'buyer' && receipt ? {
            paymentId: (String(receipt.payment_id || '').replace(/field\.(private|public)$/i, 'field') || '0field') as AleoField,
            invoiceId,
            payer: receipt.payer as AleoAddress,
            payee: receipt.payee as AleoAddress,
            amount: BigInt(String(receipt.amount).replace(/u64$/i, '')),
            paidAt: new Date(typeof receipt.paid_at === 'number' ? receipt.paid_at * 1000 : Number(receipt.paid_at) * 1000),
            settlementAnchor: receipt.settlement_anchor
              ? (String(receipt.settlement_anchor).replace(/field\.(private|public)$/i, 'field') as AleoField)
              : undefined
          } : undefined
        };
      });
      const res = await auditService.generateV3({
        role,
        records,
        expiresAt: expiresAtUnix,
        permissions: fieldsToPermissions(fields),
        tNumber: role === 'seller' && tNumberHint ? tNumberHint : undefined
      });
      setV3Result(res);
    } catch (err: any) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }, [role, selectedRecordIds, auditService, getAllInvoices, masterKey, scanAllPaymentRecords, expiresAtUnix, fields, tNumberHint, handleError]);

  const submitOnChainAuthorization = useCallback(async () => {
    if (!v3Result) return;
    setSubmittingAuth(true);
    try {
      const firstInvoice = useInvoiceStore.getState().invoices.find((i: Invoice) =>
        v3Result.envelope.context.invoice_ids.includes(i.id)
      );
      if (firstInvoice) {
        await executeSetAuditAuthorization(
          firstInvoice,
          v3Result.envelope.context.audit_key_hash,
          buildScopesBitmask(generatedFields.length ? generatedFields : DEFAULT_FIELDS),
          v3Result.envelope.context.expires_at
        );
      }
    } catch (err: any) {
      handleError(err);
    } finally {
      setSubmittingAuth(false);
    }
  }, [v3Result, executeSetAuditAuthorization, generatedFields, handleError]);

  const generate = useCallback(
    async (opts: {
      invoiceId: AleoField;
      selectedFields?: string[];
      expiresAt: number;
    }): Promise<{ envelope: AuditPackageEnvelope; auditKey: string }> => {
      setLoading(true);
      try {
        // masterKey optional: chain-synced invoices (no details) can generate chain-anchored package without decryption
        const list = await getAllInvoices({ masterKey: masterKey ?? undefined, refreshMemory: false });
        const invoice =
          list.find((i) => i.id === opts.invoiceId) ||
          list.find((i) => i.invoiceHash === opts.invoiceId);

        if (!invoice) {
          throw new Error('Invoice not found locally. Please sync invoices first.');
        }

        // Allow chain-synced invoices (no nonce/auditKey/details): AuditService.generate will use chain-anchored path when commitment_root is on chain.
        const invoiceWithAuditKey = invoice as Invoice & { auditKey?: string };
        const hasAuditKey = invoiceWithAuditKey.auditKey && /^[0-9a-fA-F]{64}$/.test(invoiceWithAuditKey.auditKey);

        const selectedFields =
          opts.selectedFields && opts.selectedFields.length > 0 ? opts.selectedFields : DEFAULT_FIELDS;
        const permissions = fieldsToPermissions(selectedFields);

        // Snapshot invoice + fields so submitAuthorization can use them even if form changes afterward.
        setGeneratedInvoice(invoice);
        setGeneratedFields(selectedFields);

        const genResult = await auditService.generate({
          invoice,
          expiresAt: opts.expiresAt,
          permissions,
          auditKey: hasAuditKey ? invoiceWithAuditKey.auditKey : undefined
        });

        console.log('[Audit] generate() success, setting result', {
          hasEnvelope: !!genResult?.envelope,
          hasAuditKey: !!genResult?.auditKey
        });
        setResult({ envelope: genResult.envelope, auditKey: genResult.auditKey });
        return { envelope: genResult.envelope, auditKey: genResult.auditKey };
      } catch (err: any) {
        console.log('[Audit] generate() caught error', err?.message ?? err);
        handleError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [auditService, getAllInvoices, handleError, masterKey]
  );

  const submitAuthorization = useCallback(async () => {
    if (!result || !generatedInvoice) return;
    setSubmittingAuth(true);
    try {
      const auditKeyHash = result.envelope.context.audit_key_hash;
      const expiresAt = result.envelope.context.expires_at; // Unix seconds
      const scopesBitmask = buildScopesBitmask(generatedFields);
      await executeSetAuditAuthorization(generatedInvoice, auditKeyHash, scopesBitmask, expiresAt);
    } catch (err: any) {
      handleError(err);
    } finally {
      setSubmittingAuth(false);
    }
  }, [result, generatedInvoice, generatedFields, executeSetAuditAuthorization, handleError]);

  const generateFromForm = useCallback(async () => {
    setResult(null);
    setGeneratedInvoice(null);
    setGeneratedFields([]);
    try {
      const pkg = await generate({
        invoiceId: invoiceId.trim() as AleoField,
        expiresAt: new Date(expiresAt).getTime(),
        selectedFields: fields
      });
      console.log('[Audit] generateFromForm received pkg', !!pkg?.envelope, !!pkg?.auditKey);
      setResult(pkg);
    } catch {
      // Error is already handled by unified error handler
    }
  }, [generate, invoiceId, expiresAt, fields]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      generateFromForm();
    },
    [generateFromForm]
  );

  return {
    generate,
    downloadPackage,
    loadInvoiceOptions,
    loading,
    loadingInvoices,
    publicKey,
    fieldsList: AUDIT_FIELDS_LIST,
    invoices,
    invoiceId,
    expiresAt,
    fields,
    result,
    keyCopied,
    setInvoiceId,
    setExpiresAt,
    toggleField,
    downloadResult,
    copyAuditKey,
    handleSubmit,
    submitAuthorization,
    submittingAuth,
    role,
    setRole,
    availableRecords,
    loadAvailableRecords,
    toggleRecord,
    selectAll,
    deselectAll,
    selectionSummary,
    expiresAtUnix,
    setExpiresAtUnix,
    generateV3FromSelection,
    resultV3: v3Result,
    submitOnChainAuthorization,
    setTNumberHint
  };
}
