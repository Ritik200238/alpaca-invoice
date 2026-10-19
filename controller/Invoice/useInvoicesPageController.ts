import { useMemo, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { InvoiceStatus } from '@/lib/types';
import { useInvoices } from './useInvoices';
import type { Invoice, AleoTransactionId } from '@/lib/types';
import type { InvoiceWithRole } from './IInvoices';
import type { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';

export type InvoiceListRoleFilter = 'all' | 'sent' | 'received';

function buildExplorerTxUrl(transactionId?: AleoTransactionId): string | null {
  if (!transactionId) return null;
  const cleanTx = transactionId.trim();
  if (!cleanTx) return null;
  return `https://testnet.explorer.provable.com/transaction/${encodeURIComponent(cleanTx)}`;
}

export function useInvoicesPageController() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const invoicesController = useInvoices();

  const [roleFilter, setRoleFilter] = useState<InvoiceListRoleFilter>('all');

  useEffect(() => {
    const q = searchParams?.get('filter');
    if (q === 'sent' || q === 'received') {
      setRoleFilter(q);
      return;
    }
    setRoleFilter('all');
  }, [searchParams]);

  const handleRoleChange = useCallback((role: InvoiceListRoleFilter) => {
    setRoleFilter(role);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (role === 'all') params.delete('filter');
    else params.set('filter', role);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [searchParams, router, pathname]);

  const displayInvoices = useMemo<InvoiceWithRole[]>(() => {
    if (roleFilter === 'sent') return invoicesController.sentInvoices;
    if (roleFilter === 'received') return invoicesController.receivedInvoices;
    return invoicesController.filteredInvoices;
  }, [
    roleFilter,
    invoicesController.sentInvoices,
    invoicesController.receivedInvoices,
    invoicesController.filteredInvoices
  ]);

  const exportCsv = useCallback(() => {
    if (!displayInvoices.length) return;
    const rows = [
      ['invoiceId', 'role', 'status', 'buyer', 'seller', 'amount_microcredits', 'dueDate', 'createdAt', 'transactionId', 'blockHeight'].join(',')
    ];
    for (const item of displayInvoices) {
      const inv = item.invoice;
      rows.push(
        [
          inv.id,
          item.role,
          InvoiceStatus[inv.status] ?? inv.status,
          inv.buyer,
          inv.seller,
          inv.amount.toString(),
          inv.dueDate?.toISOString?.() ?? '',
          inv.createdAt?.toISOString?.() ?? '',
          inv.transactionId ?? '',
          inv.blockHeight ?? ''
        ].join(',')
      );
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'invoices.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [displayInvoices]);

  const guardActionByChainStatus = useCallback((
    chainStatus: ChainConfirmationStatus | null | undefined,
    actionName: 'pay' | 'cancel'
  ) => {
    if (chainStatus !== 'CONFIRMED') {
      toast.warning('Not ready yet', {
        description:
          actionName === 'pay'
            ? 'This invoice is still sending. Please wait for chain confirmation (or click Sync) before paying.'
            : 'This invoice is still sending. Please wait for chain confirmation (or click Sync) before cancelling.'
      });
      return false;
    }
    return true;
  }, []);

  const handlePayWithGuard = useCallback((invoice: Invoice, chainStatus: ChainConfirmationStatus | null | undefined) => {
    if (!guardActionByChainStatus(chainStatus, 'pay')) return;
    void invoicesController.handlePay(invoice);
  }, [guardActionByChainStatus, invoicesController]);

  const handleCancelWithGuard = useCallback((invoice: Invoice, chainStatus: ChainConfirmationStatus | null | undefined) => {
    if (!guardActionByChainStatus(chainStatus, 'cancel')) return;
    void invoicesController.handleCancel(invoice);
  }, [guardActionByChainStatus, invoicesController]);

  const getExplorerUrl = useCallback((invoice: Invoice) => {
    return buildExplorerTxUrl(invoice.transactionId);
  }, []);

  return {
    ...invoicesController,
    roleFilter,
    displayInvoices,
    handleRoleChange,
    exportCsv,
    handlePayWithGuard,
    handleCancelWithGuard,
    getExplorerUrl
  };
}
