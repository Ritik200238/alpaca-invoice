import { useCallback, useRef, useState } from 'react';
import { useUserStore } from '@/stores/User/useUserStore';
import { Invoice, AleoField } from '@/lib/types';
import { PollingService } from '@/services/PollingService/PollingServiceImpl';
import { InvoiceScanResult } from '@/services/PollingService/adapters/InvoiceStatusValidatorAdapter';
import { useInvoicePollingCore } from './useInvoicePollingCore';
import { useReceiptStore } from '@/stores/Receipt/useReceiptStore';
import type { AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';

/**
 * Hook: 列表页批量轮询逻辑（重构版）
 * 
 * 职责：
 * - 批量轮询多个 SENDING 状态的发票
 * - 为每张发票创建独立的 PollingService 实例
 * - 管理轮询状态和生命周期
 * - 轮询完成后通过回调通知调用方
 * 
 * 重构说明：
 * - 使用 useInvoicePollingCore 复用核心轮询逻辑
 * - 只保留批量管理相关的代码
 */
export function useInvoiceListPolling(
  onPollingComplete: (invoiceHash: AleoField, updatedInvoice: Invoice) => void
) {
  const { masterKey, publicKey } = useUserStore();
  const { createPollingService, getLatestInvoice } = useInvoicePollingCore();
  
  // ✅ 为每张发票维护独立的 PollingService 实例
  const pollingServicesRef = useRef<Map<AleoField, PollingService<InvoiceScanResult>>>(new Map());
  const [isPolling, setIsPolling] = useState(false);

  /**
   * 为单张发票启动轮询
   */
  const startPollingForInvoice = useCallback((invoiceHash: AleoField) => {
    // 如果已经在轮询，跳过
    if (pollingServicesRef.current.has(invoiceHash)) {
      console.log(`⏭️ [ListPolling] Already polling: ${invoiceHash}`);
      return;
    }

    // ✅ 从 store 获取最新的 invoice
    const invoice = getLatestInvoice(invoiceHash);
    
    // ✅ 只需要 invoice 和 publicKey；masterKey 是可选的（影响是否能持久化）
    if (!invoice || !publicKey) {
      console.warn(`⚠️ [ListPolling] Missing required data for: ${invoiceHash}`, {
        hasInvoice: !!invoice,
        hasPublicKey: !!publicKey,
        invoiceAction: invoice?.metadata?.action
      });
      return;
    }

    console.log(`🔄 [ListPolling] Starting polling for: ${invoiceHash}`, {
      hasMasterKey: !!masterKey,
      canPersist: !!masterKey
    });

    // ✅ 使用核心逻辑创建 PollingService
    const pollingService = createPollingService(invoiceHash, invoice, {
      onSuccess: async (updatedInvoice, record) => {
        // Wave 3: PaymentRecord 含 settlement_anchor 时回写 ReceiptStore，供审计 Step 2 使用
        if (record && 'payment_id' in record && (record as AleoPaymentRecord).settlement_anchor) {
          const anchor = String((record as AleoPaymentRecord).settlement_anchor).replace(/field\.(private|public)$/i, 'field');
          useReceiptStore.getState().updateReceipt(updatedInvoice.id, { settlementAnchor: anchor as AleoField });
        }
        onPollingComplete(invoiceHash, updatedInvoice);
        pollingServicesRef.current.delete(invoiceHash);
        if (pollingServicesRef.current.size === 0) {
          setIsPolling(false);
        }
      },
      onTimeout: async (rolledBackInvoice) => {
        // 通过回调通知调用方（回退状态）
        onPollingComplete(invoiceHash, rolledBackInvoice);
        
        // 停止并移除轮询服务
        pollingServicesRef.current.delete(invoiceHash);
        if (pollingServicesRef.current.size === 0) {
          setIsPolling(false);
        }
      },
      onError: (error) => {
        console.error(`[ListPolling] Polling error for ${invoiceHash}:`, error);
        // 错误时不停止轮询，继续尝试
      }
    });

    pollingService.start();
    pollingServicesRef.current.set(invoiceHash, pollingService);
    setIsPolling(true);
  }, [masterKey, publicKey, createPollingService, getLatestInvoice, onPollingComplete]);

  /**
   * 开始轮询 SENDING 状态的发票（批量）
   */
  const startPolling = useCallback((sendingHashes: AleoField[]) => {
    sendingHashes.forEach(hash => {
      startPollingForInvoice(hash);
    });
  }, [startPollingForInvoice]);

  /**
   * 停止所有轮询
   */
  const stopPolling = useCallback(() => {
    pollingServicesRef.current.forEach((service, hash) => {
      service.stop();
    });
    pollingServicesRef.current.clear();
    setIsPolling(false);
    console.log('⏹️ [ListPolling] Stopped all polling services');
  }, []);

  /**
   * 停止特定发票的轮询
   */
  const stopPollingForInvoice = useCallback((invoiceHash: AleoField) => {
    const service = pollingServicesRef.current.get(invoiceHash);
    if (service) {
      service.stop();
      pollingServicesRef.current.delete(invoiceHash);
      if (pollingServicesRef.current.size === 0) {
        setIsPolling(false);
      }
      console.log(`⏹️ [ListPolling] Stopped polling for: ${invoiceHash}`);
    }
  }, []);

  return {
    isPolling,
    startPolling,
    stopPolling,
    stopPollingForInvoice
  };
}
