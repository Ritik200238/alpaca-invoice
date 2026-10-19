import { CreditClaimType } from './types';

export interface ShareableProof {
  txId: string;
  claimType: CreditClaimType;
  threshold: number;
  generatedAt: number;
  expiresAt: number;
}

const PROOF_PREFIX = 'ALPACA-ZKP:';

export function encodeProofCode(proof: ShareableProof): string {
  const json = JSON.stringify({
    t: proof.txId,
    c: proof.claimType,
    h: proof.threshold,
    g: proof.generatedAt,
    e: proof.expiresAt,
  });
  const b64 = typeof window !== 'undefined'
    ? btoa(json)
    : Buffer.from(json).toString('base64');
  return `${PROOF_PREFIX}${b64}`;
}

export function decodeProofCode(code: string): ShareableProof | null {
  try {
    const trimmed = code.trim();

    if (trimmed.startsWith(PROOF_PREFIX)) {
      const b64 = trimmed.slice(PROOF_PREFIX.length);
      const json = typeof window !== 'undefined'
        ? atob(b64)
        : Buffer.from(b64, 'base64').toString();
      const data = JSON.parse(json);
      return {
        txId: data.t,
        claimType: data.c as CreditClaimType,
        threshold: data.h,
        generatedAt: data.g,
        expiresAt: data.e,
      };
    }

    if (trimmed.startsWith('at1')) {
      return null;
    }

    const b64 = trimmed;
    const json = typeof window !== 'undefined'
      ? atob(b64)
      : Buffer.from(b64, 'base64').toString();
    const data = JSON.parse(json);
    if (data.t && typeof data.c === 'number') {
      return {
        txId: data.t,
        claimType: data.c as CreditClaimType,
        threshold: data.h,
        generatedAt: data.g,
        expiresAt: data.e,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function claimTypeLabel(type: CreditClaimType): string {
  const map: Record<CreditClaimType, string> = {
    [CreditClaimType.ON_TIME_RATE]: 'onTimeRate',
    [CreditClaimType.VOLUME]: 'volume',
    [CreditClaimType.AMOUNT_RANGE]: 'amountRange',
    [CreditClaimType.ACCOUNT_AGE]: 'accountAge',
    [CreditClaimType.DISPUTE_RATE]: 'disputeRate',
  };
  return map[type] ?? 'unknown';
}

export function thresholdDisplay(type: CreditClaimType, threshold: number): string {
  switch (type) {
    case CreditClaimType.ON_TIME_RATE:
    case CreditClaimType.DISPUTE_RATE:
      return `≥ ${threshold}%`;
    case CreditClaimType.VOLUME:
      return `≥ ${threshold}`;
    case CreditClaimType.AMOUNT_RANGE:
      return `≥ ${threshold}`;
    case CreditClaimType.ACCOUNT_AGE:
      return `≥ ${threshold}d`;
    default:
      return `≥ ${threshold}`;
  }
}
