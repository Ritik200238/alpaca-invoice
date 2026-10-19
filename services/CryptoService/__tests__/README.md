# CryptoService Test Plan

## Purpose
Verify hashing, encryption/decryption, record parsing, and integrity checks for invoice data.

## Files
- `CryptoService.test.ts`

## Commands
```bash
npm test CryptoService
npm test -- --watch
npm test -- --coverage
```

## Test Matrix
- `computeInvoiceHash`
  - Deterministic output for identical input.
  - Different inputs → different hashes.
  - Field-order agnostic (sorted JSON).
  - Values constrained to Aleo field modulus.
- Encryption/Decryption
  - Round-trip with master key.
  - Error paths for bad key / corrupted payload.
- Record parsing & integrity
  - Cleans type suffixes (`u8`, visibility markers).
  - Detects tampering via hash mismatch.

## Environment Notes
- Uses WebCrypto (polyfilled in Vitest).
- No network or wallet dependencies; all pure functions/mocks.
