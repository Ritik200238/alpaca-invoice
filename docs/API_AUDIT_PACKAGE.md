# Audit Package API (Envelope v2.2.0)

Latest format produced by `AuditService.generate` and consumed by `/audit` validator and `tests/validate_audit_package.mjs`.

## Envelope schema

```jsonc
{
  "version": "2.2.0",
  "audit_type": "selective_disclosure",
  "network": "aleo_testnetbeta",
  "contract": "zk_invoice_v3_1.aleo",
  "context": {
    "invoice_id": "<field>",
    "audit_key_hash": "<field>",
    "expires_at": 1700000000
  },
  "encryption": {
    "algorithm": "AES-256-GCM",
    "iv": "<base64>",
    "auth_tag": "<base64>",
    "ciphertext": "<base64>"
  }
}
```

The ciphertext decrypts (with the audit key) to a payload containing:
- `invoiceId`, `invoiceHash`, `nonce`
- `data` (selectively disclosed fields) + `hidden_masks`
- `commitments` (per-field commitments + `root`)
- `integrity` `{ cipherHash, signature }`

## Scopes bitmask (used by set_audit_authorization)

| Bit | Field        |
|-----|--------------|
| 1   | amount       |
| 2   | tax_amount   |
| 3   | due_date     |
| 4   | buyer        |
| 5   | seller       |
| 6   | currency     |
| 7   | items_hash   |
| 8   | memo_hash    |
| 9   | order_id     |

`scopes_bitmask` = OR of `1 << (bit-1)` for each disclosed field.

## Generation rules (frontend)
- Requires a connected wallet with `signMessage`.
- If the local invoice has a `nonce`, full package is generated locally.
- If the invoice was synced from chain **and lacks a nonce**, generation switches to chain-anchored mode and requires `commitment_root` (and ideally `field_commitments`) to exist on chain. Otherwise you’ll see:  
  `Cannot generate chain-anchored audit package: no commitment_root on chain for this invoice_id.`
- “Submit On-chain Authorization” calls `set_audit_authorization` with `audit_key_hash`, `scopes_bitmask`, and expiry. It requires the seller wallet and an **unspent** invoice record; spent records will make the wallet return “Unspent record not found”.

## Verification phases (validator)
1) Expiry, decrypt, cipher hash, signature presence  
2) `invoice_hash` matches `invoice_registry`  
3) `audit_authorization` exists; `audit_key_hash` & scopes match on-chain  
4) Chain anchors present (invoice hash, commitment root, rules_result, field_commitments)  
5) Recompute commitments & rules (R1–R5) and compare to chain caches

## Offline validation

```bash
node tests/validate_audit_package.mjs envelope.json <audit_key_hex>
```

Outputs PASS/FAIL, decrypted payload, and chain verification summary (when reachable).

## Compatibility
- Version fixed at `2.2.0` for this codebase.
- Contract pinned to `zk_invoice_v3_1.aleo` on testnetbeta.
- Legacy packages (v2.0) are not emitted by current UI; validator remains backward-compatible with v2 envelopes when `chainVerifiable` is present.
