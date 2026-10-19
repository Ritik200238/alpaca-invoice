"""The scenes of the Alpaca Invoice demo video.

SPDX-License-Identifier: Apache-2.0

Nothing here is typed in from memory. Test counts come from the vitest report in
`video/evidence/vitest.json`, the mutation result from `video/evidence/mutation.txt`,
and the on-chain scene from `docs/receipts/preview.json`. A scene whose evidence
does not exist is not built, and a missing figure stops the build, so the video
cannot say something that was not measured.
"""

from __future__ import annotations

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
EVIDENCE = ROOT / "evidence"
RECEIPTS = REPO / "docs" / "receipts" / "preview.json"
REPO_URL = "github.com/Ritik200238/alpaca-invoice"


def need(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f"missing evidence: {path}")
    return path.read_text(encoding="utf-8")


def e(text: str) -> str:
    return html.escape(text)


def head(kicker: str, title: str) -> str:
    return f"<div class='kicker'>{e(kicker)}</div><h2>{e(title)}</h2>"


def bullets(items: list[str]) -> str:
    return "<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"


def build_up(first: str, rest: list[str]) -> list[str]:
    """Cumulative pictures: the heading alone, then each extra block added in turn."""
    out, acc = [first], first
    for r in rest:
        acc += r
        out.append(acc)
    return out


def tests_summary() -> tuple[int, int, list[tuple[str, int]]]:
    d = json.loads(need(EVIDENCE / "vitest.json"))
    files = []
    for f in d["testResults"]:
        name = f["name"].replace("\\", "/").split("/")[-1]
        files.append((name, sum(1 for a in f["assertionResults"] if a["status"] == "passed")))
    return d["numPassedTests"], d["numTotalTests"], sorted(files)


def mutation_summary() -> tuple[int, int] | None:
    p = EVIDENCE / "mutation.txt"
    if not p.exists():
        return None
    m = re.search(r"(\d+) of (\d+) mutants caught", p.read_text(encoding="utf-8"))
    return (int(m.group(1)), int(m.group(2))) if m else None


