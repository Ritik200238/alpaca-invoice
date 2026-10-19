import { useMemo } from 'react';
import { useUserStore } from '@/stores/User/useUserStore';
import { Invoice } from '@/lib/types';
import { UserRole } from './IInvoiceDetail';
import { determineInvoiceRole } from '@/lib/invoice';

/**
 * Hook: 判断当前用户在发票中的角色
 * 
 * 职责：
 * - 比较当前用户的 publicKey 与发票的 seller/buyer
 * - 返回用户角色：'seller' | 'buyer' | 'unknown'
 */
export function useInvoiceRole(invoice: Invoice | null): UserRole {
  const { publicKey } = useUserStore();
  
  return useMemo(() => {
    if (!publicKey || !invoice) return 'unknown';
    
    const role = determineInvoiceRole(publicKey, invoice);
    // 详情页不支持 'both'，转换为 'unknown'
    return role === 'both' ? 'unknown' : role;
  }, [publicKey, invoice]);
}

