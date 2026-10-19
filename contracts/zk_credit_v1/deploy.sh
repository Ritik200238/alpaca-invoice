#!/usr/bin/env bash
# ===========================================================
# zk_credit_v1.aleo 一键部署脚本
# 使用前：复制 .env.deploy.example 为 .env 并填入 PRIVATE_KEY
# ===========================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 1. 加载 .env ─────────────────────────────────────────────
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  echo ""
  echo "❌ 未找到 .env 文件。请先执行："
  echo "   cp .env.deploy.example .env"
  echo "   然后填入你的 PRIVATE_KEY"
  echo ""
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

if [ -z "$PRIVATE_KEY" ]; then
  echo ""
  echo "❌ .env 中的 PRIVATE_KEY 为空，请先填入你的 Aleo 私钥"
  echo ""
  exit 1
fi

NETWORK="${NETWORK:-testnet}"
PRIORITY_FEE="${PRIORITY_FEE:-0}"
ENDPOINT="https://api.explorer.provable.com/v1"

echo ""
echo "🚀 准备部署 zk_credit_v1.aleo"
echo "   网络      : $NETWORK"
echo "   节点      : $ENDPOINT"
echo "   优先费用  : $PRIORITY_FEE microcredits"
echo ""

# ── 2. 编译（确保字节码最新）──────────────────────────────────
echo "🔨 Step 1/2  编译 Leo 合约..."
leo build --network "$NETWORK" --endpoint "$ENDPOINT"
echo "✅ 编译完成"
echo ""

# ── 3. 部署 ──────────────────────────────────────────────────
echo "📡 Step 2/2  广播到 $NETWORK ..."
leo deploy \
  --network "$NETWORK" \
  --endpoint "$ENDPOINT" \
  --private-key "$PRIVATE_KEY" \
  --priority-fees "$PRIORITY_FEE" \
  --broadcast \
  --yes

echo ""
echo "🎉 部署完成！Program ID: zk_credit_v1.aleo"
echo ""
echo "📝 请确认 .env.local 中已配置："
echo "   NEXT_PUBLIC_CREDIT_PROGRAM_ID=zk_credit_v1.aleo"
echo ""
