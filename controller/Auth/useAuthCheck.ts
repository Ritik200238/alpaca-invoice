import { useCallback, useMemo, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useUserStore } from '@/stores/User/useUserStore';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { createWalletAdapter } from '@/services/WalletService/createWalletAdapter';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { WalletServiceError, WalletError } from '@/services/WalletService/IWalletService';
import { MASTER_KEY_SIGNATURE_MESSAGE } from '@/lib/auth-constants';
import { toast } from 'sonner';

/**
 * useAuthCheck Hook
 * Standalone authorization check and handling logic
 * Can be reused across multiple pages (list page, detail page, etc.)
 */
export function useAuthCheck() {
  const wallet = useWallet();
  const { masterKey, publicKey, setMasterKey, tryRestoreMasterKey } = useUserStore();
  const { handleError } = useErrorHandler();
  const [isRequestingAuth, setIsRequestingAuth] = useState(false);

  // Cache service instances with useMemo
  const walletService = useMemo(() =>
    wallet ? new WalletService(createWalletAdapter(wallet)) : null,
    [wallet]
  );
  const cryptoService = useMemo(() => new CryptoService(), []);

  /**
   * Check if authorization is required
   */
  const isAuthRequired = useMemo((): boolean => {
    return !masterKey && !!publicKey && !!wallet?.connected;
  }, [masterKey, publicKey, wallet?.connected]);

  /**
   * Handle unlock (request authorization and derive masterKey)
   */
  const handleUnlock = useCallback(async () => {
    if (!walletService || !publicKey) {
      toast.error('Wallet not connected', {
        description: 'Please connect your wallet first'
      });
      return;
    }

    setIsRequestingAuth(true);
    try {
      // Try restore from device first (no re-sign; same masterKey as before)
      const restored = await tryRestoreMasterKey();
      if (restored) {
        toast.success('Authorization successful', {
          id: 'auth-unlock',
          description: 'You can now access your private invoice data'
        });
        return;
      }

      toast.loading('Requesting authorization...', { id: 'auth-unlock' });

      // Request signature (same message as create-invoice so derived masterKey matches)
      const signature = await walletService.signMessage(
        MASTER_KEY_SIGNATURE_MESSAGE,
        publicKey
      );

      if (!signature) {
        throw new WalletServiceError(
          WalletError.USER_REJECTED,
          'Failed to obtain signature for master key generation'
        );
      }

      // Derive master key from signature and persist to device for future restore
      const derivedMasterKey = await cryptoService.deriveMasterKey(signature);
      setMasterKey(derivedMasterKey);

      toast.success('Authorization successful', {
        id: 'auth-unlock',
        description: 'You can now access your private invoice data'
      });
    } catch (error: any) {
      console.error('Failed to unlock:', error);

      if (error instanceof WalletServiceError && error.code === WalletError.USER_REJECTED) {
        toast.error('Authorization cancelled', {
          id: 'auth-unlock',
          description: 'Please approve the signature request to continue'
        });
      } else {
        toast.error('Authorization failed', {
          id: 'auth-unlock',
          description: error instanceof Error ? error.message : 'Unknown error occurred'
        });
      }

      handleError(error as Error);
    } finally {
      setIsRequestingAuth(false);
    }
  }, [walletService, publicKey, cryptoService, setMasterKey, tryRestoreMasterKey, handleError]);

  return {
    isAuthRequired,
    handleUnlock,
    isRequestingAuth
  };
}
