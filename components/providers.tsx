'use client';

import { AleoWalletProvider } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletModalProvider } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { LeoWalletAdapter } from '@provablehq/aleo-wallet-adaptor-leo';
import { PuzzleWalletAdapter } from '@provablehq/aleo-wallet-adaptor-puzzle';
// Patched to add timeout + logging; avoids无限 connecting when extension不回应
import ShieldWalletAdapterPatched from '@/lib/wallet/ShieldWalletAdapterPatched';
import { FoxWalletAdapter } from '@provablehq/aleo-wallet-adaptor-fox';
import { DecryptPermission } from '@provablehq/aleo-wallet-adaptor-core';
import { Network } from '@provablehq/aleo-types';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { getNetworkFromEnv } from '@/lib/network';
import { PROGRAM_ID, LEGACY_PROGRAM_ID, CREDITS_PROGRAM_ID, USDCX_PROGRAM_ID, PROGRAM_ID_V4, CREDIT_PROGRAM_ID } from '@/lib/contract';
import './wallet.css';

type Props = {
  children: ReactNode;
};

/**
 * Wallet Provider configuration
 *
 * Network is controlled by the NEXT_PUBLIC_ALEO_NETWORK environment variable
 * When the user switches networks in the wallet extension, a disconnect event is triggered
 */
export default function Providers({ children }: Props) {
  const network = useMemo<Network>(() => getNetworkFromEnv(), []);
  const programs = useMemo(
    () =>
      [CREDITS_PROGRAM_ID, PROGRAM_ID, LEGACY_PROGRAM_ID, USDCX_PROGRAM_ID, PROGRAM_ID_V4, CREDIT_PROGRAM_ID]
        .map((p) => (typeof p === 'string' ? p.trim() : ''))
        .filter((p) => p && p !== 'undefined' && p !== 'null'),
    []
  );

  const wallets = useMemo(
    () => [
      new ShieldWalletAdapterPatched({ appName: 'ZK Invoice', network, programs }),
      new PuzzleWalletAdapter({ appName: 'ZK Invoice' }),
      new LeoWalletAdapter({ appName: 'ZK Invoice' }),
      new FoxWalletAdapter({ appName: 'ZK Invoice' })
    ],
    [network, programs]
  );
  
  return (
    <AleoWalletProvider
      wallets={wallets}
      decryptPermission={DecryptPermission.OnChainHistory}
      network={network}
      programs={programs}
      autoConnect={true}
      localStorageKey="zk-invoice-wallet"
      onError={(err) => {
        console.error('❌ [AleoWalletProvider] error', err);
      }}
    >
      <WalletModalProvider>{children}</WalletModalProvider>
    </AleoWalletProvider>
  );
}
