# Inkan

**Invoices settle on-chain. Their terms never do.**

Private B2B invoicing on [Midnight](https://midnight.network), with Japanese consumption-tax
rules checked inside the proof, shielded settlement, and selective audit.

An *inkan* is the personal seal a Japanese business stamps on an invoice. This one seals the
terms: the chain holds commitments to them, and the parties hold the openings.

## Where it stands

| | |
|---|---|
| **Contract** | [`contracts/midnight/inkan`](contracts/midnight/inkan): 4 entry points (create, pay, cancel, audit authorization), compiled with Compact 0.31.1 with real proving and verifying keys for all four circuits |
| **Tests** | 88 in-process tests against the compiled contract: `npm test` in the contract folder |
| **Mutation sweep** | 45 of 45 mutants caught, plus one provably unreachable case that is named, not counted: `npm run test:mutation` |
| **On Midnight Preview** | contract `15efb99ca21bb255b0f12a1de56c0519d3f98e95c4e1e4f341aea8fa0f4ec2a8`. Four transactions, each `SUCCESS` on the public indexer and listed with explorer links in [`docs/receipts/preview.json`](docs/receipts/preview.json): the [deploy](https://explorer.1am.xyz/tx/bbaa1cd4869986b5ca192a72b96cb91f171de8398b4e814cd66df16041af00b3?network=preview) (block 1,364,749), [`createInvoice`](https://explorer.1am.xyz/tx/b3349368d698aebb226fc61ab17aee2a6a775bed3055eb89cf616b88e262eebe?network=preview) (1,365,672), `setAuditAuthorization` (1,365,677) and `cancelInvoice` (1,365,704). After each, the state was read back through the indexer and searched for the invoice figures; none appeared |
| **Not yet on Preview** | the payment. `payInvoiceShielded` is tested in process, but a payment moves a *shielded* coin and the funded wallet holds only unshielded NIGHT from the faucet. The wallet SDK would not shield it (`Insufficient funds`), and the run recorded that instead of skipping the step quietly |
| **Interface** | Next.js, restyled; not yet connected to the Midnight contract |
| **Next** | escrow, disputes, the stablecoin payment path, a credit proof that counts only real settled invoices, and the interface through the Lace wallet |
| **Video** | [`docs/inkan-demo.mp4`](docs/inkan-demo.mp4), 2 min 49 s |
| **Deck** | [`docs/inkan-deck.pdf`](docs/inkan-deck.pdf), 12 slides; built from the same evidence files by `python docs/deck/build.py` |

## What the chain can and cannot see

| | |
|---|---|
| Public, per invoice | the invoice identifier, the two parties as pseudonymous keys, the status, a commitment to the full terms, eleven per-field commitments and their root, the rule-result digest, a salted tax tag, the registration-number digest, the arbiter key, and the audit authorization (a hash of the key, the field set, the expiry) |
| Private | amount, tax, total, due date, currency, line-item and memo digests, order reference, tax groups, payout addresses, every commitment opening |

## How it works

- **Create.** The seller writes an invoice. The terms stay in the seller's private state and reach
  the circuit as a witness. The contract checks them and records only commitments. A qualified
  (JCT) invoice carries two rate groups, 10% and 8%, and the contract refuses groups whose tax is
  not net times rate, or that do not add up to the total.
- **Pay.** The buyer pays in shielded NIGHT inside the transaction that marks the invoice paid.
  The contract receives the coin and forwards it to the seller in the same call, so it never
  holds the money. The payment must equal the invoice total, go to the seller the invoice names,
  and come with terms that open the commitment on the ledger.
- **Cancel.** The seller can cancel a pending invoice; a paid one cannot be retracted.
- **Audit.** The seller authorises an auditor to see chosen fields of one invoice until a date.
  Each field has its own salt, so disclosing one field does not help test guesses against the rest.

The design, every decision and why, and how to run it are in the
[contract README](contracts/midnight/inkan/README.md).

## Run it

```
cd contracts/midnight/inkan
npm install
npm run compact:fast      # compile without proving keys, for the tests
npm test                  # 88 tests against the compiled contract
npm run test:mutation     # break each rule, recompile, require a test to fail
```

Deploying to Preview needs the Compact toolchain 0.31.1, a local proof server and a funded
wallet; see the contract README.

## Licence

Apache-2.0 ([LICENSE](LICENSE), [NOTICE](NOTICE)).
