import { Network } from '@provablehq/aleo-types';

/**
 * Aleo network normalization
 * Resolves inconsistent network naming across different sources (environment variables, wallet extensions, RPC nodes)
 */
export function normalizeNetwork(input: string | Network | undefined | null): Network {
  const net = (input || '').toLowerCase().trim();

  switch (net) {
    case 'mainnet':
    case Network.MAINNET:
      return Network.MAINNET;
    case 'canary':
    case Network.CANARY:
      return Network.CANARY;
    case 'testnet':
    case 'testnet3':
    case 'testnetbeta':
    case Network.TESTNET:
      return Network.TESTNET;
    default: {
      const envNet = process.env.NEXT_PUBLIC_ALEO_NETWORK;
      return envNet ? normalizeNetwork(envNet) : Network.TESTNET;
    }
  }
}

export function getNetworkFromEnv(): Network {
  return normalizeNetwork(process.env.NEXT_PUBLIC_ALEO_NETWORK);
}

export function getNetworkDisplayName(network: string | Network): string {
  const normalized = normalizeNetwork(network.toString());
  switch (normalized) {
    case Network.MAINNET:
      return 'Mainnet';
    case Network.CANARY:
      return 'Canary';
    case Network.TESTNET:
      return 'Testnet';
    default:
      return 'Unknown';
  }
}

export function getNetworkBadgeClass(network: string | Network): string {
  const normalized = normalizeNetwork(network.toString());
  switch (normalized) {
    case Network.MAINNET:
      return 'bg-green-100 text-green-700 border-green-200';
    case Network.CANARY:
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case Network.TESTNET:
      return 'bg-amber-100 text-amber-700 border-amber-200';
    default:
      return 'bg-red-50 text-red-700 border-red-100';
  }
}

export function getChainIdFromNetwork(network: string | Network): string {
  const normalized = normalizeNetwork(network.toString());
  switch (normalized) {
    case Network.MAINNET:
      return 'mainnet';
    case Network.CANARY:
      return 'canary';
    case Network.TESTNET:
      return 'testnet';
    default:
      return 'testnet';
  }
}
