# Alpaca Invoice on Midnight: the contract

Private B2B invoicing with Japanese consumption-tax rules, shielded settlement and
selective audit. This is the Midnight port of the Aleo programs under `../../`
(`src/main.leo`, `contracts/zk_invoice_v4_2`). It keeps the product's rules and
restates them in Compact; it does not translate Leo line by line.

Licence: Apache-2.0.

## Where the port stands

The Aleo product has 14 transitions. This package holds the first four, which are the
path an invoice takes from creation to payment, plus the audit authorization.

| Aleo transition | Midnight | State |
|---|---|---|
| `create_invoice` | `createInvoice` | built, tested, run on Preview |
| `pay_invoice_credits_private` | `payInvoiceShielded` | built, tested in process; **not yet run on Preview** (see below) |
| `cancel_invoice` | `cancelInvoice` | built, tested, run on Preview |
| `set_audit_authorization` | `setAuditAuthorization` | built, tested, run on Preview |
| `pay_invoice_usdcx` | `payInvoiceToken` | not built |
| `escrow_payment_credits`, `confirm_delivery`, `timeout_refund`, `arbiter_resolve` | escrow circuits | not built |
| `raise_dispute`, `resolve_dispute`, `submit_evidence` | dispute circuits | not built |
| `generate_credit_proof`, `verify_credit_claim` | credit proof | not built, and redesigned (below) |
| `compute_*`, `make_jct_*`, `get_caller` | pure circuits | built |
| `get_*` and the `getter_*_cache` mappings | none | deleted: they exist only because Aleo cannot read its own state |

`docs/receipts/preview.json` lists every transaction the deploy script ran (the deploy,
`createInvoice`, `setAuditAuthorization` and `cancelInvoice`), with the block, three public
explorer links and the state change read back through the indexer. The interface in
`../../app` is not yet connected to Midnight.

**The payment has not run on Preview, and why.** A payment moves a shielded coin. The faucet
pays unshielded NIGHT, and asking the wallet SDK to shield some from the funded wallet failed
with `Insufficient funds`. The deploy script records that in the receipts file rather than
skipping the step. The payment is covered in process, where the test reads the forward of the
coin to the seller off the runtime's Zswap output, but until a wallet holds shielded NIGHT it
is not evidenced on a public network.

## What the chain can and cannot see

| | |
|---|---|
| Public, per invoice | the invoice identifier, the two parties as **pseudonymous keys**, the status, a commitment to the full terms, eleven per-field commitments and their root, the rule-result digest, a salted tax tag, the registration-number digest, the arbiter key, the audit authorization (hash of the key, field set, expiry) |
| Private | amount, tax, total, due date, currency, line-item and memo digests, order reference, tax groups, payout addresses, every commitment opening |

Two things in that table are weaker than they sound, and they are stated here so a
reader does not have to find them:

* **Party keys are stable.** A party key is a hash of the deployment salt and the user's
  secret, so it does not change between invoices, as an Aleo address did not. An observer
  can see that two invoices share a buyer, and a seller's counters accumulate under one
  key. That is deliberate (a track record needs a stable identity) and it is a real
  difference from Aleo, where the buyer address stayed inside a private record.
* **The registration-number digest is unsalted.** The number is published by the tax
  authority, so a salt would protect nothing.

## Differences from the Aleo program, and why

| Aleo | Midnight | Reason |
|---|---|---|
| private record owned by an address | commitments on the ledger, openings in the parties' own state | Midnight has no records |
| authority = owning the record | authority = a party key derived from a secret the caller proves they hold | never `ownPublicKey()`, which is prover-claimed (`compact/smart-contract-security.mdx`) |
| `tax = net / 10000 * rate` | `tax * 10000 = net * rate` | Compact has no division. The Aleo form divided first and only matched the true tax when the net was a multiple of 10000 |
| `scopes_bitmask: u64` | `Vector<9, Boolean>`, same bit order | Compact has no bitwise operators |
| `BHP256` | `persistentHash` / `persistentCommit` | the compiled contract exports its derivations, so the app computes exactly what the chain computes |
| `current_time`, `paid_at` taken from the caller | still a claim, bounded to within one hour of the block and never ahead of it | the language can compare against block time but cannot read it |
| every field commitment salted with the same nonce | one derived salt per field | handing an auditor one field's salt used to give them the means to test guesses against the rest |
| tax tag = bare hash of the groups | salted commitment | the groups are round amounts and easy to guess |
| payment by `credits.aleo/transfer_private` | the contract receives the coin and forwards it to the seller in the same call | the contract never holds the money (the shape of OpenZeppelin's `ForwarderShielded`) |
| invoice, escrow and dispute in separate programs | one contract | Midnight has no cross-contract calls |
| escrow and dispute arguments trusted from the caller | checked against the ledger | one contract makes that possible |

The five rule bits R1 to R4 (and R5, the hash binding) are **recorded, not enforced**,
exactly as on Aleo: the digest is what an audit compares against, and an invoice that
fails a rule is still an invoice. What is enforced is the list in `assertTermsValid`.

## Credit proof: why it is not a straight port

The Aleo `generate_credit_proof` takes the counts (`total_invoices`, `paid_on_time`, ...)
as free private inputs and proves a claim about them. Nothing ties them to real
invoices, so anyone can prove a perfect record. Porting it as it is would ship a proof
that proves nothing, so it is held back until it can be bound to settled invoices.

## The entry-point budget

A deploy carries one verifier key per entry point and the whole transaction must fit in
one block. Twelve entry points were measured to fit in another project of this size and
fourteen were rejected; thirteen was never tested. The Aleo product is planned at 12 once
the getters are deleted and three escrow transitions merge into one. Alpaca's
`createInvoice` is the largest circuit here (its proving key is 76 MB), so the real
count has to be measured with these circuit sizes, not assumed.

## Run it

Needs Node 22 and, for compiling, the Compact toolchain 0.31.1 (inside WSL2 on Windows).

```
npm install
npm run compact:fast      # compile without proving keys, for the tests
npm test                  # in-process tests against the compiled contract
npm run test:mutation     # break each rule, recompile, require a test to fail
npm run compact           # full compile with proving keys (about six minutes here)
```

To deploy to Midnight Preview you need a wallet funded from the faucet, a local proof
server on port 6300, and the full compile in `build-zk/`:

```
compact compile src/alpaca-invoice.compact build-zk
ALPACA_SEED_FILE=<a file outside this repository> npm run preview:deploy
```

The script refuses a seed that lives inside the repository, never prints it, and writes
`docs/receipts/preview.json`.

## Layout

```
src/alpaca-invoice.compact   the contract
src/witnesses.ts             private state and the four witnesses; the trust boundary
test/                        in-process tests (harness.ts drives the compiled contract)
scripts/mutation.mjs         the mutation sweep
scripts/preview-deploy.ts    deploy to Preview and write the receipts
scripts/lib/wallet.ts        wallet construction, sync and DUST registration
```
