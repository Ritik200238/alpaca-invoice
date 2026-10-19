# Deployment Guide (zk_invoice_v3_1.aleo)

适用于当前 Wave 3 交付（JCT + Credits 私有结算，USDCx 路径暂缓）。

## 1) 前置条件
- Leo 3.4+ toolchain（与 `program.json` 中的 `leo` 版本一致）。
- `.env`/shell 环境包含：
  - `ALEO_PRIVATE_KEY` / `ALEO_ADDRESS`
  - `ALEO_NETWORK=testnet`（或目标网络）
- `program.json` 与 `src/main.leo` 保持一致：默认仅依赖 `credits.aleo`；稳定币合约地址待定，不要添加 USDCx program id。

## 2) 编译与本地检查
```bash
leo clean && leo build
```
如需运行单元测试（若存在）：
```bash
leo test
```

## 3) 部署
```bash
leo deploy
```
记录部署返回的 tx hash，例如：
`at1xxxxxxxx...`

## 4) 更新前端配置
在 `.env.local` 或 CI/Vercel 环境变量中设置：
```
NEXT_PUBLIC_PROGRAM_ID=zk_invoice_v3_1.aleo
NEXT_PUBLIC_LEGACY_PROGRAM_ID=zk_invoice_v3_0.aleo   # 可选回滚用
```
USDCx 相关环境变量保持空或移除，等待官方稳定币合约公布后再补充。

## 5) 上链验证（建议）
- 查询 `payment_commitments`、`invoice_status` 等 mapping，确认至少能写入一条测试发票/支付数据。
- 运行前端冒烟：创建发票 → 支付（Credits 私有路径）→ 生成/验证审计包。

## 6) 回滚策略
保留上一个可用的 program id（如 `zk_invoice_v3_0.aleo`）在环境变量中。若发现回归，切回旧 ID 并重新发布前端即可；链上旧状态仍保留。
