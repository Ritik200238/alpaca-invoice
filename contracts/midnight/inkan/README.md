# Inkan: the contract

Private B2B invoicing on Midnight, with Japanese consumption-tax rules checked inside the
proof, shielded settlement and selective audit. Licence: Apache-2.0.

## Where it stands

| Feature | Circuit | State |
|---|---|---|
| Create an invoice | `createInvoice` | built, tested, run on Preview |
| Pay in shielded NIGHT | `payInvoiceShielded` | built, tested in process; **not yet run on Preview** (below) |
| Cancel | `cancelInvoice` | built, tested, run on Preview |
| Authorise an auditor | `setAuditAuthorization` | built, tested, run on Preview |
| Pay in a test stablecoin | `payInvoiceToken` | not built |
| Escrow: fund, release, refund, arbiter decision | escrow circuits | not built |
| Disputes: raise, resolve, submit evidence | dispute circuits | not built |
| Credit proof | `claimReceipt`, `generateCreditProof` | not built (below) |
| Identifiers, invoice hash, commitments, tax tag | pure circuits | built |

`docs/receipts/preview.json` lists every transaction run on Midnight Preview (the deploy,
`createInvoice`, `setAuditAuthorization` and `cancelInvoice`), with the block, three public
explorer links and the state change read back through the indexer.

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

Two things in that table are weaker than they sound:

* **Party keys are stable.** A party key is a hash of the deployment salt and the user's
  secret, so it does not change between invoices. An observer can see that two invoices share a
  buyer, and a seller's counters accumulate under one key. That is deliberate: a track record
  needs a stable identity.
* **The registration-number digest is unsalted.** The number is published by the tax
  authority, so a salt would protect nothing.

## Design decisions, and why

| Decision | Reason |
|---|---|
| Commitments on the ledger, openings in the parties' own state, supplied as witnesses | Midnight keeps private data off the chain; a circuit sees it only as a witness |
| Authority is a party key derived from a secret the caller proves they hold | never `ownPublicKey()`, which is prover-claimed (`compact/smart-contract-security.mdx`) |
| The tax rule is checked as `tax * 10000 = net * rate` | Compact has no division; the product is exact for every amount |
| The audit scope is a nine-slot `Vector<9, Boolean>` | Compact has no bitwise operators; the off-chain bitmask keeps the same bit order |
| `persistentHash` / `persistentCommit`, exported as pure circuits | the application computes exactly what the chain computes |
| Every claimed time is bounded to within one hour of the block and never ahead of it | the language can compare against block time but cannot read it |
| One derived salt per field commitment | disclosing one field to an auditor must not help test guesses against the rest |
| The tax tag is a salted commitment | the tax groups are round amounts and easy to guess |
| Payment: the contract receives the coin and forwards it to the seller in the same call | the contract never holds the money (the shape of OpenZeppelin's `ForwarderShielded`) |
| Invoice, escrow, disputes and credit proof in one contract | Midnight has no cross-contract calls, and escrow and disputes must check the invoice they act on |

The rule bits R1 to R4 (and R5, the hash binding) are **recorded, not enforced**: the digest
is what an audit compares against, and an invoice that fails a rule is still an invoice. What
is enforced is the list in `assertTermsValid`.

## Credit proof

A credit proof whose counts (`total_invoices`, `paid_on_time`, ...) are free private inputs
would let anyone prove a perfect record. So the credit proof is held back until it can be bound
to settled invoices: a seller claims each paid invoice once (a nullifier stops it being counted
twice) into a commitment only they can open, and proves a threshold over that.

## The entry-point budget

A deploy carries one verifier key per entry point and the whole transaction must fit in one
block. Twelve entry points were measured to fit in another project of this size and fourteen
were rejected; thirteen was never tested. The full feature set is planned at 12. The 4-circuit
deploy here used 23.6% of the block's write budget. `createInvoice` is the largest circuit (its
proving key is 76 MB), so the real count has to be measured with these circuit sizes.

## Run it

Needs Node 22 and, for compiling, the Compact toolchain 0.31.1 (inside WSL2 on Windows).

```
npm install
npm run compact:fast      # compile without proving keys, for the tests
npm test                  # in-process tests against the compiled contract
npm run test:mutation     # break each rule, recompile, require a test to fail
npm run compact           # full compile with proving keys (about six minutes here)
```

To deploy to Midnight Preview you need a wallet funded from the faucet, a local proof server on
port 6300, and the full compile in `build-zk/`:

```
compact compile src/inkan.compact build-zk
INKAN_SEED_FILE=<a file outside this repository> npm run preview:deploy
```

The script refuses a seed that lives inside the repository, never prints it, and writes
`docs/receipts/preview.json`. `scripts/dry-run-call.ts` builds a call against a deployed
contract with no wallet and stops before proving, for checking changes without a wallet sync.

## Layout

```
src/inkan.compact            the contract
src/witnesses.ts             private state and the four witnesses; the trust boundary
test/                        in-process tests (harness.ts drives the compiled contract)
scripts/mutation.mjs         the mutation sweep
scripts/preview-deploy.ts    deploy to Preview, then run scripts/flow.ts and write the receipts
scripts/lib/wallet.ts        wallet construction, sync and DUST registration
```

The label strings inside the circuits (`alpaca:party:v1` and the like) and the assertion
messages keep their original prefix: they feed the circuit's hashes, and changing them changes
the contract, so they change with the next deploy rather than leaving this source out of step
with the one on Preview.
