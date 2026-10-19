import { createServiceError } from '@/lib/service-errors';

export enum FreezeListError {
  TREE_FETCH_FAILED = 'TREE_FETCH_FAILED',
  PROOF_BUILD_FAILED = 'PROOF_BUILD_FAILED',
  ADDRESS_FROZEN = 'ADDRESS_FROZEN'
}

export const FreezeListServiceError = createServiceError<FreezeListError>('FreezeListService');
export type FreezeListServiceError = InstanceType<typeof FreezeListServiceError>;

export interface MerkleProofData {
  siblings: string[];
  leaf_index: number;
}

/**
 * Service for fetching and constructing freeze-list MerkleProofs
 * required by test_usdcx_stablecoin.aleo/transfer_private.
 */
export interface IFreezeListService {
  /**
   * Build MerkleProof pair for payer and payee addresses.
   * Each proof attests that the address is NOT on the freeze list.
   */
  getMerkleProofs(
    payerAddress: string,
    payeeAddress: string
  ): Promise<[MerkleProofData, MerkleProofData]>;

  /**
   * Check whether a single address is frozen.
   */
  isAddressFrozen(address: string): Promise<boolean>;
}
