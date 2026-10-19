import { useMemo } from 'react';
import { useUserStore } from '@/stores/User/useUserStore';
import { Invoice, AleoField } from '@/lib/types';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { getStatusConfig, determineInvoiceRole } from '@/lib/invoice';

/**
 * Hook: 发票角色判断逻辑（可复用）
 * 
 * 职责：
 * - 根据用户地址判断发票角色（SELLER/BUYER/BOTH）
 * - 计算链上确认状态（从 sendingInvoiceHashes 和 metadata）
 * - 添加状态配置
 * - 可被详情页和列表页复用
 */
export function useInvoiceListRole(
  invoices: Invoice[],
  sendingInvoiceHashes: Record<AleoField, true>
) {
  const { publicKey } = useUserStore();

  /**
   * 根据当前用户地址判断发票角色（SELLER/BUYER/BOTH）
   * ✅ 直接计算链上确认状态（Single Source of Truth）
   */
  const invoicesWithRole = useMemo(() => {
    if (!publicKey) return [];
    
    return invoices.map((invoice) => {
      // ✅ 使用公共函数判断角色
      const role = determineInvoiceRole(publicKey, invoice);
      
      // 转换为列表页格式
      const listRole: 'SELLER' | 'BUYER' | 'BOTH' | 'NONE' =
        role === 'both' ? 'BOTH' :
        role === 'seller' ? 'SELLER' :
        role === 'buyer' ? 'BUYER' : 'NONE';
      
      // ✅ 直接计算 chainStatus（Single Source of Truth）
      const isInSendingIndex = sendingInvoiceHashes[invoice.invoiceHash] === true;
      const hasConfirmedMetadata = invoice.metadata?.confirmationStatus === 'CONFIRMED';
      const chainStatus: ChainConfirmationStatus = 
        hasConfirmedMetadata ? 'CONFIRMED' : 
        isInSendingIndex ? 'SENDING' : 
        'SENDING'; // 默认 SENDING（等待首次确认）
      
      return { 
        invoice, 
        role: listRole,
        chainStatus,
        statusConfig: getStatusConfig(invoice.status)
      };
    });
  }, [invoices, publicKey, sendingInvoiceHashes]);

  return {
    invoicesWithRole
  };
}

