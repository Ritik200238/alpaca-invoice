// Mutation sweep: revert each security rule, recompile, and require a test to fail.
//
// SPDX-License-Identifier: Apache-2.0
//
// A passing suite is evidence about the inputs it was given and nothing else. The
// only way to learn whether a test can fail is to make the thing it guards wrong
// and look. Each mutant below removes or weakens one rule in the contract (or in
// the witness boundary), recompiles with --skip-zk (seconds, not minutes), and
// runs the suite. A mutant the suite does not catch is a hole in the tests, and
// the script exits non-zero.
//
// A pattern that no longer matches the source is a harness error, not a pass: the
// script stops rather than reporting a mutant it never applied.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT = resolve(root, 'src/alpaca-invoice.compact');
const WITNESSES = resolve(root, 'src/witnesses.ts');

const toWsl = (p) => p.replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`).replaceAll('\\', '/');

const MUTANTS = [
  // ---- createInvoice
  { name: 'create: allow a seller to invoice themselves',
    find: '  assert(disclose(sellerKey) != buyer, "alpaca: seller and buyer must differ");\n', replace: '' },
  { name: 'create: allow a zero amount',
    find: '  assert(terms.amount > 0, "alpaca: amount must be positive");\n', replace: '' },
  { name: 'create: drop the amount cap',
    find: '  assert(terms.amount <= MAX_INVOICE_AMOUNT(), "alpaca: amount exceeds the maximum");\n', replace: '' },
  { name: 'create: let total differ from amount plus tax',
    find: '  assert(terms.amount + terms.taxAmount == terms.totalAmount,\n         "alpaca: total must equal amount plus tax");\n', replace: '' },
  { name: 'create: allow a due date in the past',
    find: '  assert(terms.dueDate >= now, "alpaca: due date is in the past");\n', replace: '' },
  { name: 'create: allow an invoice id to be reused',
    find: '  assert(!invoiceRegistry.member(id), "alpaca: invoice id already used");\n', replace: '' },
  { name: 'tax: skip the check on group A',
    find: '    assert(taxGroupValid(terms.taxGroups.groupA), "alpaca: tax group A is inconsistent");\n', replace: '' },
  { name: 'tax: skip the check on group B',
    find: '    assert(taxGroupValid(terms.taxGroups.groupB), "alpaca: tax group B is inconsistent");\n', replace: '' },
  { name: 'tax: skip the groups-sum-to-total check',
    find: `    assert((terms.taxGroups.groupA.netSum + terms.taxGroups.groupA.taxSum) +
           (terms.taxGroups.groupB.netSum + terms.taxGroups.groupB.taxSum) == terms.totalAmount,
           "alpaca: tax groups do not add up to the total");\n`, replace: '' },
  { name: 'tax: accept any tax for a used rate slot',
    find: ': (g.rateBps <= 10000 && g.taxSum * 10000 == g.netSum * g.rateBps);', replace: ': (g.rateBps <= 10000);' },
  { name: 'tax: allow a rate above 100%',
    find: ': (g.rateBps <= 10000 && g.taxSum * 10000 == g.netSum * g.rateBps);', replace: ': (g.taxSum * 10000 == g.netSum * g.rateBps);' },
  { name: 'tax: let an unused slot carry a value',
    find: '? (g.netSum == 0 && g.taxSum == 0)', replace: '? true' },
  { name: 'tax: validate the groups of an invoice that is not qualified',
    find: '  if (terms.isJct) {\n    assert(taxGroupValid', replace: '  if (true) {\n    assert(taxGroupValid' },
  { name: 'rules: record R1 as always true',
    find: 'const r1 = terms.taxAmount * 10000 == terms.amount * terms.taxRateBps;', replace: 'const r1 = true;' },
  { name: 'rules: record R3 as always true',
    find: 'const r3 = terms.amount + terms.taxAmount == terms.expectedTotal;', replace: 'const r3 = true;' },
  { name: 'rules: record R4 as always true',
    find: 'const r4 = terms.lineItemsSum == terms.amount;', replace: 'const r4 = true;' },
  { name: 'commitments: stop salting the tax tag',
    find: 'return persistentCommit<TaxGroups>(groups, deriveFieldSalt(nonce, tagFieldTaxTag()));',
    replace: 'return persistentCommit<TaxGroups>(groups, default<Bytes<32>>);' },
  { name: 'commitments: salt every field with the nonce itself',
    find: 'return commitFieldWithSalt(tag, value, deriveFieldSalt(nonce, tag));',
    replace: 'return commitFieldWithSalt(tag, value, nonce);' },
  { name: 'commitments: leave the payout addresses out of the committed terms',
    find: '  return persistentCommit<TermsFrame>(frame, nonce);',
    replace: '  return persistentCommit<TermsFrame>(TermsFrame { sellerKey: frame.sellerKey, buyerKey: frame.buyerKey, terms: InvoiceTerms { amount: frame.terms.amount, taxAmount: frame.terms.taxAmount, totalAmount: frame.terms.totalAmount, dueDate: frame.terms.dueDate, orderId: frame.terms.orderId, currency: frame.terms.currency, itemsHash: frame.terms.itemsHash, memoHash: frame.terms.memoHash, lineItemsSum: frame.terms.lineItemsSum, expectedTotal: frame.terms.expectedTotal, taxRateBps: frame.terms.taxRateBps, isJct: frame.terms.isJct, taxGroups: frame.terms.taxGroups, jctNumber: frame.terms.jctNumber, currencyFlag: frame.terms.currencyFlag, sellerPayout: default<Bytes<32>>, buyerPayout: default<Bytes<32>> } }, nonce);' },
  { name: 'counters: stop counting invoices against the seller',
    find: '  bumpInvoiceCount(disclose(sellerKey));\n', replace: '' },
  { name: 'counters: stop counting invoices in the audit counter',
    find: '  bumpAuditCounter(disclose(sellerKey));\n', replace: '' },

  // ---- payInvoiceShielded
  { name: 'pay: let anyone pay',
    find: '  assert(disclose(callerKey()) == parties.buyerKey, "alpaca: caller is not the buyer");\n', replace: '' },
  { name: 'pay: let a paid invoice be paid again',
    find: '  assert(invoiceStatus.lookup(id) == InvoiceStatus.pending, "alpaca: invoice is not open for payment");\n', replace: '' },
  { name: 'pay: believe whatever terms the payer claims',
    find: '  assert(computeInvoiceHash(frame, nonce) == invoiceRegistry.lookup(id),\n         "alpaca: terms do not open the recorded commitment");\n', replace: '' },
  { name: 'pay: accept the wrong amount',
    find: '  assert(coin.value == terms.totalAmount, "alpaca: payment does not equal the invoice total");\n', replace: '' },
  { name: 'pay: accept the wrong token',
    find: '  assert(coin.color == nativeToken(), "alpaca: payment is not in the native token");\n', replace: '' },
  { name: 'pay: accept any recipient',
    find: '  assert(disclose(sellerPayout).bytes == terms.sellerPayout,\n         "alpaca: payment is not addressed to the seller on this invoice");\n', replace: '' },
  { name: 'pay: accept payment after the due date',
    find: '  assert(at <= terms.dueDate, "alpaca: invoice is past its due date");\n', replace: '' },
  { name: 'pay: accept an invoice in the other currency',
    find: '  assert(terms.currencyFlag == CurrencyFlag.credits, "alpaca: invoice is not payable in the native token");\n', replace: '' },
  { name: 'pay: keep the coin instead of forwarding it',
    find: `  sendImmediateShielded(
    disclose(coin),
    left<ZswapCoinPublicKey, ContractAddress>(disclose(sellerPayout)),
    disclose(coin.value)
  );\n`, replace: '' },
  { name: 'pay: forget the settlement anchor',
    find: `  paymentCommitments.insert(
    disclose(computePaymentAnchor(id, terms.totalAmount, settlementSalt())),
    id
  );\n`, replace: '' },
  { name: 'pay: leave the invoice open after paying',
    find: '  invoiceStatus.insert(id, InvoiceStatus.paid);', replace: '' },

  // ---- cancelInvoice
  { name: 'cancel: let anyone cancel',
    find: '  assert(disclose(callerKey()) == parties.sellerKey, "alpaca: caller is not the seller");\n\n  invoiceStatus.insert(id, InvoiceStatus.cancelled);',
    replace: '  invoiceStatus.insert(id, InvoiceStatus.cancelled);' },
  { name: 'cancel: let a paid invoice be cancelled',
    find: '  assert(invoiceStatus.lookup(id) == InvoiceStatus.pending, "alpaca: only a pending invoice can be cancelled");\n', replace: '' },
  { name: 'cancel: leave the audit counter alone',
    find: '  dropAuditCounter(parties.sellerKey);\n', replace: '' },
  { name: 'cancel: let the audit counter underflow',
    // Not a hole in the tests. A pending invoice is always counted in its seller's
    // audit counter and only a cancellation takes it back out, so the count is at
    // least 1 whenever `cancelInvoice` can run and the `n > 0` guard can never fire.
    // It is kept because the Aleo program had it and it costs nothing; the mutant
    // that removes it behaves identically and no test can tell the difference.
    equivalent: 'unreachable: a pending invoice is always counted, so the counter is at least 1 at cancel',
    find: '  if (n > 0) {\n    auditCounter.insert(key, (n - 1) as Uint<64>);\n  }',
    replace: '  auditCounter.insert(key, (n - 1) as Uint<64>);' },

  // ---- setAuditAuthorization
  { name: 'audit: let anyone authorise an auditor',
    find: '  const parties = invoiceParties.lookup(id);\n  assert(disclose(callerKey()) == parties.sellerKey, "alpaca: caller is not the seller");\n\n  assert(disclose(auditKeyHash)',
    replace: '  const parties = invoiceParties.lookup(id);\n\n  assert(disclose(auditKeyHash)' },
  { name: 'audit: allow an authorization that discloses nothing',
    find: '  assert(anyScope(disclose(scopes)), "alpaca: authorization must disclose at least one field");\n', replace: '' },
  { name: 'audit: allow a zero audit key hash',
    find: '  assert(disclose(auditKeyHash) != default<Bytes<32>>, "alpaca: audit key hash must be set");\n', replace: '' },
  { name: 'audit: allow an expiry already in the past',
    find: '  assert(blockTimeLt(disclose(expiresAt)), "alpaca: authorization must expire in the future");\n', replace: '' },
  { name: 'audit: forget to record the authorization',
    find: `  auditAuthorization.insert(id, AuditAuthorization {
    auditKeyHash: disclose(auditKeyHash),
    scopes: disclose(scopes),
    expiresAt: disclose(expiresAt),
    issuer: parties.sellerKey
  });\n`, replace: '' },

  // ---- time
  { name: 'time: let a caller claim a time in the future',
    find: '  assert(blockTimeGte(t), "alpaca: timestamp is in the future");\n', replace: '' },
  { name: 'time: drop the bound on how stale a claim may be',
    find: '  assert(!blockTimeGt((t + TIMESTAMP_WINDOW()) as Uint<64>),\n         "alpaca: timestamp is too far in the past");\n', replace: '' },
  { name: 'time: widen the window to a year',
    find: 'export circuit TIMESTAMP_WINDOW(): Uint<64> { return 3600; }', replace: 'export circuit TIMESTAMP_WINDOW(): Uint<64> { return 31536000; }' },

  // ---- identity and the witness boundary
  { name: 'identity: derive a party key without the deployment salt',
    find: 'return persistentHash<Vector<3, Bytes<32>>>([tagParty(), salt, secret]);',
    replace: 'return persistentHash<Vector<3, Bytes<32>>>([tagParty(), default<Bytes<32>>, secret]);' },
  { name: 'witness: accept an all-zero secret', file: WITNESSES,
    find: 'if (isZero(bytes)) {', replace: 'if (false) {' },
];

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', shell: false, ...opts });

const compile = () => {
  const r = run('wsl', ['-d', 'Ubuntu', '--', 'bash', '-lc',
    `cd ${toWsl(root)} && compact compile --skip-zk src/alpaca-invoice.compact build 2>&1 | tail -5`]);
  return { ok: r.status === 0 && !/Exception|error/i.test(r.stdout), out: r.stdout };
};

// A mutant can make a test spin instead of fail, so a run is given a deadline. A
// run that exceeds it counts as caught but is reported as a timeout, because a
// hang is not the same evidence as an assertion going red.
const TEST_TIMEOUT_MS = 240_000;
const tests = () =>
  run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vitest', 'run'], {
    cwd: root,
    shell: true,
    timeout: TEST_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });

// A run killed part-way leaves a deliberately broken file behind and its backup
// beside it. Restoring any such backup first matters more than it looks: without
// it the next run would take the broken file as the original, and every pattern
// it then failed to find would read as a harness error.
for (const file of [CONTRACT, WITNESSES]) {
  const leftover = `${file}.mutation-backup`;
  try {
    copyFileSync(leftover, file);
    rmSync(leftover);
    console.log(`recovered ${file} from an interrupted run`);
  } catch {
    /* no leftover */
  }
}

const only = process.argv[2];
const backups = new Map();
const backup = (file) => {
  if (!backups.has(file)) {
    const copy = `${file}.mutation-backup`;
    copyFileSync(file, copy);
    backups.set(file, copy);
  }
};
const restoreAll = () => {
  for (const [file, copy] of backups) {
    copyFileSync(copy, file);
    rmSync(copy);
  }
  backups.clear();
};
process.on('exit', restoreAll);
process.on('SIGINT', () => process.exit(130));

const results = [];
const list = only ? MUTANTS.filter((m) => m.name.includes(only)) : MUTANTS;
for (const m of list) {
  const file = m.file ?? CONTRACT;
  backup(file);
  const original = readFileSync(backups.get(file), 'utf8');
  const count = original.split(m.find).length - 1;
  if (count !== 1) {
    console.error(`HARNESS ERROR: "${m.name}" pattern matched ${count} times (need exactly 1)`);
    process.exit(2);
  }
  writeFileSync(file, original.replace(m.find, () => m.replace));

  let verdict;
  if (file === CONTRACT) {
    const c = compile();
    if (!c.ok) { verdict = 'DID NOT COMPILE'; console.error(c.out); }
  }
  if (!verdict) {
    const t = tests();
    verdict = t.error?.code === 'ETIMEDOUT' ? 'timeout' : t.status === 0 ? 'SURVIVED' : 'killed';
    if (verdict === 'SURVIVED' && m.equivalent) verdict = 'equivalent';
  }
  copyFileSync(backups.get(file), file);
  results.push({ name: m.name, verdict });
  console.log(`${verdict.padEnd(16)} ${m.name}`);
}

// Leave the build matching the real source.
restoreAll();
const final = compile();
if (!final.ok) { console.error('final recompile failed\n' + final.out); process.exit(3); }

const survived = results.filter((r) => !['killed', 'timeout', 'equivalent'].includes(r.verdict));
const timeouts = results.filter((r) => r.verdict === 'timeout');
const equivalents = results.filter((r) => r.verdict === 'equivalent');
const caught = results.length - survived.length - equivalents.length;
console.log(
  `\n${caught} of ${results.length - equivalents.length} mutants caught` +
    (timeouts.length > 0 ? ` (${timeouts.length} by timeout)` : '') +
    (equivalents.length > 0 ? `; ${equivalents.length} equivalent, not counted` : ''),
);
for (const q of equivalents) {
  const why = MUTANTS.find((x) => x.name === q.name)?.equivalent;
  console.log(`  equivalent: ${q.name} -- ${why}`);
}
if (survived.length > 0) {
  console.log('Not killed:');
  for (const s of survived) console.log(`  ${s.verdict}: ${s.name}`);
  process.exit(1);
}
