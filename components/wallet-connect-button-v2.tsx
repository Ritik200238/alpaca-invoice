'use client';

import { useWalletController } from '@/controller/Wallet/useWalletController';
import { getNetworkFromEnv, getNetworkDisplayName } from '@/lib/network';
import { Wallet, LogOut, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui';

export default function WalletConnectButtonV2() {
  const {
    address,
    publicBalance,
    privateBalance,
    networkChanged,
    handleLogout,
  } = useWalletController();

  const expectedNetwork = getNetworkFromEnv();
  const networkName = getNetworkDisplayName(expectedNetwork);

  if (!address) {
    return (
      // relative container so the warning card can anchor below the button row
      <div className="relative inline-flex items-center gap-2" data-tour="wallet-connect">
        {/* Network badge */}
        <span className={cn(
          'rounded-full px-2.5 py-1 text-xs font-medium ring-1',
          networkChanged
            ? 'bg-orange-100 text-orange-700 ring-orange-200'
            : 'bg-accent-100/80 text-accent-700 ring-accent-200/50'
        )}>
          {networkName}
        </span>

        {/* Connect Button */}
        <WalletMultiButton
          className={cn(
            'inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2',
            'bg-accent-500 text-sm font-semibold text-white',
            'shadow-sm transition-all',
            'hover:bg-accent-600 hover:shadow-md'
          )}
          startIcon={<Wallet className="h-4 w-4" />}
          onClick={() => console.log('[UI] WalletMultiButton v2 click')}
        />

        {/* Disconnection warning — floats below, does not affect header height */}
        {networkChanged && (
          <div className="absolute right-0 top-full z-50 mt-2 flex w-64 items-start gap-3 rounded-xl border border-orange-200/80 bg-white px-3.5 py-3 shadow-lg shadow-orange-100/60 ring-1 ring-orange-100">
            <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-orange-100">
              <WifiOff className="h-3.5 w-3.5 text-orange-500" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">Wallet Disconnected</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Network may have changed. Switch to{' '}
                <span className="font-semibold text-orange-600">{networkName}</span>
                {' '}and reconnect.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-3 rounded-2xl border border-white/60 bg-white/80 px-4 py-2.5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.25)] backdrop-blur" data-tour="wallet-connect">
      {/* Connection Status */}
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success-500" />
        </span>
        <div className="flex flex-col">
          <span className="font-mono text-sm font-medium text-primary-900">
            {address.slice(0, 8)}...{address.slice(-6)}
          </span>
          <span className="text-xs text-primary-500">{networkName}</span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-8 w-px bg-primary-200/70" />

      {/* Balance: Public / Private in 2 lines (credits 不换行) */}
      <div className="flex min-w-0 flex-col gap-0.5 text-sm">
        <span className="whitespace-nowrap text-primary-900">
          <span className="text-xs text-primary-500">Public </span>
          <span className="font-semibold tabular-nums">{publicBalance}</span>
          <span className="text-xs text-primary-500"> credits</span>
        </span>
        <span className="whitespace-nowrap text-primary-900">
          <span className="text-xs text-primary-500">Private </span>
          <span className="font-semibold tabular-nums">{privateBalance}</span>
          <span className="text-xs text-primary-500"> credits</span>
        </span>
      </div>

      {/* Disconnect */}
      <button
        onClick={handleLogout}
        className="cursor-pointer rounded-lg p-2 text-primary-400 transition-colors hover:bg-error-50 hover:text-error-600"
        title="Disconnect"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
