'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import type { AleoAddress, AleoField, Invoice, InvoiceDetails, LineItem, LineItemV3, TaxGroups } from '@/lib/types';
import { CurrencyFlag } from '@/lib/types';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { useUserStore } from '@/stores/User/useUserStore';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { useInvoiceFormAudit } from '@/controller/Invoice/useInvoiceFormAudit';
import type { JctPdfPreviewSummary } from '@/components/jct-pdf-preview';

// ── Types ─────────────────────────────────────────────────────────────

/** JCT tax rate selector per line item */
export type JctTaxRate = '10' | '8' | '0';

/** Raw form row state (strings for controlled inputs; parsed values derived via useMemo) */
export interface LineItemRow {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  jctTaxRate: JctTaxRate;
}

export interface JctPreviewData {
  lineItemsV3: LineItemV3[];
  summary: JctPdfPreviewSummary;
}

// ── Pure helpers (no React) ───────────────────────────────────────────

const ALEO_ADDR_REGEX = /^aleo1[0-9a-z]{58}$/;

function tomorrowDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function buildTaxGroupsFromLineItems(lineItems: LineItem[], jctTaxRates: JctTaxRate[]): TaxGroups {
  let net10 = 0n, tax10 = 0n, net8 = 0n, tax8 = 0n, net0 = 0n;
  lineItems.forEach((item, i) => {
    const r = jctTaxRates[i] ?? '10';
    const net = Math.round(item.amount * 1_000_000);
    const rate = r === '10' ? 0.1 : r === '8' ? 0.08 : 0;
    const tax = Math.round(item.amount * rate * 1_000_000);
    if (r === '10') {
      net10 += BigInt(net);
      tax10 += BigInt(tax);
    } else if (r === '8') {
      net8 += BigInt(net);
      tax8 += BigInt(tax);
    } else {
      net0 += BigInt(net);
    }
  });
  return {
    group_a: { rate_bps: 1000, net_sum: net10, tax_sum: tax10 },
    group_b: net8 > 0n || tax8 > 0n
      ? { rate_bps: 800, net_sum: net8, tax_sum: tax8 }
      : { rate_bps: 0, net_sum: net0, tax_sum: 0n }
  };
}

function buildDetails(opts: {
  invoiceNumber: string;
  lineItems: LineItem[];
  lineItemsJctTax: JctTaxRate[];
  currency: string;
  orderId: string;
  notes: string;
  arbiter?: string;
}): InvoiceDetails {
  const subtotal = opts.lineItems.reduce((s, i) => s + i.amount, 0);
  const taxAmount = opts.lineItems.reduce((sum, item, i) => {
    const r = opts.lineItemsJctTax[i] ?? '10';
    const rate = r === '10' ? 0.1 : r === '8' ? 0.08 : 0;
    return sum + Math.round(item.amount * rate * 100) / 100;
  }, 0);
  return {
    invoiceNumber: opts.invoiceNumber,
    orderId: opts.orderId || undefined,
    lineItems: opts.lineItems.map(({ description, quantity, unitPrice, amount }) => ({
      description: description || 'Item',
      quantity,
      unitPrice,
      amount
    })),
    subtotal,
    taxRate: 0,
    taxAmount,
    total: Math.round((subtotal + taxAmount) * 100) / 100,
    currency: opts.currency || 'CREDITS',
    notes: opts.notes || undefined,
    arbiter: opts.arbiter || undefined
  };
}

// ── Hook ──────────────────────────────────────────────────────────────

export interface UseInvoiceFormReturn {
  // Raw form state
  tNumber: string;
  setTNumber: (v: string) => void;
  ntaCheck: 'idle' | 'checking' | 'ok' | 'unavailable';
  buyer: string;
  setBuyer: (v: string) => void;
  arbiter: string;
  setArbiter: (v: string) => void;
  lineItems: LineItemRow[];
  dueDate: string;
  setDueDate: (v: string) => void;
  currency: string;
  setCurrency: (v: string) => void;
  orderId: string;
  setOrderId: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;

