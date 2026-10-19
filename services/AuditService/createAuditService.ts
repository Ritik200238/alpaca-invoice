import type { AleoAddress } from '@/lib/types';
import { IWalletService } from '@/services/WalletService/IWalletService';
import { IAuditService } from './IAuditService';
import { AuditService, AuditServiceDependencies } from './AuditServiceImpl';

/**
 * Factory function: Create AuditService instance with dependencies
 * 
 * Responsibility:
 * - Inject dependencies (wallet service, stores) into AuditService
 * - Provide unified IAuditService interface
 * - Reuses wallet service's signMessage (no duplication)
 * 
 * Note:
 * - Master key is NOT passed as a dependency
 * - AuditService will derive master key internally using CryptoService.deriveMasterKey()
 */
export function createAuditService(
  walletService: IWalletService,
  publicKey: string | null
): IAuditService {
  // Validate signMessage availability
  if (!walletService.signMessage) {
    console.warn('[AuditService] Wallet does not support signMessage');
  }

  // Use wallet service's signMessage directly (already handles encoding/decoding)
  const signMessage = async (message: string): Promise<string> => {
    if (!walletService.signMessage) {
      throw new Error('Wallet does not support signMessage');
    }
    return walletService.signMessage(message);
  };

  // Create service instance with dependencies
  // Note: masterKey is NOT passed; service will derive it internally
  const auditService = new AuditService({
    signerAddress: publicKey as AleoAddress | null,
    signMessage
  });

  return auditService;
}
