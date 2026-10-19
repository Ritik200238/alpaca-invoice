import { create } from 'zustand';
import type { AleoAddress, AleoField, AleoTransactionId, Microcredits, EncryptedPayload } from '@/lib/types';
import { StorageService } from '@/services/StorageService/StorageServiceImpl';

/**
 * Receipt item aligned with PaymentReceipt (SPEC 1.5).
 * 存储 PaymentRecord 时需同时包含 payment_id 和 settlement_anchor，供审计员 Step 2 从本地收据读取锚点。
 * Wave 3 §5.5.1: encryptedDetails 持久化到 IndexedDB，仅存密文不存明文 details。
 */
export type ReceiptItem = {
  /** Chain PaymentRecord.payment_id — 供审计包 buyer 路径使用 */
  paymentId: AleoField;
  /** Chain PaymentRecord.settlement_anchor — used by auditor Step 2 */
  settlementAnchor?: AleoField;
  invoiceId: AleoField;
  /** 加密的发票详情，持久化到 IndexedDB；解密后填入 details */
  encryptedDetails?: EncryptedPayload | null;
  payer: AleoAddress;
  payee: AleoAddress;
  amount: Microcredits;
  paidAt: Date;
  /** 链上 tx_id（Money Flow 审计） */
  txId?: AleoTransactionId;
  /** 链上区块高度（用于审计与追踪） */
  blockHeight?: number;
};

function reviveReceipts(list: any[]): ReceiptItem[] {
  return list
    .map((r) => ({
      ...r,
      paidAt: r?.paidAt instanceof Date ? r.paidAt : new Date(r?.paidAt),
      amount: typeof r?.amount === 'bigint' ? r.amount : BigInt(r?.amount ?? 0),
      blockHeight: Number.isFinite(Number(r?.blockHeight)) ? Number(r.blockHeight) : undefined
    }))
    .filter((r) => r.paymentId && r.invoiceId);
}

/** 持久化时只存密文 */
function toStoredReceipt(r: ReceiptItem): ReceiptItem {
  return {
    ...r,
    encryptedDetails: r.encryptedDetails ?? null
  };
}

type ReceiptState = {
  receipts: ReceiptItem[];
  addReceipt: (r: ReceiptItem) => Promise<void>;
  /** Wave 3: 按 invoiceId 更新 receipt 字段（如 settlementAnchor、encryptedDetails） */
  updateReceipt: (
    invoiceId: AleoField,
    patch: Partial<Pick<ReceiptItem, 'settlementAnchor' | 'txId' | 'blockHeight' | 'encryptedDetails'>>
  ) => Promise<void>;
  /** 按 paymentId 精确更新，避免 invoiceId 命中不稳定 */
  updateReceiptByPaymentId: (
    paymentId: AleoField,
    patch: Partial<Pick<ReceiptItem, 'settlementAnchor' | 'txId' | 'blockHeight' | 'encryptedDetails'>>
  ) => Promise<void>;
  setReceipts: (items: ReceiptItem[]) => Promise<void>;
  getAllReceipts: () => Promise<ReceiptItem[]>;
  clear: () => Promise<void>;
  exportCsv: () => string;
};

function normalizeField(f: string): string {
  return String(f).replace(/field\.(private|public)$/i, 'field').trim();
}

const RECEIPT_TABLE = 'receipts';
const storageService = new StorageService();

export const useReceiptStore = create<ReceiptState>()(
  (set, get) => ({
    receipts: [],
    addReceipt: async (r) => {
      const key = normalizeField(r.paymentId);
      const next = [r, ...get().receipts.filter((it) => normalizeField(it.paymentId) !== key)].slice(0, 500);
      set({ receipts: next });
      try {
        await storageService.addData(RECEIPT_TABLE, key, toStoredReceipt(r));
      } catch (error) {
        console.error('❌ [ReceiptStore.addReceipt] Failed to persist receipt:', error);
      }
    },
    updateReceipt: async (invoiceId, patch) => {
      const normalizedInvoiceId = normalizeField(invoiceId);
      const updated = get().receipts.map((r) =>
        normalizeField(r.invoiceId) === normalizedInvoiceId ? { ...r, ...patch } : r
      );
      set({ receipts: updated });
      try {
        const targets = updated.filter((r) => normalizeField(r.invoiceId) === normalizedInvoiceId);
        await Promise.all(
          targets.map((r) => storageService.addData(RECEIPT_TABLE, normalizeField(r.paymentId), toStoredReceipt(r)))
        );
      } catch (error) {
        console.error('❌ [ReceiptStore.updateReceipt] Failed to persist receipt patch:', error);
      }
    },
    updateReceiptByPaymentId: async (paymentId, patch) => {
      const normalizedPaymentId = normalizeField(paymentId);
      const updated = get().receipts.map((r) =>
        normalizeField(r.paymentId) === normalizedPaymentId ? { ...r, ...patch } : r
      );
      set({ receipts: updated });
      try {
        const target = updated.find((r) => normalizeField(r.paymentId) === normalizedPaymentId);
        if (target) {
          await storageService.addData(
            RECEIPT_TABLE,
            normalizeField(target.paymentId),
            toStoredReceipt(target)
          );
        }
      } catch (error) {
        console.error('❌ [ReceiptStore.updateReceiptByPaymentId] Failed to persist receipt patch:', error);
      }
    },
    setReceipts: async (items) => {
      const existingMap = new Map(
        get().receipts.map((r) => [normalizeField(r.paymentId), r.encryptedDetails ?? null] as const)
      );
      const revived = reviveReceipts(items).map((r) => ({
        ...r,
        encryptedDetails: r.encryptedDetails ?? existingMap.get(normalizeField(r.paymentId)) ?? null
      }));
      set({ receipts: revived });
      try {
        await storageService.resetAllData(RECEIPT_TABLE, revived.map((r) => ({
          ...toStoredReceipt(r),
          key: normalizeField(r.paymentId)
        })));
      } catch (error) {
        console.error('❌ [ReceiptStore.setReceipts] Failed to reset receipts in DB:', error);
      }
    },
    getAllReceipts: async () => {
      try {
        const data = await storageService.getAllData<ReceiptItem>(RECEIPT_TABLE);
        const revived = reviveReceipts(data);
        set({ receipts: revived });
        return revived;
      } catch (error) {
        console.error('❌ [ReceiptStore.getAllReceipts] Failed to load receipts from DB:', error);
        return [];
      }
    },
    clear: async () => {
      set({ receipts: [] });
      try {
        const all = await storageService.getAllData<ReceiptItem>(RECEIPT_TABLE);
        const keys = all.map((r) => normalizeField(r.paymentId));
        if (keys.length > 0) {
          await storageService.deleteData(RECEIPT_TABLE, keys);
        }
      } catch (error) {
        console.error('❌ [ReceiptStore.clear] Failed to clear receipts DB:', error);
      }
    },
    exportCsv: () => {
      const rows = [
        ['paymentId', 'settlementAnchor', 'invoiceId', 'payer', 'payee', 'amount_microcredits', 'paidAt', 'txId', 'blockHeight'].join(',')
      ];
      for (const r of get().receipts) {
        rows.push(
          [
            r.paymentId,
            r.settlementAnchor ?? '',
            r.invoiceId,
            r.payer,
            r.payee,
            r.amount.toString(),
            r.paidAt.toISOString(),
            r.txId ?? '',
            r.blockHeight ?? ''
          ].join(',')
        );
      }
      return rows.join('\n');
    }
  })
);
