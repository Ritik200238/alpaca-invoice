import { useCallback, useState } from 'react';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useInvoiceChainScan } from './useInvoiceChainScan';
import { cleanAleoField } from '@/lib/invoice';
import { fetchAndMergeKvDetails } from './useInvoiceKvSync';
import { toast } from 'sonner';

/**
 * Hook: 列表页初始化逻辑
 * 
 * 职责：
 * - 处理两种情况的初始化
 *   1. IndexedDB 为空 → 从链上扫描并存入
 *   2. IndexedDB 有数据 → 加载到内存
 * - ✅ 不再需要轮询回调：store 的 sendingInvoiceHashes + AutoPoller 自动处理
 */
export function useInvoiceListInitialize() {
  const { publicKey, masterKey } = useUserStore();
  const {
    getAllInvoices,
    setInvoices,
    updateInvoice,
    rebuildSendingIndex
  } = useInvoiceStore();
  const { scanAndBuildInvoices } = useInvoiceChainScan();
  
  const [isLoading, setIsLoading] = useState(false);

  /**
   * 情况1：从链上同步所有发票并存入 IndexedDB
   * ✅ 优化：使用 scanAndBuildInvoices 统一构建 Invoice 对象
   */
  const syncFromChain = useCallback(async () => {
    if (!masterKey || !publicKey) return;
    
    setIsLoading(true);
    try {
      console.log('📋 [syncFromChain] Case 1: IndexedDB is empty, syncing from chain...');
      
      // ✅ 直接调用 scanAndBuildInvoices 获取构建好的 Invoice 对象
      const invoices = await scanAndBuildInvoices();

      if (invoices.length === 0) {
        console.log('📋 [syncFromChain] No records found on chain');
        return;
      }

      // Chain data has no nonce/auditKey/details; only fill from local when we have an existing copy (e.g. same device had created this invoice before).
      // Merge nonce/auditKey/details from existing in-memory invoices (local-only fields not on chain).
      // Read directly from store to avoid stale closure / dependency loop
      const currentInvoices = useInvoiceStore.getState().invoices;
      for (const inv of invoices) {
        const existing = currentInvoices.find(
          (e) => cleanAleoField(e.id) === cleanAleoField(inv.id) || e.invoiceHash === inv.invoiceHash
        );
        if (existing) {
          if (!inv.nonce && existing.nonce) inv.nonce = existing.nonce;
          if (!inv.auditKey && existing.auditKey) inv.auditKey = existing.auditKey;
          if (!inv.details && existing.details) inv.details = existing.details;
        }
      }

      // ✅ 批量存入 IndexedDB（metadata 设置为 CONFIRMED）
      await setInvoices(invoices, { 
        masterKey, 
        persistFull: true,
        metadata: {
          confirmationStatus: 'CONFIRMED',
          lastUpdated: new Date(),
          dataSource: 'chain'
        }
      });
      
      // §3.9: fetch encrypted details from KV for invoices missing details (buyer side)
      await fetchAndMergeKvDetails(invoices, updateInvoice, masterKey);
      
      // ✅ 重建 sending 索引（setInvoices 已经自动处理了，这里只是确保）
      rebuildSendingIndex();
      console.log(`✅ [syncFromChain] Synced ${invoices.length} invoices from chain with CONFIRMED status`);
    } catch (error) {
      console.error('Failed to sync from chain:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [masterKey, publicKey, scanAndBuildInvoices, setInvoices, updateInvoice, rebuildSendingIndex]);

  /**
   * 初始化流程：处理两种情况
   * - 情况1：IndexedDB 为空 → 从链上同步（需要 masterKey）
   * - 情况2：IndexedDB 有数据 → 加载到内存
   * 
   * ✅ masterKey 不是必需的：
   * - 有 masterKey：可以解密 details，可以同步数据到 IndexedDB
   * - 无 masterKey：只能读取基本信息，不解密 details，不能同步到 IndexedDB
   * 
   * ✅ 不再需要检测 SENDING：store 自动维护 sending 索引，AutoPoller 自动轮询
   */
  const initialize = useCallback(async () => {
    // ✅ 只需要 publicKey，不强制要求 masterKey
    if (!publicKey) {
      console.log('⚠️ [initialize] No publicKey, skipping initialization');
      return;
    }
    
    setIsLoading(true);
    try {
      console.log('📋 [initialize] Starting initialization with masterKey:', !!masterKey);
      
      // 1. 从 IndexedDB 加载所有发票（会自动重建 sending 索引）
      const dbInvoices = await getAllInvoices({ 
        masterKey: masterKey || undefined, 
        refreshMemory: true 
      });
      
      // 2. 判断情况
      if (dbInvoices.length === 0) {
        // 情况1：IndexedDB 为空 → 从链上同步
        // ✅ 只有在有 masterKey 时才同步（因为需要加密存储到 IndexedDB）
        if (masterKey) {
          console.log('📋 [initialize] Case 1: IndexedDB is empty, syncing from chain...');
          await syncFromChain();
        } else {
          console.log('📋 [initialize] Case 1: IndexedDB is empty, but no masterKey for sync');
          console.log('💡 Tip: Unlock to sync invoices from chain');
        }
      } else {
        // 情况2：IndexedDB 有数据 → 已加载到内存
        console.log(`📋 [initialize] Case 2: Loaded ${dbInvoices.length} invoices from IndexedDB`);
        for (const inv of dbInvoices) {
          console.log('🔍 [DEBUG-ARBITER] IndexedDB invoice loaded:', {
            id: inv.id?.slice(0, 30),
            hash: inv.invoiceHash?.slice(0, 30),
            hasDetails: !!inv.details,
            arbiter: (inv.details as any)?.arbiter ?? 'NO DETAILS',
            confirmationStatus: inv.metadata?.confirmationStatus,
          });
        }
        // ✅ 确保 sending 索引已重建（getAllInvoices 应该已经处理了）
        rebuildSendingIndex();
      }
    } catch (error) {
      console.error('Failed to initialize:', error);
      toast.error('Failed to load invoices', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsLoading(false);
    }
  }, [masterKey, publicKey, getAllInvoices, syncFromChain, rebuildSendingIndex]);

  return {
    isLoading,
    initialize
  };
}
