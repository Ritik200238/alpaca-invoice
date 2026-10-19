import { AleoAddress, Microcredits } from "@/lib/types";

// 存储当前连接的账户信息和余额
export interface UserState {
  publicKey: AleoAddress | null;    // 钱包公钥地址（原 address）
  connected: boolean;               // 钱包连接状态
  masterKey: string | null;         // 本地加密主密钥（从签名派生）
  publicBalance: Microcredits;      // bigint
  privateBalance: Microcredits;     // bigint
  
  // Actions
  setAccount: (publicKey: AleoAddress, connected: boolean) => void;
  setMasterKey: (masterKey: string, options?: { persistToDevice?: boolean }) => void;
  /** Restore masterKey from device-wrapped storage if available (no re-sign). Returns true if restored. */
  tryRestoreMasterKey: () => Promise<boolean>;
  updateBalances: (pub: Microcredits, priv: Microcredits) => void;
  clearUser: () => void;
}