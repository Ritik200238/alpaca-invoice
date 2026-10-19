import { ShieldWalletAdapter } from '@provablehq/aleo-wallet-adaptor-shield';
import { WalletConnectionError } from '@provablehq/aleo-wallet-adaptor-core';
import type { Network } from '@provablehq/aleo-types';
import { WalletDecryptPermission } from '@provablehq/aleo-wallet-standard';

/**
 * Shield adapter with timeout & fallback attempts to avoid无限 connecting。
 */
export class ShieldWalletAdapterPatched extends ShieldWalletAdapter {
  async connect(network?: Network, decryptPermission?: WalletDecryptPermission, programs?: string[]) {
    const timeoutMs = 8000;
    const start = Date.now();

    const attempt = async (
      label: string,
      net: Network | string | undefined,
      perm: WalletDecryptPermission | undefined,
      progs?: string[]
    ) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new WalletConnectionError(`Shield connect timeout after ${timeoutMs}ms [${label}]`));
        }, timeoutMs);
      });

      try {
        const res = await Promise.race([
          super.connect(net as Network, perm ?? WalletDecryptPermission.UponRequest, progs),
          timeoutPromise
        ]);

        console.log('[ShieldAdapterPatched] connect resolved', {
          attempt: label,
          durationMs: Date.now() - start,
          network: net,
          programs: progs,
          decryptPermission: perm
        });

        return res as Awaited<ReturnType<ShieldWalletAdapter['connect']>>;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    const attempts = [
      { label: 'net-default+perm-default+programs', net: network, perm: decryptPermission, progs: programs },
      { label: 'net-default+perm-upon-request+programs', net: network, perm: WalletDecryptPermission.UponRequest, progs: programs },
      { label: 'net-testnet3+perm-default+programs', net: 'testnet3', perm: decryptPermission, progs: programs },
      { label: 'net-testnet3+perm-upon-request+programs', net: 'testnet3', perm: WalletDecryptPermission.UponRequest, progs: programs },
      { label: 'net-default+perm-upon-request+no-programs', net: network, perm: WalletDecryptPermission.UponRequest, progs: [] },
      { label: 'no-args', net: undefined, perm: WalletDecryptPermission.UponRequest, progs: undefined }
    ];

    let lastError: unknown;
    for (const a of attempts) {
      try {
        return await attempt(a.label, a.net, a.perm, a.progs);
      } catch (e) {
        lastError = e;
        console.warn('[ShieldAdapterPatched] connect attempt failed', { attempt: a.label, error: e });
      }
    }

    throw lastError;
  }

  /**
   * Shield extension can throw several non-fatal errors during disconnect:
   *   - "Receiving end does not exist"  → background channel already gone
   *   - "No response"                   → extension didn't reply (port closed)
   *   - "Could not establish connection" → tab/extension race on close
   *
   * All of these mean the extension is effectively already disconnected, so
   * we treat them as success to avoid crashing the UI on the first click.
   */
  async disconnect() {
    try {
      await super.disconnect();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : String(error ?? '');
      const lower = msg.toLowerCase();

      const isAlreadyGone =
        lower.includes('receiving end does not exist') ||
        lower.includes('no response') ||
        lower.includes('could not establish connection');

      if (isAlreadyGone) {
        console.warn(
          '[ShieldAdapterPatched] disconnect treated as success (extension already gone):',
          msg
        );
        return; // treat as disconnected — do not rethrow
      }

      throw error;
    }
  }
}

export default ShieldWalletAdapterPatched;
