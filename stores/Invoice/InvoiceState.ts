import { Invoice, AleoField, InvoiceStatus } from '@/lib/types';

/**
 * 链上确认状态
 */
export type ChainConfirmationStatus = 'SENDING' | 'CONFIRMED' | 'TIMEOUT';

/**
 * 初始化状态
 */
export enum InitializationStatus {
  IDLE = 'IDLE',
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  LOADING_DB = 'LOADING_DB',
  READY = 'READY'
}

/**
 * Invoice Store State
 * 管理发票列表和状态
 * 所有方法都直接与 IndexedDB 交互
 */
export interface InvoiceState {
  // 数据
  invoices: Invoice[];     // 所有发票列表
  currentInvoice: Invoice | null;        // ✅ 当前选中的 invoice（包含 metadata）
  chainStatusCache: Record<string, { status: InvoiceStatus; hash: AleoField | null; lastQueried: number }>;
  /**
   * ✅ 全局 SENDING 索引（跨页面共享）
   * - key: invoiceHash
   * - value: true
   *
   * 使用普通对象而不是 Set，避免原地 mutate 导致 zustand 订阅不触发。
   */
  sendingInvoiceHashes: Record<AleoField, true>;

  // Actions - 只保留5个核心接口
  /** ✅ 添加发票：接收发票 → 保存到 IndexedDB → 更新内存 */
  addInvoice: (invoice: Invoice, options?: {
    masterKey?: string;
    persistFull?: boolean;  // 是否持久化完整发票（包括基本信息），默认 true
  }) => Promise<void>;
  
  /** ✅ 更新发票：接收更新 → 保存到 IndexedDB → 更新内存 */
  updateInvoice: (id: AleoField, updates: Partial<Invoice>, options?: {
    masterKey?: string;
    persistFull?: boolean;
  }) => Promise<void>;
  
  /** ✅ 根据 hash 获取发票的 metadata（confirmationStatus） */
  getInvoiceMetadata: (hash: AleoField) => Promise<{ confirmationStatus: ChainConfirmationStatus } | null>;
  
  /** ✅ 根据 hash 获取发票：IndexedDB → 解密 → 更新内存（如需要）→ 返回 */
  getInvoiceByHash: (hash: AleoField, options?: {
    masterKey?: string;
    loadFromDB?: boolean;  // 如果内存中没有，是否从 IndexedDB 加载，默认 true
  }) => Promise<Invoice | null>;
  
  /** ✅ 从 IndexedDB 获取所有发票：IndexedDB → 解密 → 更新内存 → 返回 */
  getAllInvoices: (options?: {
    masterKey?: string;
    refreshMemory?: boolean;  // 是否刷新内存状态，默认 true
  }) => Promise<Invoice[]>;
  
  /** ✅ 批量设置发票：接收数组 → 保存到 IndexedDB → 更新内存 */
  setInvoices: (invoices: Invoice[], options?: {
    masterKey?: string;
    persistFull?: boolean;  // 是否持久化，默认 true
    metadata?: {  // ✅ 添加可选的 metadata 参数
      confirmationStatus: ChainConfirmationStatus;
      lastUpdated: Date;
      dataSource: 'local' | 'chain';
    };
  }) => Promise<void>;
  
  /** ✅ 设置当前 invoice */
  setCurrentInvoice: (hash: AleoField | null, options?: {
    masterKey?: string;
  }) => Promise<void>;
  
  /** ✅ 迁移发票 key：删除旧记录，创建新记录（用于 create action 的 key 迁移） */
  migrateInvoiceKey: (oldId: AleoField, newId: AleoField, updatedInvoice: Partial<Invoice>, options?: {
    masterKey?: string;
    persistFull?: boolean;
  }) => Promise<void>;

  // ---------------------------------------------------------------------------
  // ✅ SENDING 管理（统一入口：用户操作后立即写入，轮询确认后移除）
  // ---------------------------------------------------------------------------

  /** ✅ 标记发票进入 SENDING（只更新内存；是否持久化由 updateInvoice/options 决定） */
  markInvoiceSending: (invoiceHash: AleoField) => void;
  /** ✅ 标记发票已确认（从 sending 索引移除） */
  markInvoiceConfirmed: (invoiceHash: AleoField) => void;
  /** ✅ 获取当前所有 SENDING 发票 hash 列表 */
  getSendingInvoiceHashes: () => AleoField[];
  /** ✅ 基于 invoices 重新构建 sending 索引（初始化/批量覆盖时使用） */
  rebuildSendingIndex: () => void;

  /** ✅ 更新链上状态缓存 */
  updateChainStatus: (invoiceId: AleoField, status: InvoiceStatus, hash: AleoField | null) => void;
  /** ✅ 读取链上状态缓存（含 TTL） */
  getChainStatus: (invoiceId: AleoField) => InvoiceStatus | null;
}
