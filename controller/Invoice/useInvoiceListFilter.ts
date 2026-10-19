import { useMemo, useState } from 'react';
import { InvoiceStatus } from '@/lib/types';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { Invoice } from '@/lib/types';
import { InvoiceListFilter, StatusConfig } from './IInvoices';

type InvoiceWithRole = {
  invoice: Invoice;
  role: 'SELLER' | 'BUYER' | 'BOTH' | 'NONE';
  chainStatus: ChainConfirmationStatus;
  statusConfig: StatusConfig;
};

/**
 * Hook: 列表页过滤和搜索逻辑
 * 
 * 职责：
 * - 管理过滤状态（all/pending/paid/cancelled）
 * - 管理搜索关键词
 * - 提供过滤后的发票列表
 */
export function useInvoiceListFilter(
  invoicesWithRole: InvoiceWithRole[]
) {
  const [filter, setFilter] = useState<InvoiceListFilter>('all');
  const [search, setSearch] = useState('');

  const filteredInvoices = useMemo(() => {
    return invoicesWithRole.filter(({ invoice }) => {
      const matchStatus =
        filter === 'all'
          ? true
          : filter === 'pending'
            ? invoice.status === InvoiceStatus.PENDING
            : filter === 'paid'
              ? invoice.status === InvoiceStatus.PAID
              : filter === 'escrowed'
                ? invoice.status === InvoiceStatus.ESCROWED
                : filter === 'resolved'
                  ? (invoice.status === InvoiceStatus.RESOLVED_CANCELLED || invoice.status === InvoiceStatus.RESOLVED_PAID)
                  : invoice.status === InvoiceStatus.CANCELLED;
      
      // 搜索过滤
      const searchLower = search.trim().toLowerCase();
      const matchSearch =
        searchLower === '' ||
        invoice.id.toLowerCase().includes(searchLower) ||
        invoice.invoiceHash.toLowerCase().includes(searchLower) ||
        invoice.buyer.toLowerCase().includes(searchLower) ||
        invoice.seller.toLowerCase().includes(searchLower);
      
      return matchStatus && matchSearch;
    });
  }, [invoicesWithRole, filter, search]);

  return {
    filteredInvoices,
    filter,
    search,
    setFilter,
    setSearch
  };
}
