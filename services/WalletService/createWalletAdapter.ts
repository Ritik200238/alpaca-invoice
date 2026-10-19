import type { WalletContextState } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletReadyState } from '@provablehq/aleo-wallet-standard';
import { IWalletService, WalletServiceError, WalletError } from './IWalletService';
import { getNetworkFromEnv } from '@/lib/network';
import { PROGRAM_ID, LEGACY_PROGRAM_ID, CREDITS_PROGRAM_ID } from '@/lib/contract';

/**
 * Adapter that bridges WalletContextState to our IWalletService interface.
 *
 * Responsibilities:
 * - Bridge the React hook (useWallet) to the TypeScript service layer
 * - Normalize connect() parameter differences
 * - Provide a unified IWalletService implementation
 */
export function createWalletAdapter(walletContext: WalletContextState): IWalletService {
  const network = getNetworkFromEnv();
  const programs = [CREDITS_PROGRAM_ID, PROGRAM_ID, LEGACY_PROGRAM_ID];
  const CONNECT_TIMEOUT_MS = 12000; // 防止扩展静默不回应导致无限 connecting

  return {
    // Adapt connect(): convert hook style to service interface
    async connect() {
      // 1) Ensure at least one wallet is available
      const availableWallets = walletContext.wallets.filter(
        (w) => w.readyState === WalletReadyState.INSTALLED || w.readyState === WalletReadyState.LOADABLE
      );

      if (availableWallets.length === 0) {
        throw new WalletServiceError(
          WalletError.NOT_INSTALLED,
          'No Aleo wallet detected. Please install and unlock Shield/Leo/Puzzle/Fox wallet.',
          { hint: 'Open the wallet extension and refresh the page' }
        );
      }

      // 2) If already connected, skip
      if (walletContext.connected && walletContext.address) {
        return;
      }

      // Do NOT auto-select a wallet; user must choose via WalletMultiButton
      if (!walletContext.wallet || !walletContext.wallet.adapter?.name) {
        throw new WalletServiceError(
          WalletError.NOT_INSTALLED,
          'No wallet selected. Please click Connect and choose Shield / Leo / Puzzle / Fox.',
          { hint: 'Open the wallet modal and pick a wallet' }
        );
      }

      // ReadyState guard: block if the chosen wallet is not installed/unlocked
      if (
        walletContext.wallet.readyState !== WalletReadyState.INSTALLED &&
        walletContext.wallet.readyState !== WalletReadyState.LOADABLE
      ) {
        throw new WalletServiceError(
          WalletError.NOT_INSTALLED,
          'Wallet not ready. Please unlock or finish onboarding in the selected wallet.',
          { hint: 'Open the wallet extension, configure an account, then retry' }
        );
      }

      // 4) Call connect and let the adapter handle internal state
      try {
        const start = Date.now();

        // Promise.race 防止扩展不弹窗时长时间挂起
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(
              new WalletServiceError(
                WalletError.USER_REJECTED,
                `Wallet connect timed out after ${CONNECT_TIMEOUT_MS}ms – likely no popup from extension`,
                {
                  hint: '确认扩展已解锁，且浏览器允许弹窗；如在 Brave/Edge 打开，请关闭弹窗拦截后重试'
                }
              )
            );
          }, CONNECT_TIMEOUT_MS);
        });

        await Promise.race([
          walletContext.connect(network),
          timeoutPromise
        ]);

        if (timeoutId) clearTimeout(timeoutId);

        // If user closed the modal or refused, the connection stays false → treat as rejection
        if (!walletContext.connected || !walletContext.address) {
          throw new WalletServiceError(
            WalletError.USER_REJECTED,
            'Connection was cancelled or not approved.',
            { originalError: 'wallet_not_connected' }
          );
        }
      } catch (error: any) {
        // Improved user-rejection detection
        const errorMessage = error?.message?.toLowerCase() || '';
        const errorString = String(error).toLowerCase();
        const errorCode = error?.code || error?.error?.code;

        // Detect various user-rejection patterns
        if (
          errorMessage.includes('reject') ||
          errorMessage.includes('denied') ||
          errorMessage.includes('cancel') ||
          errorMessage.includes('user cancelled') ||
          errorString.includes('reject') ||
          errorString.includes('denied') ||
          errorString.includes('cancel') ||
          errorCode === 4001 || // EIP-1193 style rejection code
          errorCode === 'ACTION_REJECTED' ||
          errorCode === 'USER_REJECTED'
        ) {
          // Re-throw as USER_REJECTED so WalletServiceImpl can handle uniformly
          throw new WalletServiceError(
            WalletError.USER_REJECTED,
            'User rejected the connection request',
            { originalError: error }
          );
        }

        // Wallet not selected / not ready
        if (error?.name === 'WalletNotSelectedError') {
          throw new WalletServiceError(
            WalletError.NOT_INSTALLED,
            'Wallet not selected. Please open and select a wallet (Shield/Leo/Puzzle/Fox).',
            { originalError: error }
          );
        }

        if (error?.name === 'WalletNotReadyError' || errorMessage.includes('not ready')) {
          throw new WalletServiceError(
            WalletError.NOT_INSTALLED,
            'Wallet not ready. Please unlock the wallet extension and retry.',
            { originalError: error }
          );
        }

        // Shield/Fox may return “Please configure your wallet first” when no account is set up
        if (
          error?.name === 'WalletConnectionError' ||
          errorMessage.includes('configure your wallet') ||
          errorString.includes('configure your wallet')
        ) {
          throw new WalletServiceError(
            WalletError.NOT_INSTALLED,
            'Please configure your wallet first (create/import an account in the selected wallet).',
            { originalError: error }
          );
        }
        
        // Let other errors bubble up to WalletServiceImpl
        throw error;
      }
    },
    
    async disconnect() {
      await walletContext.disconnect();
    },
    
    // Forward signMessage (adapter returns Uint8Array)
    signMessage: walletContext.signMessage
      ? async (message: string) => {
          const encoder = new TextEncoder();
          const decoder = new TextDecoder();
          const signature = await walletContext.signMessage!(encoder.encode(message));
          return signature ? decoder.decode(signature) : '';
        }
      : undefined,
    
    // Forward requestRecords with resilient fallback for different wallet implementations
    requestRecords: walletContext.requestRecords
      ? async (program: string) => {
          try {
            const records = await walletContext.requestRecords!(program, true);
            return { records: records as any[] };
          } catch {
            const records = await walletContext.requestRecords!(program);
            return { records: (Array.isArray(records) ? records : (records as any)?.records ?? []) as any[] };
          }
        }
      : undefined,

    // Forward requestRecordPlaintexts via requestRecords
    requestRecordPlaintexts: walletContext.requestRecords
      ? async (program: string) => {
          try {
            const records = await walletContext.requestRecords!(program, true);
            return { records: records as any[] };
          } catch {
            const records = await walletContext.requestRecords!(program);
            return { records: (Array.isArray(records) ? records : (records as any)?.records ?? []) as any[] };
          }
        }
      : undefined,
    
    // Forward requestTransaction using executeTransaction
    requestTransaction: walletContext.executeTransaction
      ? async (params: {
          address: string;
          chainId: string;
          transitions: Array<{
            program: string;
            functionName: string;
            inputs: string[];
          }>;
          fee: number;
          feePrivate: boolean;
        }) => {
          const first = params.transitions?.[0];
          if (!first) throw new Error('No transition specified');
          const safeProgram =
            typeof first.program === 'string' ? first.program.trim() : '';
          const safeFunction =
            typeof first.functionName === 'string' ? first.functionName.trim() : '';

          if (
            !safeProgram ||
            safeProgram === 'undefined' ||
            safeProgram === 'null'
          ) {
            throw new WalletServiceError(
              WalletError.UNAUTHORIZED,
              'Invalid transaction program id. Please check NEXT_PUBLIC_PROGRAM_ID.',
              { originalError: { transition: first, network } }
            );
          }

          if (!safeFunction) {
            throw new WalletServiceError(
              WalletError.UNAUTHORIZED,
              'Invalid transaction function name.',
              { originalError: { transition: first } }
            );
          }

          // Wallet extensions may differ by version:
          // some read {program,function}, others read {programId,functionName}.
          // Send both aliases to maximize compatibility.
          const res = await walletContext.executeTransaction!({
            program: safeProgram,
            function: safeFunction,
            programId: safeProgram,
            functionName: safeFunction,
            inputs: first.inputs,
            fee: params.fee,
            privateFee: params.feePrivate,
            feePrivate: params.feePrivate
          } as any);

          // Shield wallet returns an internal tracking ID in transactionId (e.g. "shield_xxx").
          // The actual Aleo tx ID (at1...) may appear in other fields.
          // Return the best available ID, preferring any at1-prefixed value.
          const r = res as any;
          const candidates = [
            r?.transactionId, r?.txId, r?.tx_id, r?.hash, r?.txHash, r?.id,
          ].filter(Boolean).map(String);
          const aleoTxId = candidates.find((c: string) => c.startsWith('at1'));
          return aleoTxId || candidates[0] || '';
        }
      : undefined,

    // Forward transactionStatus — prefer returning the actual Aleo tx ID if present
    transactionStatus: walletContext.transactionStatus
      ? async (transactionId: string) => {
          const res: any = await walletContext.transactionStatus!(transactionId);
          const candidates = [
            res?.transactionId, res?.txId, res?.tx_id, res?.hash, res?.id,
          ].filter(Boolean).map(String);
          const aleoTxId = candidates.find((c: string) => c.startsWith('at1'));
          if (aleoTxId) return aleoTxId;
          return res?.status || candidates[0] || '';
        }
      : undefined,
  };
}
