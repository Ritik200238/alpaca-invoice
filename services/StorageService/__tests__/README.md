# StorageService Test Plan

## Purpose
Guarantee correctness of the IndexedDB wrapper for storing invoices, receipts, and metadata.

## Files
- `StorageService.test.ts`

## Commands
```bash
npm test StorageService
npm test -- --watch
npm test -- --coverage
```

## Test Matrix
- Table creation and upgrade.
- Add/Get/GetAll/Update/Delete for single records.
- Bulk add/delete operations.
- Serialization/Deserialization of `Date`, `BigInt`, nested objects.
- Id/key extraction rules (prefer `id`, fallback to `key`).
- Cross-table isolation with same keys.
- Error handling when IndexedDB is unavailable (server-side).
- Integration lifecycle: create → read → update → verify → delete.

## Mocks
- IndexedDB and `window` are mocked in Vitest environment.

## Coverage Goals
- Lines/branches/functions >90%.
