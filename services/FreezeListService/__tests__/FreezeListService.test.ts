import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FreezeListError, type MerkleProofData } from '../IFreezeListService';

vi.mock('@/lib/contract', () => ({
  USDCX_PROGRAM_ID: 'test_usdcx_stablecoin.aleo',
}));

const { FreezeListService, serializeMerkleProofsForContract } = await import('../FreezeListServiceImpl');

const PAYER = 'aleo1abc123456789012345678901234567890123456789012345678901234';
const PAYEE = 'aleo1def123456789012345678901234567890123456789012345678901234';

describe('FreezeListService', () => {
  let service: InstanceType<typeof FreezeListService>;

  beforeEach(() => {
    service = new FreezeListService('https://api.example.com/v1');
    vi.restoreAllMocks();
  });

  describe('isAddressFrozen', () => {
    it('returns false when fetch fails (address not in mapping)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('', { status: 404 })
      );
      const frozen = await service.isAddressFrozen(PAYER);
      expect(frozen).toBe(false);
    });

    it('returns true when mapping returns "true"', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('"true"', { status: 200 })
      );
      const frozen = await service.isAddressFrozen(PAYER);
      expect(frozen).toBe(true);
    });

    it('returns false when mapping returns other value', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('"false"', { status: 200 })
      );
      const frozen = await service.isAddressFrozen(PAYER);
      expect(frozen).toBe(false);
    });
  });

  describe('getMerkleProofs', () => {
    it('returns proofs with leaf_index=1 (Case 2: both at max_index) when neither address is frozen', async () => {
      vi.spyOn(service, 'isAddressFrozen').mockResolvedValue(false);

      const [proof0, proof1] = await service.getMerkleProofs(PAYER, PAYEE);

      expect(proof0.siblings).toHaveLength(16);
      expect(proof0.siblings.every((s: string) => s === '0field')).toBe(true);
      expect(proof0.leaf_index).toBe(1);

      expect(proof1.siblings).toHaveLength(16);
      expect(proof1.siblings.every((s: string) => s === '0field')).toBe(true);
      expect(proof1.leaf_index).toBe(1);
    });

    it('both proof indices are equal (Case 2: same max_index for depth-1 tree)', async () => {
      vi.spyOn(service, 'isAddressFrozen').mockResolvedValue(false);

      const [proof0, proof1] = await service.getMerkleProofs(PAYER, PAYEE);

      expect(proof0.leaf_index).toBe(proof1.leaf_index);
      expect(proof0.leaf_index).toBe(1);
    });

    it('throws ADDRESS_FROZEN when payer is frozen', async () => {
      vi.spyOn(service, 'isAddressFrozen')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await expect(service.getMerkleProofs(PAYER, PAYEE))
        .rejects.toThrow('freeze list');
    });

    it('throws ADDRESS_FROZEN when payee is frozen', async () => {
      vi.spyOn(service, 'isAddressFrozen')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      await expect(service.getMerkleProofs(PAYER, PAYEE))
        .rejects.toThrow('freeze list');
    });
  });

  describe('serializeMerkleProofsForContract', () => {
    it('produces valid Leo [MerkleProof; 2] string', () => {
      const proofs: [MerkleProofData, MerkleProofData] = [
        { siblings: Array(16).fill('0field'), leaf_index: 1 },
        { siblings: Array(16).fill('0field'), leaf_index: 1 },
      ];

      const result = serializeMerkleProofsForContract(proofs);

      expect(result).toContain('siblings:');
      expect(result).toContain('leaf_index: 1u32');
      expect(result.startsWith('[')).toBe(true);
      expect(result.endsWith(']')).toBe(true);
    });

    it('contains exactly 16 sibling values per proof', () => {
      const proofs: [MerkleProofData, MerkleProofData] = [
        { siblings: Array(16).fill('0field'), leaf_index: 1 },
        { siblings: Array(16).fill('0field'), leaf_index: 1 },
      ];

      const result = serializeMerkleProofsForContract(proofs);

      const siblingMatches = result.match(/siblings: \[([^\]]+)\]/g);
      expect(siblingMatches).toHaveLength(2);

      for (const match of siblingMatches!) {
        const fields = match.match(/0field/g);
        expect(fields).toHaveLength(16);
      }
    });

    it('correctly formats non-zero siblings', () => {
      const proofs: [MerkleProofData, MerkleProofData] = [
        {
          siblings: [
            '123field', '456field',
            ...Array(14).fill('0field'),
          ],
          leaf_index: 5,
        },
        {
          siblings: [
            '789field', '101field',
            ...Array(14).fill('0field'),
          ],
          leaf_index: 6,
        },
      ];

      const result = serializeMerkleProofsForContract(proofs);

      expect(result).toContain('123field');
      expect(result).toContain('456field');
      expect(result).toContain('leaf_index: 5u32');
      expect(result).toContain('789field');
      expect(result).toContain('leaf_index: 6u32');
    });
  });
});
