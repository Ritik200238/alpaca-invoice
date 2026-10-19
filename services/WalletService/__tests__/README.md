# WalletService Test Plan

## Purpose
Ensure wallet interactions behave correctly across happy paths, edge cases, and failure scenarios without relying on real wallets or chain calls.

## Files
- `WalletService.test.ts` — unit tests with mocked wallet adapter.

## Commands
```bash
npm test WalletService
npm test -- --watch
npm test -- --coverage
```

## Test Matrix
### 1) Constructor
- Instantiates service with provided adapter.

### 2) `connect`
- Success path (wallet resolves).
- Missing address after connect.
- User rejection (error message contains reject/denied).
- Other errors propagate as friendly UNAUTHORIZED.

### 3) `disconnect`
- Success.
- Failure is logged, not thrown.

### 4) `getPrivateBalance`
- Sums unspent `credits.aleo` records.
- Filters spent=true.
- Falls back to `requestRecordPlaintexts` when `requestRecords` missing.
- Handles missing support → returns 0n.
- Empty records → 0n.
- Complex sums with mixed formats (`u64.private`, plain numbers).
- Not connected → throws UNAUTHORIZED.

### 5) `getFeeRecords`
- Picks smallest sufficient record.
- Insufficient balance → error.
- Not connected / missing methods → error.

### 6) `signMessage`
- Success (Uint8Array round‑trip).
- Not connected → error.
- Empty message → error.
- Unsupported method → error.
- Empty signature → error.
- User rejection → USER_REJECTED.

### 7) `requestTransaction`
- Success with defaults.
- Custom `programId` / `fee` / `chainId`.
- Not connected, wallet missing, method unsupported.
- Empty result → error.
- User rejection / network mismatch.
- Handles multi-input transitions.

### 8) Integration smoke
- Connect → signMessage → disconnect.
- Balance calculation under mixed records.

## Mock Strategy
- Vitest `vi.fn()` for all adapter methods.
- Reset mocks in `beforeEach`.
- Simulate user rejection via message/code and ensure mapped to USER_REJECTED.

## Error Taxonomy
- `UNAUTHORIZED`, `NOT_INSTALLED`, `USER_REJECTED`, `NETWORK_MISMATCH` with human-readable messages.

## Coverage Goals
- Lines >95%, branches >90%, functions 100%.
