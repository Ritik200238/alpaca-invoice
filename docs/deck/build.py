"""Build the Inkan slide deck: one HTML file per slide, PNG previews, and one PDF.

SPDX-License-Identifier: Apache-2.0

Figures are read from files, as the demo video's are: test counts from
`video/evidence/vitest.json`, the mutation result from `video/evidence/mutation.txt`,
and the Preview transactions from `docs/receipts/preview.json`. A missing file stops
the build.

    python docs/deck/build.py          # writes docs/deck/*.html, docs/deck/png/, docs/inkan-deck.pdf

Needs Microsoft Edge (headless) for the pictures and the PDF.
"""

from __future__ import annotations

import html
import json
import re
import subprocess
import sys
from pathlib import Path

DECK = Path(__file__).resolve().parent
REPO = DECK.parent.parent
EVIDENCE = REPO / "video" / "evidence"
RECEIPTS = REPO / "docs" / "receipts" / "preview.json"
PDF = REPO / "docs" / "inkan-deck.pdf"
PNG = DECK / "png"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
W, H = 1920, 1080
REPO_URL = "https://github.com/Ritik200238/inkan"


def need(path: Path) -> str:
    if not path.exists():
        sys.exit(f"missing evidence: {path}")
    return path.read_text(encoding="utf-8")


def e(text: str) -> str:
    return html.escape(text)


