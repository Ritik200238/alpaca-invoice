import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { IWalletController } from './IWalletController';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { createWalletAdapter } from '@/services/WalletService/createWalletAdapter';
import type { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { useUserStore } from '@/stores/User/useUserStore';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { getNetworkFromEnv } from '@/lib/network';
import type { AleoAddress } from '@/lib/types';

/**
 * Wallet Controller Implementation
 *
 * Connection state philosophy:
 *   The Aleo wallet adapter fires spurious `disconnect` events during ZK proof
 *   generation (Chrome message-port timeout). Reacting to these events with
 *   debounce timers proved unreliable across varying proof durations.
 *
 *   Therefore we follow a **explicit-logout-only** strategy:
 *   - We set state when the wallet connects (address + connected).
 *   - We NEVER clear state in response to disconnect events.
 *   - We ONLY clear state when the user explicitly clicks "Logout".
 *   - If the adapter is temporarily disconnected, operations may fail —
 *     the error handler will prompt the user to reconnect.
 */
export function useWalletController(): IWalletController {
  const wallet = useWallet();
  const [networkChanged, setNetworkChanged] = useState(false);
  const [aleoProtocolService, setAleoProtocolService] = useState<AleoProtocolService | null>(null);

  // Set to true while handleLogout is executing to prevent the monitoring
  // useEffect from race-restoring the session.
  const isDisconnectingRef = useRef(false);

  // Get state from Store
  const {
    publicKey,
    connected,
    publicBalance,
    privateBalance,
    setAccount,
    updateBalances,
    clearUser
  } = useUserStore();

  // Error handling
  const { handleError } = useErrorHandler();

  // Create WalletService instance (via adapter)
  const walletService = useMemo(() => {
    if (!wallet) return null;
    const adapter = createWalletAdapter(wallet);
    return new WalletService(adapter);
  }, [wallet]);

  // Async load AleoProtocolService (avoid loading WASM in Server Component)
  useEffect(() => {
    const network = getNetworkFromEnv();

    // Dynamically import AleoProtocolService, only executed on client side
    import('@/services/AleoProtocolService/AleoProtocolServiceImpl')
      .then((module) => {
        const service = new module.AleoProtocolService(network);
        setAleoProtocolService(service);
        console.log('✅ AleoProtocolService initialized on client side');
      })
      .catch((error) => {
        console.error('❌ Failed to initialize AleoProtocolService:', error);
      });
  }, []); // Only execute once on component mount

  /**
   * Convert microcredits (bigint) to a readable string
   */
  const formatBalance = (microcredits: bigint): string => {
    const credits = Number(microcredits) / 1_000_000;
    return credits.toFixed(6);
  };

  // Debug logging for wallet state (helps detect stuck "connecting")
  useEffect(() => {
    console.log('🔍 wallet state', {
      name: wallet?.wallet?.adapter?.name,
      readyState: wallet?.wallet?.readyState,
      connected: wallet?.connected,
      connecting: wallet?.connecting,
      address: wallet?.address,
      network: wallet?.wallet?.adapter?.network
    });
  }, [wallet?.wallet, wallet?.connected, wallet?.connecting, wallet?.address]);

  // Log Shield/Fox/Leo availability once on client mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { shield, leoWallet } = (window as any) || {};
    console.log('🔍 wallet globals', {
      hasShield: !!shield,
      hasLeo: !!leoWallet,
      ua: navigator.userAgent
    });
  }, []);

  // Warn if连接长时间未完成，便于现场排查
  useEffect(() => {
    if (!wallet?.connecting) return;

    const warnTimer = setTimeout(() => {
      console.warn('⏱️ wallet still connecting after 8s', {
        name: wallet?.wallet?.adapter?.name,
        readyState: wallet?.wallet?.readyState,
        network: wallet?.wallet?.adapter?.network,
        address: wallet?.address,
        hasWindowShield: typeof window !== 'undefined' ? !!(window as any)?.shield : 'ssr'
      });
    }, 8000);

    return () => clearTimeout(warnTimer);
  }, [wallet?.connecting, wallet?.wallet]);


  /**
   * Sync balances: private from wallet (always when connected); public from chain when AleoProtocolService is ready
   */
  const syncBalances = useCallback(async () => {
    if (!walletService || !wallet?.connected || !publicKey) return;

    try {
      let privateBalance = 0n;
      let publicBalance = 0n;

      privateBalance = await walletService.getPrivateBalance(publicKey);

      if (aleoProtocolService) {
        publicBalance = await aleoProtocolService.getPublicBalance(publicKey);
      }

      updateBalances(publicBalance, privateBalance);
    } catch (error) {
      console.error('Failed to sync balances:', error);
    }
  }, [walletService, aleoProtocolService, publicKey, updateBalances]);

  /**
   * Handle wallet connection
   */
  const handleConnect = useCallback(async () => {
    // WalletMultiButton opens the modal and triggers connect inside the adapter.
    // Avoid auto-connect here to prevent browsers from blocking the extension popup.
    console.log('🔍 handleConnect: WalletMultiButton will manage selection & connect');
  }, []);

  /**
   * Handle logout — the ONLY path that clears user state.
   */
  const handleLogout = useCallback(async () => {
    isDisconnectingRef.current = true;

    // Clear store immediately for instant UI feedback
    clearUser();
    setNetworkChanged(false);

    try {
      if (walletService) {
        await walletService.disconnect();
        console.log('✅ Wallet disconnected');
      }
    } catch (error) {
      console.warn('⚠️ Wallet disconnect error (ignored — user already cleared):', error);
    }

    // Release the guard after a short delay so future reconnects work.
    // We use a timeout because the adapter's React state update
    // (wallet.connected → false) arrives asynchronously and would
    // otherwise be ignored by the monitoring useEffect.
    setTimeout(() => {
      isDisconnectingRef.current = false;
    }, 2000);
  }, [walletService, clearUser]);

  /**
   * Monitor wallet adapter state and sync to UserStore.
   *
   * - When the adapter connects (address + connected): save to store.
   * - When the adapter disconnects: attempt auto-reconnect instead of
   *   clearing state (ZK proof generation causes spurious disconnects).
   * - State is only cleared by the explicit handleLogout above.
   */
  useEffect(() => {
    const walletPublicKey = wallet?.address || null;
    const walletConnected = wallet?.connected || false;

    if (walletPublicKey && walletConnected && !isDisconnectingRef.current) {
      if (walletPublicKey !== publicKey || !connected) {
        setAccount(walletPublicKey as AleoAddress, true);
        setNetworkChanged(false);
        console.log('✅ Wallet state synced to store:', walletPublicKey);
      }
    }

  }, [wallet?.address, wallet?.connected, publicKey, connected, setAccount]);

  useEffect(() => {
    // After account connection succeeds, sync balances (once on load / on reconnect)
    if (publicKey && connected) {
      syncBalances()
    }
  }, [publicKey, connected, syncBalances])

  return {
    // State
    address: publicKey,
    publicBalance: formatBalance(publicBalance),
    privateBalance: formatBalance(privateBalance),
    networkChanged,

    // Methods
    handleConnect,
    handleLogout,
    syncBalances
  };
}
