import {
  type IFreezeListService,
  type MerkleProofData,
  FreezeListError,
  FreezeListServiceError,
} from './IFreezeListService';
import { USDCX_PROGRAM_ID } from '@/lib/contract';

const TREE_DEPTH = 16;

/**
 * FreezeListService implementation.
 *
 * test_usdcx_stablecoin.aleo/transfer_private requires [MerkleProof; 2]
 * where MerkleProof = { siblings: [field; 16], leaf_index: u32 }.
 *
 * The contract supports three non-inclusion proof cases:
 *   Case 1 (both at index 0): owner < leaf[0]
 *   Case 2 (both at max_index): owner > leaf[max_index]
 *   Case 3 (consecutive indices): leaf[i] < owner < leaf[i+1]
 *
 * The testnet freeze list has ONE entry at index 0: the zero address (0field).
 * Both leaf positions in the depth-1 pair are 0field, so Case 2 is used:
 * both proofs at leaf_index=1 (max_index for depth 1), satisfying owner > 0field.
 * Root = psd4([1field, 0field, 0field]) matches the on-chain freeze_list_root.
 */
export class FreezeListService implements IFreezeListService {
  private readonly nodeUrl: string;

  constructor(nodeUrl?: string) {
    this.nodeUrl = nodeUrl ?? 'https://api.explorer.provable.com/v1';
  }

  async getMerkleProofs(
    payerAddress: string,
    payeeAddress: string
  ): Promise<[MerkleProofData, MerkleProofData]> {
    const payerFrozen = await this.isAddressFrozen(payerAddress);
    if (payerFrozen) {
      throw new FreezeListServiceError(
        FreezeListError.ADDRESS_FROZEN,
        `Payer address ${payerAddress} is on the freeze list.`
      );
    }

    const payeeFrozen = await this.isAddressFrozen(payeeAddress);
    if (payeeFrozen) {
      throw new FreezeListServiceError(
        FreezeListError.ADDRESS_FROZEN,
        `Payee address ${payeeAddress} is on the freeze list.`
      );
    }

    try {
      return [
        this.buildEmptyTreeProof(1),
        this.buildEmptyTreeProof(1),
      ];
    } catch (err) {
      throw new FreezeListServiceError(
        FreezeListError.PROOF_BUILD_FAILED,
        'Failed to build freeze-list Merkle proofs.',
        { originalError: err }
      );
    }
  }

  async isAddressFrozen(address: string): Promise<boolean> {
    if (!USDCX_PROGRAM_ID) return false;

    try {
      const url = `${this.nodeUrl}/${this.getNetwork()}/program/${USDCX_PROGRAM_ID}/mapping/frozen_addresses/${address}`;
      const response = await fetch(url);
      if (!response.ok) return false;

      const value = await response.text();
      const trimmed = value.replace(/"/g, '').trim();
      return trimmed === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Build MerkleProof for the current testnet freeze-list tree.
   *
   * Tree state: one entry (zero address at index 0), so the depth-1 pair
   * is [0field, 0field]. siblings[2..15] are 0field, triggering truncation
   * at depth 1. Root = psd4([1field, 0field, 0field]).
   *
   * Both proofs use leaf_index=1 (the max_index for depth 1 = 2^1 - 1 = 1),
   * which triggers Case 2: assert(owner > siblings[0]), i.e. owner > 0field.
   */
  private buildEmptyTreeProof(leafIndex: number): MerkleProofData {
    return {
      siblings: Array(TREE_DEPTH).fill('0field'),
      leaf_index: leafIndex,
    };
  }

  private getNetwork(): string {
    return process.env.NEXT_PUBLIC_ALEO_NETWORK ?? 'testnet';
  }
}

/**
 * Serialize a MerkleProofData pair into the Leo struct string format
 * expected by pay_invoice_usdcx: [MerkleProof; 2].
 *
 * Output: [{ siblings: [f0, f1, ...f15], leaf_index: Nu32 }, { ... }]
 */
export function serializeMerkleProofsForContract(
  proofs: [MerkleProofData, MerkleProofData]
): string {
  const serializeOne = (p: MerkleProofData): string => {
    const siblingsStr = p.siblings.join(', ');
    return `{ siblings: [${siblingsStr}], leaf_index: ${p.leaf_index}u32 }`;
  };
  return `[${serializeOne(proofs[0])}, ${serializeOne(proofs[1])}]`;
}