CSS = """
@font-face { font-family: 'Instrument'; src: url('../../video/fonts/InstrumentSans.ttf'); font-weight: 400 700; }
@page { size: 1920px 1080px; margin: 0; }
:root {
  --ink: #0d1424; --ink2: #141c30; --line: #2a3553; --text: #eef1f8; --dim: #9aa6c4;
  --accent: #e9b44c; --ok: #5ccf9a; --bad: #ef6b6b; --blue: #7aa2ff; --seal: #c8372d; --paper: #f3e6d0;
}
* { box-sizing: border-box; margin: 0; }
html, body { background: var(--ink); }
body { color: var(--text); font-family: 'Instrument', 'Segoe UI', sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.slide { width: 1920px; height: 1080px; position: relative; overflow: hidden; background: var(--ink); page-break-after: always; break-after: page; }
.slide:last-child { page-break-after: auto; break-after: auto; }
.grid { position: absolute; inset: 0;
  background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 96px 96px; opacity: .22; }
.frame { position: absolute; inset: 0; padding: 150px 150px 120px; display: flex; flex-direction: column; justify-content: center; }
.brand { position: absolute; top: 52px; left: 150px; display: flex; align-items: center; gap: 16px;
  font-size: 24px; letter-spacing: .12em; color: var(--dim); text-transform: uppercase; font-weight: 600; }
.brand b { color: var(--accent); }
.mini { width: 38px; height: 38px; border-radius: 8px; background: var(--seal); display: flex; align-items: center; justify-content: center;
  box-shadow: inset 0 0 0 3px var(--seal), inset 0 0 0 5px var(--paper); transform: rotate(-6deg); }
.mini span { font-family: 'Yu Mincho', 'MS Mincho', serif; font-weight: 700; font-size: 22px; color: var(--paper); line-height: 1; letter-spacing: 0; }
.num { position: absolute; top: 56px; right: 150px; font-size: 22px; color: var(--dim); letter-spacing: .08em; }
.foot { position: absolute; bottom: 48px; left: 150px; right: 150px; display: flex; justify-content: space-between; font-size: 20px; color: #6f7ba0; }
.kicker { color: var(--accent); font-size: 25px; letter-spacing: .16em; text-transform: uppercase; font-weight: 600; margin-bottom: 22px; }
h1 { font-size: 112px; line-height: 1.02; font-weight: 700; letter-spacing: -.02em; }
h2 { font-size: 62px; line-height: 1.1; font-weight: 700; letter-spacing: -.015em; max-width: 1600px; margin-bottom: 40px; }
p.lead { font-size: 36px; line-height: 1.4; color: var(--dim); max-width: 1450px; }
p.note { font-size: 27px; line-height: 1.45; color: var(--dim); max-width: 1600px; margin-top: 34px; }
p.note b { color: var(--text); font-weight: 600; }
ul { list-style: none; padding: 0; display: grid; gap: 20px; max-width: 1600px; }
li { font-size: 34px; line-height: 1.34; padding-left: 38px; position: relative; }
li::before { content: ''; position: absolute; left: 0; top: .52em; width: 13px; height: 13px; background: var(--accent); border-radius: 2px; }
li b { color: var(--accent); font-weight: 600; }
.cards { display: grid; grid-template-columns: repeat(var(--cols, 3), 1fr); gap: 26px; max-width: 1620px; }
.card { background: var(--ink2); border: 1px solid var(--line); border-radius: 14px; padding: 32px 34px; }
.card h3 { font-size: 24px; letter-spacing: .12em; text-transform: uppercase; font-weight: 600; color: var(--accent); margin-bottom: 16px; }
.card p { font-size: 28px; line-height: 1.42; color: var(--text); }
.card .n { font-size: 84px; font-weight: 700; color: var(--accent); letter-spacing: -.02em; line-height: 1; }
.card .l { font-size: 26px; color: var(--dim); margin-top: 14px; line-height: 1.35; }
.row { font-size: 30px; line-height: 1.6; }
.term { background: #070b14; border: 1px solid var(--line); border-radius: 14px; padding: 30px 38px;
  font-family: Consolas, 'Cascadia Mono', monospace; font-size: 30px; line-height: 1.55; color: #cfd8ee; white-space: pre; max-width: 1620px; }
.term .c { color: #6f7ba0; } .term .k { color: var(--accent); } .term .ok { color: var(--ok); } .term .bad { color: var(--bad); }
.tbl { width: 100%; max-width: 1620px; border-collapse: collapse; font-size: 27px; }
.tbl th { text-align: left; color: var(--dim); font-weight: 500; font-size: 21px; letter-spacing: .08em; text-transform: uppercase; padding: 10px 16px; border-bottom: 1px solid var(--line); }
.tbl td { padding: 15px 16px; border-bottom: 1px solid #1c2640; vertical-align: middle; }
.tbl td.mono { font-family: Consolas, monospace; color: var(--blue); font-size: 23px; }
.tbl a { color: var(--blue); text-decoration: none; }
.pill { display: inline-block; padding: 3px 14px; border-radius: 999px; font-size: 21px; font-weight: 600; }
.pill.ok { background: #123a2b; color: var(--ok); } .pill.wait { background: #3a2f12; color: var(--accent); }
.flow { display: flex; align-items: stretch; gap: 20px; max-width: 1620px; }
.box { background: var(--ink2); border: 1px solid var(--line); border-radius: 14px; padding: 26px 28px; font-size: 31px; line-height: 1.3; flex: 1; text-align: center;
  display: flex; flex-direction: column; justify-content: center; }
.box small { display: block; color: var(--dim); font-size: 22px; margin-top: 10px; }
.arrow { color: var(--accent); font-size: 46px; display: flex; align-items: center; }
.stack { display: grid; gap: 14px; max-width: 1620px; }
.layer { display: grid; grid-template-columns: 380px 1fr; gap: 28px; align-items: center; background: var(--ink2); border: 1px solid var(--line); border-radius: 14px; padding: 22px 30px; }
.layer .t { font-size: 29px; font-weight: 600; }
.layer .d { font-size: 25px; color: var(--dim); line-height: 1.4; }
.layer.wait { border-style: dashed; }
.seal { width: 260px; height: 260px; border-radius: 52px; background: var(--seal); transform: rotate(-6deg);
  box-shadow: inset 0 0 0 12px var(--seal), inset 0 0 0 18px var(--paper); display: flex; align-items: center; justify-content: center; }
.seal span { font-family: 'Yu Mincho', 'MS Mincho', serif; font-weight: 700; font-size: 160px; color: var(--paper); line-height: 1; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; max-width: 1620px; }
a { color: var(--blue); }
"""


