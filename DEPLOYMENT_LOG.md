# Deployment Log

---

## zk_invoice_v4_1.aleo (Wave 4.1)

- Network: testnet
- Program ID: `zk_invoice_v4_1.aleo`
- Deployment tx: `at17epvj0t3h3lyhmgwlafl6q444tham4tw4r6wt2d8pwyska7jqy9sj7z6q5`
- Fee tx: `at1x0yyfwvhc8xyh6wkg69hawz8r6ez5tspxvxam52kj4pcs4jwwqzsnkn3a3`
- Deployed by: `aleo155k8rlltrp00gr2l3qx...`
- Date: 2026-03-24 (UTC)
- Total fee: 12.565510 credits

New in v4.1 (vs v4):
- `arbiter_resolve`: 仲裁人可在任意时间（无需超时）裁决 Escrow，支持 release（释放给卖家）或 refund（退还买家）

Frontend:
- `NEXT_PUBLIC_PROGRAM_ID_V4=zk_invoice_v4_1.aleo` 已更新至 `.env.local`
- `useDisputeStore` 补充了 localStorage 持久化

---

## zk_invoice_v3_1.aleo (Wave 3.1)

- Network: testnet
- Program ID: `zk_invoice_v3_1.aleo`
- Deployment tx: `at1kf9tl2vmd84398qrpzdrmtfkw2jdt4revyjlv2hmv5efg6rnegzqp3a0yp`
- Fee tx: `at1l4n90s8c0g9alg8qv0qd62rlrra5zcek77hrzv0r08dkdr8atc8qzc4jdy`
- Deployed by: `aleo1n0gx6ehedlevfx2xtasc9l22vy4mkfwu0r2he6rdmm9n7hfuq5fq4d8r8u`
- Date: 2026-02-12 (UTC)

Build/tests before deploy:
- `leo test` (6/6) covering create, cancel, pay helper, rules anchor, tax proof, amount/ownership anchor.

Post-deploy to-dos:
- Propagate `NEXT_PUBLIC_PROGRAM_ID=zk_invoice_v3_1.aleo` to Vercel/clients.
- Frontend/Service integration for getter caches and proof/anchor flows (pending).
