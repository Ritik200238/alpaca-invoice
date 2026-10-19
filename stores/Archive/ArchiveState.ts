import { AleoField, InvoiceDetails } from '@/lib/types';

export interface ArchiveState {
  /**
   * 核心映射：发票哈希 -> 解密后的业务明细明文
   * 存储的是用户已解密并归档的完整发票内容
   */
  archives: Record<AleoField, InvoiceDetails>;

  /**
   * 正在处理中的哈希列表
   * 用于防止重复触发解密或在 UI 上显示归档进度
   */
  pendingArchives: Set<AleoField>;

  // --- Actions ---

  /**
   * 归档新解密的发票
   * 逻辑：写入 Store -> 调用 StorageService 进行本地持久化加密
   */
  addArchive: (hash: AleoField, details: InvoiceDetails) => Promise<void>;

  /**
   * 初始加载：应用启动时从 StorageService 读取已加密保存的档案
   */
  hydrateArchives: () => Promise<void>;

  /**
   * 移除档案：从本地和 Store 中同步删除某条发票明细
   */
  removeArchive: (hash: AleoField) => Promise<void>;

  /**
   * 清除会话：退出登录时清空 Store 内存，但不一定删除 Storage 中的加密数据
   */
  clearSession: () => void;
}