def chrome(n: int, total: int, body: str, footer: str = "") -> str:
    foot = f"<div class='foot'><span>{footer}</span><span>github.com/Ritik200238/inkan</span></div>"
    return (
        "<section class='slide'><div class='grid'></div>"
        "<div class='brand'><div class='mini'><span>印</span></div><span><b>Inkan</b> on Midnight</span></div>"
        f"<div class='num'>{n:02d} / {total:02d}</div><div class='frame'>{body}</div>{foot}</section>"
    )


def head(kicker: str, title: str) -> str:
    return f"<div class='kicker'>{e(kicker)}</div><h2>{e(title)}</h2>"


def tests() -> tuple[int, int, dict[str, int]]:
    d = json.loads(need(EVIDENCE / "vitest.json"))
    files = {}
    for f in d["testResults"]:
        name = re.split(r"[\\/]", f["name"])[-1]
        files[name] = sum(1 for a in f["assertionResults"] if a["status"] == "passed")
    return d["numPassedTests"], d["numTotalTests"], files


def mutation() -> tuple[int, int, int]:
    t = need(EVIDENCE / "mutation.txt")
    m = re.search(r"(\d+) of (\d+) mutants caught; (\d+) equivalent", t)
    if not m:
        sys.exit("mutation.txt has no summary line")
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def slides() -> list[str]:
    passed, total, files = tests()
    if passed != total:
        sys.exit(f"vitest evidence is not all green: {passed}/{total}")
    caught, mutants, equiv = mutation()
    r = json.loads(need(RECEIPTS))
    steps = r["steps"]
    addr = r["contractAddress"]
    not_run = r.get("notRun", [])
    names = {"deploy": "Deploy", "create": "createInvoice", "audit": "setAuditAuthorization", "cancel": "cancelInvoice"}

    s: list[str] = []

    # 1. Title
    s.append(
        "<div style='display:flex;align-items:center;gap:110px'>"
        "<div class='seal'><span>印</span></div>"
        "<div><div class='kicker'>Private B2B invoicing on Midnight</div>"
        "<h1>Inkan</h1>"
        "<p class='lead' style='margin-top:30px;color:var(--text);font-size:44px'>Invoices settle on-chain.<br>Their terms never do.</p>"
        "<p class='note' style='margin-top:44px'>Japanese consumption-tax rules checked inside the proof &middot; shielded settlement &middot; selective audit</p>"
        "</div></div>"
    )

    # 2. Problem
    s.append(
        head("The problem", "On a public ledger, an invoice tells everyone everything.")
        + "<div class='cards' style='--cols:3'>"
        "<div class='card'><h3>Competitors</h3><p>read your prices.</p></div>"
        "<div class='card'><h3>Suppliers</h3><p>read who your customers are.</p></div>"
        "<div class='card'><h3>Lenders</h3><p>read how late you pay.</p></div></div>"
        "<p class='note'>So businesses invoice off-chain, where nothing is provable. <b>Privacy alone does not fix it:</b> "
        "books get audited, taxes get filed, and Japan's qualified-invoice system requires the tax to be correct for each rate. "
        "The terms must stay private and the proof must stay public.</p>"
    )

    # 3. What it does
    s.append(
        head("What Inkan does", "Four operations, one contract.")
        + "<div class='cards' style='--cols:2'>"
        "<div class='card'><h3>Create</h3><p>The seller's terms stay in their private state. The chain records commitments, "
        "and the contract refuses tax groups that do not hold.</p></div>"
        "<div class='card'><h3>Pay</h3><p>The buyer pays in shielded NIGHT inside the transaction that marks the invoice paid. "
        "The contract forwards the coin; it never holds it.</p></div>"
        "<div class='card'><h3>Cancel</h3><p>The seller can cancel a pending invoice. A paid invoice cannot be retracted.</p></div>"
        "<div class='card'><h3>Audit</h3><p>The seller lets one auditor see chosen fields of one invoice until a date, and nothing else.</p></div>"
        "</div>"
    )

    # 4. What the chain sees
    s.append(
        head("What the chain sees", "Hidden by default. Provable on demand.")
        + "<div class='two'>"
        "<div class='card'><h3 style='color:var(--blue)'>Public, per invoice</h3>"
        "<div class='row'>Invoice identifier</div><div class='row'>Two pseudonymous party keys</div>"
        "<div class='row'>Status: pending, paid, cancelled</div><div class='row'>Commitment to the full terms</div>"
        "<div class='row'>Eleven per-field commitments and their root</div><div class='row'>Salted tax tag, rule-result digest</div>"
        "<div class='row'>Audit grant: key hash, field set, expiry</div></div>"
        "<div class='card'><h3>Private, held by the parties</h3>"
        "<div class='row'>Amount, tax and total</div><div class='row'>The two tax-rate groups</div>"
        "<div class='row'>Due date and currency</div><div class='row'>Payout addresses</div>"
        "<div class='row'>Line-item and memo digests, order reference</div><div class='row'>Every commitment opening</div></div>"
        "</div>"
        "<p class='note'>Terms reach a circuit only as witnesses. Tests read the ledger back and fail if any private figure appears in it.</p>"
    )

    # 5. Tax rule
    s.append(
        head("Tax rules inside the proof", "The contract refuses an invoice whose tax is wrong.")
        + "<div class='term'><span class='c'>// for each rate group of a qualified invoice (10% standard, 8% reduced)</span>\n"
        "<span class='k'>assert</span> tax * 10000 == net * rate        <span class='c'>// rate in basis points</span>\n"
        "<span class='k'>assert</span> (net10 + tax10) + (net8 + tax8) == total</div>"
        "<p class='note'><b>Compact has no division</b>, so the rule is stated as a product. It is exact for every amount: "
        "15,000 at 10% is 1,500, where dividing first, (net / 10000) &times; rate, gives 1,000. "
        "The verifier learns that the groups are consistent and add up, and nothing about the figures.</p>"
    )

    # 6. Payment
    pay_status = "Tested in process; on Preview it needs <b>shielded</b> NIGHT, and the faucet pays unshielded." if any(x.get("step") == "pay" for x in not_run) else "Run on Preview; see the receipts."
    s.append(
        head("Shielded settlement", "Payment and status change are one transaction.")
        + "<div class='flow'>"
        "<div class='box'>Buyer<small>proves they hold the committed terms</small></div><div class='arrow'>&rarr;</div>"
        "<div class='box' style='border-color:var(--accent)'>Contract<small>receives the coin and forwards it in the same call</small></div><div class='arrow'>&rarr;</div>"
        "<div class='box'>Seller<small>at the payout address in the committed terms</small></div></div>"
        "<ul style='margin-top:40px'>"
        "<li>The coin must equal the invoice total, in the invoice's token.</li>"
        "<li>It must go to the seller the invoice names; a prover that lies about the terms is refused.</li>"
        "<li>Paying after the private due date is refused, against the block's clock.</li></ul>"
        f"<p class='note'><span class='pill wait'>Next step</span>&nbsp; {pay_status}</p>"
    )

    # 7. Audit
    s.append(
        head("Selective audit", "Show one auditor the chosen fields, and nothing else.")
        + "<div class='cards' style='--cols:3'>"
        "<div class='card'><h3>Scope</h3><p>Nine fields to choose from: amount, tax, due date, buyer and more. "
        "Stored as a nine-slot vector, because Compact has no bitwise operators.</p></div>"
        "<div class='card'><h3>Expiry</h3><p>The grant ends at a date checked against the block, not against a time the caller chose.</p></div>"
        "<div class='card'><h3>Key</h3><p>Only a hash of the audit key reaches the chain.</p></div></div>"
        "<p class='note'><b>One salt per field.</b> If every field shared one salt, disclosing one would help an auditor test guesses "
        "against the rest. With a derived salt per field, it does not.</p>"
    )

    # 8. Preview
    rows = ""
    for st in steps:
        url = next((x["url"] for x in st.get("explorers", []) if x["explorer"] == "1am"), "")
        h = st["txHash"]
        rows += (
            f"<tr><td>{e(names.get(st['step'], st['step']))}</td>"
            f"<td class='mono'><a href='{e(url)}'>{h[:16]}&hellip;{h[-8:]}</a></td>"
            f"<td>{st['blockHeight']:,}</td><td><span class='pill ok'>success</span></td></tr>"
        )
    s.append(
        head("Live on Midnight Preview", "Four transactions on a public network.")
        + f"<p class='lead' style='font-size:27px;margin-bottom:26px'>Contract <span style='font-family:Consolas,monospace;color:var(--blue);font-size:25px'>{addr}</span></p>"
        "<table class='tbl'><tr><th>Step</th><th>Transaction</th><th>Block</th><th>Indexer</th></tr>" + rows + "</table>"
        "<p class='note'>After each transaction the state was read back through the public indexer and searched for the invoice's "
        "amount, tax, total and due date; none appeared. The four-circuit deploy used <b>23.6%</b> of the block's write budget. "
        "Hashes link to the explorer; all of them are in <b>docs/receipts/preview.json</b>.</p>"
    )

    # 9. Verification
    per_file = " &middot; ".join(f"{n.replace('.test.ts', '')} {c}" for n, c in sorted(files.items()))
    s.append(
        head("How it was verified", "Tests that were made to fail first.")
        + "<div class='cards' style='--cols:3'>"
        f"<div class='card'><div class='n'>{passed}</div><div class='l'>simulator tests against the compiled contract, all passing<div style='white-space:nowrap;font-size:21px;margin-top:10px;color:#6f7ba0'>{per_file}</div></div></div>"
        f"<div class='card'><div class='n'>{caught} / {mutants}</div><div class='l'>deliberately broken rules caught by the suite; {equiv} more is provably unreachable and named, not counted</div></div>"
        f"<div class='card'><div class='n'>{len(steps)}</div><div class='l'>transactions on Preview, each read back from the public indexer</div></div></div>"
        "<p class='note'>The tests cover who may act, wrong amount, wrong token, wrong payee, a prover lying about the terms, "
        "the time bounds, the tax rules, and that no amount or payout address reaches public state. "
        "<b>The mutation sweep found a gap the green suite hid</b>: nothing checked that party keys depend on the deployment salt. Four tests closed it.</p>"
    )

    # 10. Architecture
    s.append(
        head("Architecture", "Private state on the device. Commitments on the chain.")
        + "<div class='stack'>"
        "<div class='layer wait'><div class='t'>Interface</div><div class='d'>Next.js 14, English, Japanese and Chinese. "
        "<span style='color:var(--accent)'>Not yet connected to the Midnight contract; next step, through the Lace wallet.</span></div></div>"
        "<div class='layer'><div class='t'>Private state &amp; witnesses</div><div class='d'>The seller's secret and the open terms, "
        "handed to circuits as witnesses with size and non-zero checks (witnesses.ts)</div></div>"
        "<div class='layer'><div class='t'>Compact contract</div><div class='d'>Compact 0.23, toolchain 0.31.1: createInvoice, payInvoiceShielded, "
        "cancelInvoice, setAuditAuthorization; hashes exported as pure circuits so the app computes exactly what the chain does</div></div>"
        "<div class='layer'><div class='t'>Proving &amp; network</div><div class='d'>Local proof server 8.1.0, Midnight.js 4.1.1, wallet SDK 1.2.0, "
        "Zswap shielded coins, DUST fees, the public Preview indexer</div></div>"
        "</div>"
        "<p class='note'>Identity is a key derived from a secret the caller proves they hold, never <b>ownPublicKey()</b>. "
        "Every claimed time is bounded to within one hour of the block and never ahead of it.</p>"
    )

    # 11. Business
    s.append(
        head("Who it is for", "Businesses that must prove their books without publishing them.")
        + "<div class='cards' style='--cols:3'>"
        "<div class='card'><h3>Sellers</h3><p>Invoice and get paid on-chain without showing prices or customers to anyone reading the ledger.</p></div>"
        "<div class='card'><h3>Buyers</h3><p>Pay in the same step that records the payment, with a settlement anchor they can later show an auditor.</p></div>"
        "<div class='card'><h3>Auditors</h3><p>Check exactly the fields they are shown against commitments the chain has held since the invoice was created.</p></div>"
        "</div>"
        "<p class='note'><b>Why Japan first:</b> the qualified-invoice system makes per-rate tax correctness a legal requirement, "
        "and that is a rule a proof can check. Later, credit proofs from settled invoices let a seller show a lender a payment record "
        "without the invoices behind it. Pricing is not set yet.</p>"
    )

    # 12. Roadmap
    s.append(
        head("Where it stands", "Built, tested and deployed; next, connected.")
        + "<div class='two'>"
        "<div class='card'><h3 style='color:var(--ok)'>Done</h3>"
        "<div class='row'>Contract with four entry points, full proving keys</div>"
        f"<div class='row'>{passed} tests, {caught} of {mutants} mutants caught</div>"
        "<div class='row'>Deploy, create, audit grant and cancel on Preview</div>"
        "<div class='row'>Demo video, receipts, Apache-2.0</div></div>"
        "<div class='card'><h3>Next</h3>"
        "<div class='row'>The payment on Preview, with shielded NIGHT</div>"
        "<div class='row'>The interface on Midnight, through Lace</div>"
        "<div class='row'>Escrow and disputes, in the same contract</div>"
        "<div class='row'>Credit proofs from settled invoices</div></div>"
        "</div>"
        f"<p class='note'>Code: <a href='{REPO_URL}'>{REPO_URL.replace('https://', '')}</a> &middot; "
        "video: docs/inkan-demo.mp4 &middot; receipts: docs/receipts/preview.json</p>"
    )

    n = len(s)
    footers = ["", "Problem", "Product", "Privacy", "Tax", "Payment", "Audit", "On-chain", "Quality", "Architecture", "Business", "Roadmap"]
    return [chrome(i + 1, n, body, footers[i] if i < len(footers) else "") for i, body in enumerate(s)]