  // Derived display values
  parsedLineItems: LineItem[];
  parsedAmount: number;
  taxAmount: number;
  total: number;
  jctPreviewData: JctPreviewData;

  // Line item handlers
  addLineItem: () => void;
  removeLineItem: (id: string) => void;
  updateLineItem: (id: string, field: keyof LineItemRow, value: string) => void;

  // NTA verification
  verifyTNumberWithNta: () => Promise<void>;

  // Audit sub-controller (delegated)
  audit: ReturnType<typeof useInvoiceFormAudit>;

  // Validation
  errors: Record<string, string>;

  /** True from the moment submit starts until router.push or error */
  isSubmitting: boolean;
  /** True while the wallet / ZK proof is running (from useTransactionStore) */
  isProcessing: boolean;
  currentProgress: number;
  currentLog: string;

  // Submit
  handleSubmit: (e: React.FormEvent) => Promise<void>;

  // Seller identity (read-only, for display)
  publicKey: string | null;
}

export function useInvoiceForm(): UseInvoiceFormReturn {
  const router = useRouter();
  const { executeCreateInvoice, executeSetAuditAuthorization, isProcessing, currentProgress, currentLog } =
    useTransactionController();
  const { publicKey } = useUserStore();
  const { handleError } = useErrorHandler();
  const audit = useInvoiceFormAudit();

  // Pre-warm Aleo SDK (WASM) on mount to reduce latency when user submits
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { new AleoProtocolService(); } catch { /* SDK may not be available yet; will load on demand */ }
  }, []);

  // ── Raw form state ──
  const [tNumber, setTNumberRaw] = useState('');
  const [ntaCheck, setNtaCheck] = useState<'idle' | 'checking' | 'ok' | 'unavailable'>('idle');
  const [buyer, setBuyer] = useState('');
  const [arbiter, setArbiter] = useState('');
  const [lineItems, setLineItems] = useState<LineItemRow[]>(() => [
    { id: crypto.randomUUID(), description: 'Service fee', quantity: '1', unitPrice: '1', jctTaxRate: '10' }
  ]);
  const [dueDate, setDueDate] = useState(tomorrowDateStr);
  const [currency, setCurrency] = useState('CREDITS');
  const [orderId, setOrderId] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setTNumber = useCallback((v: string) => {
    setTNumberRaw(v.replace(/\D/g, '').slice(0, 13));
  }, []);

  // ── Derived line item values ──
  const parsedLineItems = useMemo(
    () =>
      lineItems.map((row) => {
        const qty = parseFloat(row.quantity) || 0;
        const price = parseFloat(row.unitPrice) || 0;
        return {
          description: row.description || 'Item',
          quantity: qty,
          unitPrice: price,
          amount: Math.round(qty * price * 100) / 100
        };
      }),
    [lineItems]
  );

  const parsedAmount = useMemo(
    () => parsedLineItems.reduce((sum, item) => sum + item.amount, 0),
    [parsedLineItems]
  );

  const taxAmount = useMemo(() => {
    return parsedLineItems.reduce((sum, item, i) => {
      const r = lineItems[i]?.jctTaxRate ?? '10';
      const rate = r === '10' ? 0.1 : r === '8' ? 0.08 : 0;
      return sum + Math.round(item.amount * rate * 100) / 100;
    }, 0);
  }, [parsedLineItems, lineItems]);

  const total = Math.round((parsedAmount + taxAmount) * 100) / 100;

  // ── JCT PDF preview data ──
  const jctPreviewData = useMemo<JctPreviewData>(() => {
    const items: LineItemV3[] = [];
    let net10 = 0, tax10 = 0, net8 = 0, tax8 = 0;
    lineItems.forEach((row, i) => {
      const qty = parseFloat(row.quantity) || 0;
      const unitPrice = parseFloat(row.unitPrice) || 0;
      const rate = row.jctTaxRate === '10' ? 10 : row.jctTaxRate === '8' ? 8 : 0;
      const inclTax = qty * unitPrice;
      const net = rate === 0 ? inclTax : Math.round((inclTax / (1 + rate / 100)) * 100) / 100;
      const tax = Math.round(net * (rate / 100) * 100) / 100;
      items.push({
        description: row.description || 'Item',
        quantity: qty,
        unitPrice,
        taxRate: rate as 0 | 8 | 10,
        taxAmount: tax,
        amount: net
      });
      if (rate === 10) { net10 += net; tax10 += tax; }
      else if (rate === 8) { net8 += net; tax8 += tax; }
    });
    return {
      lineItemsV3: items,
      summary: {
        net10,
        tax10,
        net8,
        tax8,
        total: Math.round((net10 + tax10 + net8 + tax8) * 100) / 100
      }
    };
  }, [lineItems]);

  // ── Line item handlers ──
  const addLineItem = useCallback(() => {
    setLineItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: 'Service fee', quantity: '1', unitPrice: '1', jctTaxRate: '10' }
    ]);
  }, []);

  const removeLineItem = useCallback((id: string) => {
    setLineItems((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }, []);

  const updateLineItem = useCallback((id: string, field: keyof LineItemRow, value: string) => {
    setLineItems((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);

  // ── NTA T-number verification ──
  const verifyTNumberWithNta = useCallback(async () => {
    const digits = tNumber.replace(/\D/g, '');
    if (digits.length !== 13) return;
    const apiUrl =
      typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_NTA_TNUMBER_API_URL;
    if (!apiUrl) {
      setNtaCheck('unavailable');
      return;
    }
    setNtaCheck('checking');
    try {
      const res = await fetch(apiUrl.replace(/\{t\}/g, digits));
      setNtaCheck(res.ok ? 'ok' : 'unavailable');
    } catch {
      setNtaCheck('unavailable');
    }
  }, [tNumber]);

  // ── Validation ──
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    const buyerAddr = buyer.trim();

    if (!buyerAddr) {
      errs.buyer = 'Buyer address is required.';
    } else if (!ALEO_ADDR_REGEX.test(buyerAddr)) {
      errs.buyer = 'Invalid Aleo address (must be aleo1… 63 chars).';
    } else if (publicKey && buyerAddr === publicKey) {
      errs.buyer = 'Buyer cannot be the same as seller.';
    }

    const arbiterAddr = arbiter.trim();
    if (arbiterAddr && !ALEO_ADDR_REGEX.test(arbiterAddr)) {
      errs.arbiter = 'Invalid Aleo address (must be aleo1… 63 chars).';
    } else if (arbiterAddr && publicKey && arbiterAddr === publicKey) {
      errs.arbiter = 'Arbiter cannot be the seller.';
    } else if (arbiterAddr && arbiterAddr === buyerAddr) {
      errs.arbiter = 'Arbiter cannot be the buyer.';
    }

    if (parsedAmount <= 0) {
      errs.amount = 'Add at least one line item with a positive amount.';
    }

    if (parsedLineItems.some((item) => !item.description.trim() || item.amount <= 0)) {
      errs.lineItems = 'Each line item needs a description and a positive amount (quantity × unit price).';
    }

    const t = tNumber.replace(/\D/g, '');
    if (t.length !== 13) {
      errs.tNumber = 'T number must be exactly 13 digits.';
    }

    const dueDateSec = Math.floor(new Date(dueDate).getTime() / 1000) + 86399;
    if (dueDateSec < Math.floor(Date.now() / 1000)) {
      errs.dueDate = 'Due date must be today or in the future.';
    }

    if (!currency.trim()) {
      errs.currency = 'Currency is required.';
    }

    if (audit.enableAuditAuth && !audit.isAuditKeyValid()) {
      errs.auditKey = 'Click the icon to generate an audit key before creating.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit ──
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      setIsSubmitting(true);

      const buyerAddress = buyer.trim();
      if (buyerAddress !== buyer) setBuyer(buyerAddress);
      const arbiterAddress = arbiter.trim() || undefined;

      const invoiceNumber = `INV-${Date.now()}`;
      const jctRates = lineItems.map((r) => r.jctTaxRate);
      const details = buildDetails({
        invoiceNumber,
        lineItems: parsedLineItems,
        lineItemsJctTax: jctRates,
        currency: currency.trim(),
        orderId: orderId.trim(),
        notes: notes.trim(),
        arbiter: arbiterAddress
      });
      const taxGroups = buildTaxGroupsFromLineItems(parsedLineItems, jctRates);
      const amountMicro = BigInt(Math.floor(parsedAmount * 1_000_000));
      const dueDateObj = new Date(dueDate);
      dueDateObj.setHours(23, 59, 59, 0);

      const currencyFlagVal: CurrencyFlag =
        currency.trim().toUpperCase() === 'USDCX' ? CurrencyFlag.USDCX : CurrencyFlag.CREDITS;

      const scopesBitmask = audit.enableAuditAuth ? audit.scopesBitmask : undefined;
      const expiresSec =
        audit.enableAuditAuth && audit.auditKey ? audit.expiresAtSeconds : undefined;

      try {
        const { invoiceHash, invoiceId } = await executeCreateInvoice({
          buyer: buyerAddress as AleoAddress,
          amount: amountMicro,
          dueDate: dueDateObj,
          details,
          taxGroups,
          tNumber: tNumber.replace(/\D/g, ''),
          currencyFlag: currencyFlagVal,
          ...(audit.enableAuditAuth &&
            audit.auditKey &&
            scopesBitmask !== undefined &&
            expiresSec !== undefined && {
              audit: {
                auditKey: audit.normalizedAuditKey,
                scopesBitmask,
                expiresAt: expiresSec
              }
            })
        });

        if (
          audit.enableAuditAuth &&
          audit.auditKey &&
          scopesBitmask !== undefined &&
          expiresSec !== undefined
        ) {
          try {
            const auditKeyHash = await audit.cryptoService.hashObjectToField(audit.normalizedAuditKey);
            const invoiceForAuth: Invoice = {
              id: invoiceId as AleoField,
              invoiceHash: invoiceHash as AleoField,
              seller: publicKey as AleoAddress,
              buyer: buyerAddress as AleoAddress,
              amount: amountMicro,
              dueDate: dueDateObj,
              createdAt: new Date(),
              status: 0,
              metadata: {
                confirmationStatus: 'SENDING',
                lastUpdated: new Date(),
                dataSource: 'local',
                action: 'create'
              }
            };
            await executeSetAuditAuthorization(invoiceForAuth, auditKeyHash, scopesBitmask, expiresSec);
          } catch (authErr: unknown) {
            const msg = authErr instanceof Error ? authErr.message : String(authErr);
            console.warn('Audit authorization not set:', msg);
          }
        }

        // Invoice details (including arbiter) are saved to the online store only after chain confirmation (see InvoiceAutoPoller §3.9).

        console.log('[DEBUG useInvoiceForm] Redirecting to detail page', {
          invoiceHash,
          invoiceHashLength: invoiceHash?.length
        });
        // Keep isSubmitting = true so the loading indicator stays visible until navigation
        router.push(`/invoices/${invoiceHash}`);
      } catch (err) {
        setIsSubmitting(false);
        handleError(err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      buyer, arbiter, lineItems, parsedLineItems, parsedAmount, dueDate, currency,
      orderId, notes, tNumber, audit, publicKey,
      executeCreateInvoice, executeSetAuditAuthorization, handleError, router
    ]
  );

  return {
    publicKey: publicKey ?? null,
    tNumber,
    setTNumber,
    ntaCheck,
    buyer,
    setBuyer,
    arbiter,
    setArbiter,
    lineItems,
    dueDate,
    setDueDate,
    currency,
    setCurrency,
    orderId,
    setOrderId,
    notes,
    setNotes,
    parsedLineItems,
    parsedAmount,
    taxAmount,
    total,
    jctPreviewData,
    addLineItem,
    removeLineItem,
    updateLineItem,
    verifyTNumberWithNta,
    audit,
    errors,
    isSubmitting,
    isProcessing: isProcessing || isSubmitting,
    currentProgress,
    currentLog,
    handleSubmit
  };
}
