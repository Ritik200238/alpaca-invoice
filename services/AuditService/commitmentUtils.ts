/**
 * Commitment utilities using Aleo BHP hash (via @provablehq/sdk).
 * Matches zk_invoice_v3_1.aleo contract:
 * - commit_field(val, salt, tag) = BHP256::hash_to_field(FieldCommitInput { val, salt, tag })
 * - commitment_root = BHP256::hash_to_field(commitments)
 */

import { BHP256, Field, Address } from '@provablehq/sdk';
import type { AleoField } from '@/lib/types';

/** Field bit size in Aleo (toBitsLe returns 256 bits for canonical representation) */
const FIELD_BITS = 256;

/**
 * Contract-aligned field order for commitment root. Matches main.leo FieldCommitments struct.
 * Wave 3: includes tax_tag (tag=10) and jct_registration (tag=11).
 */
export const COMMITMENT_FIELD_ORDER = [
  'amount',
  'tax_amount',
  'due_date',
  'buyer',
  'seller',
  'currency',
  'items_hash',
  'memo_hash',
  'order_id',
  'tax_tag',
  'jct_registration'
] as const;

export type CommitmentFieldKey = (typeof COMMITMENT_FIELD_ORDER)[number];

/**
 * Convert string (field or address) to Field for hashing.
 * Addresses (aleo1...) are converted via Address.to_field().
 */
function toField(value: string): Field {
  if (value.startsWith('aleo1')) {
    const addr = Address.from_string(value);
    const fields = addr.toFields();
    return fields[0];
  }
  return Field.fromString(value.endsWith('field') ? value : `${value}field`);
}

/**
 * Convert AleoField/address string to little-endian bits for BHP hashing.
 * Uses Provable SDK Field.toBitsLe() for canonical Aleo serialization.
 */
function fieldToBits(value: string): boolean[] {
  const f = toField(value);
  return f.toBitsLe();
}

/**
 * Pad bits to target length (for BHP chunk alignment).
 * Aleo fields may be 254 bits; pad to FIELD_BITS for proper struct serialization.
 */
function padBits(bits: boolean[], length: number): boolean[] {
  if (bits.length >= length) return bits.slice(0, length);
  return [...bits, ...new Array(length - bits.length).fill(false)];
}

/**
 * Compute commit_field(val, salt, tag) matching Leo:
 *   let input = FieldCommitInput { val, salt, tag };
 *   return BHP256::hash_to_field(input);
 *
 * FieldCommitInput has 3 fields → 3×256 = 768 bits → BHP256 (hash_to_field).
 * The "256" is the BHP window config, not an input size limit.
 */
export function commitField(val: AleoField | string, salt: AleoField, tag: AleoField): AleoField {
  const valBits = fieldToBits(typeof val === 'string' ? val : String(val));
  const saltBits = fieldToBits(salt);
  const tagBits = fieldToBits(tag);
  const bits = [
    ...padBits(valBits, FIELD_BITS),
    ...padBits(saltBits, FIELD_BITS),
    ...padBits(tagBits, FIELD_BITS)
  ];
  const bhp = new BHP256();
  const result = bhp.hash(bits);
  const s = result.toString();
  return (s.endsWith('field') ? s : `${s}field`) as AleoField;
}

/**
 * Compute commitment root from FieldCommitments struct.
 * Contract uses BHP256::hash_to_field(commitments) where commitments is a struct
 * with 9 field elements → 9×256 = 2304 bits → BHP256 (hash_to_field).
 */
export function computeCommitmentRoot(fields: Record<string, AleoField>): AleoField {
  const allBits: boolean[] = [];
  for (const key of COMMITMENT_FIELD_ORDER) {
    const v = fields[key];
    if (v !== undefined) {
      allBits.push(...padBits(fieldToBits(v), FIELD_BITS));
    }
  }
  const bhp = new BHP256();
  const result = bhp.hash(allBits);
  const s = result.toString();
  return (s.endsWith('field') ? s : `${s}field`) as AleoField;
}

/**
 * Compute rules_result field matching Leo compute_rules_result(RulesBits).
 * Contract: BHP256::hash_to_field(RulesBits { r1, r2, r3, r4, r5 }).
 * Aleo bool is 1 bit; 5 bits total, padded to 256 for BHP256 input.
 */
export function computeRulesResultField(
  r1: boolean,
  r2: boolean,
  r3: boolean,
  r4: boolean,
  r5: boolean
): AleoField {
  const bits = [...[r1, r2, r3, r4, r5], ...new Array(FIELD_BITS - 5).fill(false)];
  const bhp = new BHP256();
  const result = bhp.hash(bits);
  const s = result.toString();
  return (s.endsWith('field') ? s : `${s}field`) as AleoField;
}
