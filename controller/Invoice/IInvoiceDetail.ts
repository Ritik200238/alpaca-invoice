import { Invoice, AleoField, Microcredits } from '@/lib/types';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { StatusConfig } from '@/lib/invoice';
import type { TaxGroups } from '@/lib/types';

/**
 * 用户在发票中的角色
 */
export type UserRole = 'seller' | 'buyer' | 'unknown';

// 重新导出 StatusConfig（保持向后兼容）
export type { StatusConfig };

/**
 * IInvoiceDetail Controller 接口
 * 实现场景B & C：查看详情与Record自动对账
 * 
 * ✅ 统一轮询架构：
 * - 自动轮询：由全局 AutoPoller 统一管理
 * - isSyncing：从全局 sendingInvoiceHashes 派生
 * - 手动同步：通过 handleSyncStatus 触发
 */
export interface IInvoiceDetail {
  /** 发票对象 */
  invoice: Invoice | null;
  
  /** 是否正在加载发票（从 IndexedDB） */
  isLoadingInvoice: boolean;
  
  /** 当前链上确认状态（null 表示尚未加载） */
  currentStatus: ChainConfirmationStatus | null;
  
  /** ✅ 是否正在同步链上记录（从全局 sendingInvoiceHashes 派生） */
  isSyncing: boolean;
  
  /** 是否已确认（在链上找到） */
  isConfirmed: boolean;
  
  /** 当前用户在发票中的角色 */
  userRole: UserRole;
  
  /** 发票状态配置 */
  statusConfig: StatusConfig;
  
  /** 是否正在处理操作（支付/取消） */
  isProcessing: boolean;
  
  /** 是否正在手动同步状态 */
  isSyncingStatus: boolean;
  
  /** 处理支付（直接使用 hook 的 invoice），返回 true 表示成功 */
  handlePay: () => Promise<boolean>;

  /** 处理取消（直接使用 hook 的 invoice），返回 true 表示成功 */
  handleCancel: () => Promise<boolean>;
  
  /** 手动同步发票状态（从链上获取最新 record） */
  handleSyncStatus: () => Promise<void>;

  // Wave 3 派生字段
  /** 是否为 JCT 发票（tax_tag !== '0field'） */
  isJctInvoice: boolean;
  /** 是否为 USDCx 发票（currencyFlag === 1） */
  isUsdcxInvoice: boolean;
  /** 链上 tax_tag / 税率分组（详情页展示） */
  taxTag: AleoField | null;
  /** 链上 jct_registration */
  jctRegistration: AleoField | null;
  /** 发票总金额（含税） */
  totalAmount: Microcredits | null;
  /** 税率分组（用于详情页税务明细） */
  taxGroups: TaxGroups | null;
}

