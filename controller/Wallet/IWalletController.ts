
import { AleoAddress } from "@/lib/types";

export interface IWalletController {
  // --- State exposure (mapped from Store) ---
  address: AleoAddress | null;
  publicBalance: string;  // Converted from Microcredits to readable string (e.g. "10.50")
  privateBalance: string; // Same as above
  networkChanged: boolean; // Indicates whether wallet has disconnected (possibly due to network switch)

  // --- Business methods ---
  /** Logic: Trigger wallet modal (WalletMultiButton handles actual connect) */
  handleConnect(): Promise<void>;

  /** Logic: Clear all local Stores -> Call WalletService.disconnect */
  handleLogout(): void;

  /** Logic: Call WalletService.getPrivateBalance and AleoProtocolService.getPublicBalance in parallel -> Update WalletStore */
  syncBalances(): Promise<void>;
}
