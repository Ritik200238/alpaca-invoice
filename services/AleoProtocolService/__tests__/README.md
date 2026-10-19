# AleoProtocolService Test Plan

## Purpose
Validate RPC/mapping helpers, fee estimation, invoice ID computation, and transaction verification logic without hitting real network side effects.

## Files
- `AleoProtocolService.test.ts` — unit tests with mocked `@provablehq/sdk`.

## Commands
```bash
npm test AleoProtocolService
npm test -- --watch
npm test -- --coverage
```

## Test Matrix
### Constructor & Network
- Defaults to TestnetBeta.
- Correct base URLs for MainnetBeta/Testnet/TestnetBeta.

### `getPublicBalance`
- Parses `u64`, quoted strings, empty, null, large values.
- 404/null → 0n; other errors → warn + 0n.

### `getLatestBlockHeight`
- Happy path.
- Network failure → ProtocolServiceError(NODE_CONNECTION_FAILED).
- Invalid height (<0) → ProtocolServiceError.

### `estimateExecutionFee`
- Uses ProgramManager.buildAuthorization + estimateFeeForAuthorization.
- Adds 20% buffer; large/zero fees.
- build/estimate failure → fallback 250,000 microcredits with warning.
- ProtocolServiceError is rethrown (no fallback).
- Verifies program/function/inputs wiring.

### `verifyRecordOnChain`
- Confirms transaction existence.
- Optional checks: program match, function match, outputs count.
- Supports multiple tx shapes: `execution.transitions`, `transitions`, `outputs`.
- Handles missing tx, empty transitions, missing outputs, network errors.

### `computeInvoiceIdOffline`
- Runs local `compute_invoice_id`; returns field string.
- Empty outputs → ProtocolServiceError(INVALID_RECORD).

### Mapping helpers & cache
- `getInvoiceHash`, `getInvoiceStatus`, `getInvoiceCount` return parsed values.
- Status/hash caches respect TTL (single fetch within window).

## Pending / Not Implemented
- `fetchRawRecords`, `broadcastTransaction`, `waitForTransaction` (future work).

## Error Conventions
- All RPC errors normalized to ProtocolServiceError with specific codes.
- Balance query treats 404 as empty; other failures warn.
- Fee fallback used only for non-ProtocolServiceError failures.

## Coverage Goals
- Lines >95%, branches >90%, functions 100%.