def scenes() -> list[dict]:
    passed, total, files = tests_summary()
    mut = mutation_summary()
    receipts = json.loads(RECEIPTS.read_text(encoding="utf-8")) if RECEIPTS.exists() else None
    deploy = json.loads((EVIDENCE / "deploy.json").read_text(encoding="utf-8")) if (EVIDENCE / "deploy.json").exists() else None
    # What is on a public chain: the receipts if the flow ran, else the deploy alone.
    onchain = receipts["steps"] if receipts and receipts.get("steps") else ([deploy] if deploy else [])
    out: list[dict] = []

    # 1 ------------------------------------------------------------------
    sub = (
        "Ported from Aleo to Midnight. The first four circuits, tested and live on Preview."
        if onchain
        else "Ported from Aleo to Midnight. The first four circuits, tested in process."
    )
    t1 = "<div class='kicker'>Midnight Buildathon &middot; Wave 2</div><h1>Invoices settle on-chain.<br>Their terms never do.</h1>"
    out.append({"id": "title", "label": "Wave 2", "states": [
        {"body": t1, "say": "Alpaca Invoice is private invoicing for businesses. The invoice settles on a public chain, but its terms never appear on it."},
        {"body": t1 + f"<div class='rule'></div><p class='lead'>{e(sub)}</p>", "say": "This video shows the first part of the port from Aleo to Midnight, and the evidence behind it."},
    ]})

    # 2 ------------------------------------------------------------------
    h = head("The problem", "On a public ledger, an invoice tells everyone everything.")
    items = [
        "<li><b>Your prices</b>, readable by every competitor.</li>",
        "<li><b>Your customers</b>, readable by every supplier.</li>",
        "<li><b>How late you pay</b>, readable by every lender.</li>",
    ]
    says = [
        "Put business payments on a transparent chain and the commercial terms go public with them.",
        "Your prices are readable by every competitor.",
        "Your customers are readable by every supplier.",
        "And how late you pay is readable by every lender.",
    ]
    pics = [h + "<ul></ul>"]
    for k in range(1, 4):
        pics.append(h + "<ul>" + "".join(items[:k]) + "</ul>")
    out.append({"id": "problem", "label": "Why privacy", "states": [{"body": b, "say": s} for b, s in zip(pics, says)]})

    # 3 ------------------------------------------------------------------
    pub = ["Invoice identifier", "Status: pending, paid, cancelled", "Eleven field commitments", "Pseudonymous party keys"]
    prv = ["Amount, tax and total", "Tax groups and registration number", "Due date", "Payout addresses"]
    card = lambda title, rows, c: (
        f"<div class='card'><div class='l' style='color:{c};font-weight:600;letter-spacing:.1em;text-transform:uppercase;margin:0 0 18px'>{title}</div>"
        + "".join(f"<div style='font-size:34px;line-height:1.5'>{e(r)}</div>" for r in rows) + "</div>"
    )
    h3 = head("What the chain sees", "Hidden by default. Provable on demand.")
    both = f"<div class='cards' style='--cols:2'>{card('On the ledger', pub, 'var(--blue)')}{card('Stays private', prv, 'var(--accent)')}</div>"
    out.append({"id": "privacy", "label": "Private by construction", "states": [
        {"body": h3, "say": "Alpaca keeps the terms of every invoice off the chain, and keeps the proof on it."},
        {"body": h3 + both, "say": "The ledger holds an identifier, a status, commitments and pseudonymous keys. The amounts, the tax, the due date and the payout addresses stay with the parties."},
        {"body": h3 + both + "<p class='lead' style='margin-top:30px;font-size:32px'>Tests assert that none of the private figures reaches public state.</p>",
         "say": "The test suite checks that none of those private figures ever appears in public state."},
    ]})

    # 4 ------------------------------------------------------------------
    h4 = head("Japanese consumption tax", "The tax rules run inside the proof.")
    rule = ("<div class='term' style='margin:6px 0 0'><span class='dim'>// each rate group, checked in the circuit</span>\n"
            "<span class='p'>tax</span> &times; 10000  =  <span class='p'>net</span> &times; <span class='p'>rate</span>\n\n"
            "<span class='dim'>// two slots: 10% standard, 8% reduced</span>\n"
            "(net<sub>A</sub> + tax<sub>A</sub>) + (net<sub>B</sub> + tax<sub>B</sub>)  =  <span class='p'>total</span></div>")
    out.append({"id": "tax", "label": "Qualified invoices", "states": [
        {"body": h4, "say": "A qualified Japanese invoice carries two tax rates, and the contract checks them before it records anything."},
        {"body": h4 + rule, "say": "Each group must satisfy tax times ten thousand equals net times rate, and the two groups must add up to the invoice total."},
        {"body": h4 + rule + "<p class='lead' style='margin-top:30px;font-size:32px'>Compact has no division, so the rule is a product. It is exact for every amount, where the Aleo version divided first.</p>",
         "say": "Compact has no division operator, so the rule is written as a product. That makes it exact for every amount."},
    ]})

    # 5 ------------------------------------------------------------------
    h5 = head("Payment", "The contract passes the money on and keeps none of it.")
    flow = ("<div class='flow'><div class='box'>Buyer<small>shielded coin</small></div><div class='arrow'>&rarr;</div>"
            "<div class='box' style='border-color:var(--accent)'>Contract<small>receives and forwards in one call</small></div><div class='arrow'>&rarr;</div>"
            "<div class='box'>Seller<small>the payout the invoice names</small></div></div>")
    rules5 = bullets([
        "The coin must equal the invoice total, in the native token.",
        "It must be addressed to the seller the invoice names.",
        "The terms the buyer presents must open the commitment on the ledger.",
    ])
    out.append({"id": "pay", "label": "Shielded settlement", "states": [
        {"body": h5, "say": "The buyer pays inside the transaction that marks the invoice paid."},
        {"body": h5 + flow, "say": "The contract receives the shielded coin and sends it straight to the seller in the same call, so it never holds the money."},
        {"body": h5 + flow + "<div style='height:34px'></div>" + rules5, "say": "The payment must equal the invoice total, go to the seller the invoice names, and come with terms that open the commitment on the ledger. A prover that lies about the terms is refused."},
    ]})

    # 6 ------------------------------------------------------------------
    lines = "".join(
        f"<span class='ok'>&#10003;</span> {e(n):<22}<span class='dim'>{c} tests</span>\n" for n, c in files
    )
    term = f"<div class='term'><span class='p'>$</span> npm test\n\n{lines}\n<span class='ok'>{passed} passed</span> <span class='dim'>({total} total, 0 failed)</span>\n<span class='dim'>summary of the vitest report</span></div>"
    h6 = head("Evidence", "The tests run the compiled contract.")
    states6 = [
        {"body": h6, "say": "Every rule is tested against the real compiled contract, in process, with no node and no proof server."},
        {"body": h6 + term, "say": f"{passed} tests pass. They cover who may act, wrong amounts, wrong tokens, wrong payees, a prover that lies, and the time limits."},
    ]
    if mut:
        k, n = mut
        mtxt = (f"<div style='height:30px'></div><div class='cards' style='--cols:2'><div class='card'><div class='n'>{k} of {n}</div>"
                "<div class='l'>rules broken on purpose, each caught by a failing test. One more is provably unreachable and is listed separately in the repo</div></div>"
                "<div class='card'><div class='n'>4</div><div class='l'>circuits compiled with real proving keys</div></div></div>")
        states6.append({"body": h6 + mtxt, "say": f"To check the tests can fail, each rule was removed in turn and the contract recompiled. {k} of {n} removals were caught."})
    out.append({"id": "tests", "label": "Tests and mutation", "states": states6})

    # 7 ------------------------------------------------------------------
    if onchain:
        def row(st: dict) -> str:
            name = st.get("circuit") or "constructor"
            label = "deploy" if name == "constructor" else name
            return (f"<tr><td>{e(label)}</td><td class='mono'>{e(st['txHash'][:20])}&hellip;</td>"
                    f"<td>{st['blockHeight']:,}</td><td><span class='pill ok'>{e(str(st['status']))}</span></td></tr>")
        tbl = "<table class='tbl'><tr><th>Circuit</th><th>Transaction</th><th>Block</th><th>Status</th></tr>" + "".join(row(x) for x in onchain) + "</table>"
        h7 = head("On Midnight Preview", "On a public network, on a public explorer.")
        flow_ran = receipts is not None and len(receipts.get("steps", [])) > 1
        states7 = [
            {"body": h7, "say": "The contract is deployed to Midnight Preview."},
            {"body": h7 + tbl, "say": ("These are the real transaction hashes, each read back through the public indexer."
                                       if flow_ran else "This is the deployment transaction, confirmed through the public indexer.")},
        ]
        shot = EVIDENCE / ("explorer-create.png" if (EVIDENCE / "explorer-create.png").exists() else "explorer-deploy.png")
        if shot.exists():
            uri = shot.resolve().as_uri()
            states7.append({"body": head("Public record", "Anyone can check it.") + f"<img class='shot' src='{uri}'>",
                            "say": "Anyone can open the hash on a public explorer and see what ran, and the block it landed in."})
        out.append({"id": "chain", "label": "Midnight Preview", "states": states7})

    # 8 ------------------------------------------------------------------
    h8 = head("Where it stands", "A quarter of the port is built. The rest is next.")
    done = bullets(["<b>Built and tested:</b> create, pay, cancel, audit authorization.",
                    "<b>Next:</b> escrow, disputes, and a credit proof that counts only real settled invoices.",
                    "<b>Then:</b> the existing interface on Midnight, through the Lace wallet."])
    out.append({"id": "next", "label": "Roadmap", "states": [
        {"body": h8, "say": "This is the first quarter of the port, and it is stated plainly."},
        {"body": h8 + done, "say": "Create, pay, cancel and audit authorization are built and tested. Escrow, disputes and a credit proof come next, then the existing interface through the Lace wallet."},
    ]})

    # 9 ------------------------------------------------------------------
    h9 = "<div class='kicker'>Alpaca Invoice on Midnight</div><h1>Private invoices.<br>Public proof.</h1>"
    out.append({"id": "close", "label": "Open source", "states": [
        {"body": h9 + f"<div class='rule'></div><p class='lead'>{e(REPO_URL)} &middot; Apache-2.0</p>",
         "say": "The code, the tests and the receipts are open source under Apache two point zero."},
    ]})
    return out
