import { Invoice } from "@/lib/types";
import type { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';

/**
 * 发票状态配置
 */
export interface StatusConfig {
  label: string;
  icon: string;
  bg: string;
  text: string;
  border: string;
}

/**
 * 带角色的发票项类型
 */
export type InvoiceWithRole = {
  invoice: Invoice;
  role: 'SELLER' | 'BUYER' | 'BOTH' | 'NONE';
  chainStatus: ChainConfirmationStatus;
  statusConfig: StatusConfig;
};

export type InvoiceListFilter =
  | 'all'
  | 'pending'
  | 'paid'
  | 'cancelled'
  | 'escrowed'
  | 'resolved';

/**
 * IInvoices Controller 接口
 * 发票列表页的业务逻辑控制器
 */
export interface IInvoices {
  // --- 数据 ---
  /** 过滤后的发票列表（包含角色、链上状态、状态配置） */
  filteredInvoices: InvoiceWithRole[];
  
  /** 已收到发票（角色为 BUYER 或 BOTH） */
  receivedInvoices: InvoiceWithRole[];
  
  /** 发出去的发票（角色为 SELLER 或 BOTH） */
  sentInvoices: InvoiceWithRole[];
  
  /** 待支付发票（状态为 PENDING） */
  pending: InvoiceWithRole[];
  
  /** 已支付发票（状态为 PAID） */
  complete: InvoiceWithRole[];
  
  // --- 状态 ---
  /** 当前过滤状态 */
  filter: InvoiceListFilter;
  
  /** 搜索关键词 */
  search: string;
  
  /** 是否正在加载 */
  isLoading: boolean;

  /** 是否正在同步状态 */
  isSyncing: boolean;

  // --- UI 状态判断 ---
  /** 是否显示加载状态（业务逻辑判断） */
  showLoading: boolean;
  
  /** 是否显示钱包连接提示（业务逻辑判断） */
  showWalletPrompt: boolean;
  
  /** 是否显示主内容（业务逻辑判断） */
  showMainContent: boolean;

  // --- 业务方法 ---
  /** 设置过滤状态 */
  setFilter: (filter: InvoiceListFilter) => void;
  
  /** 设置搜索关键词 */
  setSearch: (search: string) => void;
  
  /** 刷新发票列表（重新初始化） */
  refresh: () => Promise<void>;

  /** 从链上同步所有发票的最新状态 */
  handleSyncAll: () => Promise<void>;

  /** 处理支付发票（买家操作） */
  handlePay: (invoice: Invoice) => Promise<void>;

  /** 处理取消发票（卖家操作） */
  handleCancel: (invoice: Invoice) => Promise<void>;

  /** 检查发票是否正在处理（支付/取消中） */
  isInvoiceProcessing: (invoiceId: string) => boolean;

  /** 检查发票是否正在同步（轮询中） */
  isInvoiceSyncing: (invoice: Invoice) => boolean;

  // --- Wave 3 派生聚合数据（Dashboard）---
  /** PENDING 进项发票总额 (Account Payable) */
  totalAccountPayable: bigint;
  /** 本月 PAID 发票总支付额 (Total Paid) */
  totalPaidThisMonth: bigint;
  /** tax_tag ≠ 0field 的已付发票可抵扣进项税额 (JCT Deductible) */
  jctDeductibleAmount: bigint;
  /** Credits vs USDCx 支付配比（资产饼图） */
  currencyDistribution: { credits: bigint; usdcx: bigint };
  /** 过去 6 个月进项/销项税额趋势 */
  taxTrend: Array<{ month: string; inputTax: bigint; outputTax: bigint }>;
}