def doc(sections: list[str], title: str) -> str:
    return (f"<!doctype html><html lang='en'><meta charset='utf-8'><title>{e(title)}</title>"
            f"<style>{CSS}</style><body>{''.join(sections)}</body></html>")


def edge(args: list[str], out: Path) -> None:
    for _ in range(2):
        out.unlink(missing_ok=True)
        subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                        "--virtual-time-budget=2000", *args], capture_output=True, text=True)
        if out.exists() and out.stat().st_size > 5000:
            return
    sys.exit(f"Edge produced nothing for {out.name}")


def main() -> None:
    secs = slides()
    PNG.mkdir(exist_ok=True)
    for i, sec in enumerate(secs, 1):
        f = DECK / f"slide-{i:02d}.html"
        f.write_text(doc([sec], f"Inkan deck {i}"), encoding="utf-8")
        png = PNG / f"slide-{i:02d}.png"
        edge([f"--window-size={W},{H}", f"--screenshot={png}", f.as_uri()], png)
    full = DECK / "index.html"
    full.write_text(doc(secs, "Inkan deck"), encoding="utf-8")
    edge(["--no-pdf-header-footer", f"--print-to-pdf={PDF}", full.as_uri()], PDF)
    print(f"{len(secs)} slides -> {PDF}")


if __name__ == "__main__":
    main()
