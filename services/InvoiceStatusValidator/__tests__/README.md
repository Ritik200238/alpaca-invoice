# InvoiceStatusValidator Test Plan

## Purpose
Determine whether chain records should be accepted as confirmation for create/pay/cancel flows.

## Files
- `InvoiceStatusValidatorImpl.test.ts` — unit tests.

## Commands
```bash
npm test services/InvoiceStatusValidator
npm test InvoiceStatusValidatorImpl.test.ts
```

## Test Matrix
1) Null record → `shouldConfirm: false`.  
2) PaymentRecord → always confirm, action ignored.  
3) Cancel action → confirm only when status = CANCELLED; otherwise wait.  
4) Pay action → confirm only when status = PAID; otherwise wait.  
5) Create action → always confirm (presence means created).  
6) No action → confirm if status matches original PENDING; otherwise confirm on status change.  
7) Edge cases: EXPIRED, numeric status strings, u8 suffix cleanup.  
8) Integration flows: create→cancel; create→pay with PaymentRecord.

## Mock Notes
- `cleanAleoNumber` mocked to strip numeric suffixes where needed.

## Coverage Goals
- Lines/branches/functions >90%.
