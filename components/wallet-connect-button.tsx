'use client';

import { WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui';

export default function WalletConnectButton() {
  return (
    <div className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm">
      <WalletMultiButton onClick={() => console.log('[UI] WalletMultiButton click')} />
    </div>
  );
}
