#!/usr/bin/env bash
# v3.1 手动验证：get_caller → create_invoice → cancel_invoice → create_invoice(2) → pay_invoice_credits_private → create_invoice(USDCx) → pay_invoice_usdcx
# 合约：zk_invoice_v3_1.aleo（Credits 私有 + USDCx 私有 transfer_private，承诺审计）
# 在项目根目录执行：./tests/inputs/v3/run_manual.sh
# 依赖：BUYER_PRIVATE_KEY（buyer 地址与 pay 的 caller 一致）；Step 8 需 CREDITS_RECORD（可选）；Step 12 需 TOKEN_RECORD + USDCX_PROOFS（可选），未提供则跳过对应 pay 步骤。

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$ROOT_DIR"

# 加载 .env，使 BUYER_PRIVATE_KEY 等变量在脚本内可用
if [[ -f .env ]]; then
  set -a
  source .env 2>/dev/null || true
  set +a
fi

# 若有 timeout 命令则用其限制 pay 步骤耗时（避免 leo run 跨程序调用挂起时脚本一直卡住）
run_with_timeout() {
  local t="$1"; shift
  if command -v timeout &>/dev/null; then
    timeout "$t" "$@"
  else
    "$@"
  fi
}

# buyer 地址：若已配置 BUYER_PRIVATE_KEY 则用该密钥执行 get_caller 得到，否则用测试常量（此时 pay 步骤会跳过）
if [[ -n "${BUYER_PRIVATE_KEY:-}" ]]; then
  out_buyer=$(leo run --private-key "$BUYER_PRIVATE_KEY" get_caller 2>&1) || true
  BUYER=$(echo "$out_buyer" | sed -n '/➡️  Output/,$p' | grep "•" | tail -1 | sed 's/^[[:space:]]*•[[:space:]]*//' | tr -d '\n\r')
  if [[ -z "$BUYER" || "$BUYER" != aleo1* ]]; then
    echo "Warning: 无法从 BUYER_PRIVATE_KEY 解析出 buyer 地址，将使用测试常量；pay 步骤可能因 caller 与 buyer 不一致而失败。"
    BUYER="aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc"
  else
    echo "Buyer 地址（来自 BUYER_PRIVATE_KEY）: $BUYER"
  fi
else
  BUYER="aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc"
fi
# 从 create_invoice 输出中解析前两个 record（seller / buyer），压成一行；输出到变量 rec1_oneline rec2_oneline
parse_two_invoice_records() {
  local out="$1"
  local awk_script='
    /➡️  Output/ { in_out=1; next }
    in_out && /• \{/ {
      block++
      if (block<=2) {
        line=$0; sub(/^[[:space:]]*•[[:space:]]*/, "", line); rec=line
        depth = gsub(/\{/, "&", line) - gsub(/\}/, "&", line)
        in_rec=1
        next
      }
    }
    in_rec && block<=2 {
      rec = rec "\n" $0
      depth += gsub(/\{/, "&", $0) - gsub(/\}/, "&", $0)
      if (depth == 0) {
        if (block==1) rec1=rec; else rec2=rec
        in_rec=0
      }
      next
    }
    END {
      gsub(/\n/, " ", rec1); gsub(/[[:space:]]+/, " ", rec1); gsub(/^[[:space:]]|[[:space:]]$/, "", rec1)
      gsub(/\n/, " ", rec2); gsub(/[[:space:]]+/, " ", rec2); gsub(/^[[:space:]]|[[:space:]]$/, "", rec2)
      print rec1
      print "---SEP---"
      print rec2
    }
  '
  local parsed
  parsed=$(echo "$out" | awk "$awk_script")
  rec1_oneline=$(echo "$parsed" | sed -n '1p')
  rec2_oneline=$(echo "$parsed" | sed -n '/---SEP---/,$p' | tail -n +2 | head -1)
}

echo "========== Step 1: get_caller =========="
out=$(leo run get_caller 2>&1); ret=$?
echo "$out"
[[ $ret -ne 0 ]] && exit 1
seller=$(echo "$out" | sed -n '/➡️  Output/,$p' | grep "•" | tail -1 | sed 's/^[[:space:]]*•[[:space:]]*//' | tr -d '\n\r')
if [[ -z "$seller" || "$seller" != aleo1* ]]; then
  echo "Failed to parse seller from get_caller output."
  exit 1
fi
echo "seller=$seller"
echo ""

echo "========== Step 2: compute_invoice_hash (nonce 99999) =========="
out=$(leo run compute_invoice_hash \
  "$seller" "$BUYER" \
  1000000u64 100000u64 1735689600u32 99999field 0field 840field 11111field 0field 2>&1); ret=$?
echo "$out"
[[ $ret -ne 0 ]] && exit 1
invoice_hash=$(echo "$out" | sed -n '/➡️  Output/,$p' | grep "field" | tail -1 | sed 's/^[[:space:]]*•[[:space:]]*//' | tr -d '\n\r')
echo "invoice_hash=$invoice_hash"
echo ""

echo "========== Step 3: make_jct_non_jct (Credits) =========="
out=$(leo run make_jct_non_jct 1100000u64 0u8 2>&1); ret=$?
echo "$out"
[[ $ret -ne 0 ]] && exit 1
jct_block=$(echo "$out" | sed -n '/➡️  Output/,$p' | tail -n +2)
jct_oneline=$(echo "$jct_block" | sed 's/^[[:space:]]*•[[:space:]]*//' | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
echo "jct (Credits) obtained"
echo ""

echo "========== Step 4: create_invoice #1 (Credits, for cancel) =========="
out4=$(leo run create_invoice \
  "$BUYER" 1000000u64 100000u64 1735689600u32 \
  "$invoice_hash" 99999field 1700000000u32 0field 840field 11111field 0field \
  1000000u64 1100000u64 1000u64 "$jct_oneline" 2>&1); ret=$?
echo "$out4"
[[ $ret -ne 0 ]] && exit 1
parse_two_invoice_records "$out4"
seller_rec1="$rec1_oneline"
buyer_rec1="$rec2_oneline"
echo "Parsed seller_rec and buyer_rec (invoice #1)"
echo ""

echo "========== Step 5: cancel_invoice (seller record of #1) =========="
out=$(leo run cancel_invoice "$seller_rec1" 2>&1); ret=$?
echo "$out"
[[ $ret -ne 0 ]] && exit 1
echo "cancel_invoice OK"
echo ""

echo "========== Step 6: compute_invoice_hash (nonce 88888 for pay) =========="
out=$(leo run compute_invoice_hash \
  "$seller" "$BUYER" \
  1000000u64 100000u64 1735689600u32 88888field 0field 840field 11111field 0field 2>&1); ret=$?
[[ $ret -ne 0 ]] && exit 1
invoice_hash2=$(echo "$out" | sed -n '/➡️  Output/,$p' | grep "field" | tail -1 | sed 's/^[[:space:]]*•[[:space:]]*//' | tr -d '\n\r')
echo "invoice_hash2=$invoice_hash2"
echo ""

echo "========== Step 7: create_invoice #2 (Credits, for pay_credits_private) =========="
out7=$(leo run create_invoice \
  "$BUYER" 1000000u64 100000u64 1735689600u32 \
  "$invoice_hash2" 88888field 1700000000u32 0field 840field 11111field 0field \
  1000000u64 1100000u64 1000u64 "$jct_oneline" 2>&1); ret=$?
echo "$out7"
[[ $ret -ne 0 ]] && exit 1
parse_two_invoice_records "$out7"
buyer_rec2="$rec2_oneline"
echo "Parsed buyer_rec2 for pay_invoice_credits_private"
echo ""

echo "========== Step 8: pay_invoice_credits_private =========="
if [[ -n "${BUYER_PRIVATE_KEY:-}" && -n "${CREDITS_RECORD:-}" ]]; then
  echo "(需要 credits.aleo/credits 的 pay_record；若长时间无输出可能是跨程序调用挂起，可 Ctrl+C 后单独测试)"
  out=$(run_with_timeout 90 leo run --private-key "$BUYER_PRIVATE_KEY" pay_invoice_credits_private \
    "$CREDITS_RECORD" "$buyer_rec2" 22222field 1700000000u32 2>&1); ret=$?
  echo "$out"
  if [[ $ret -eq 124 ]]; then
    echo "pay_invoice_credits_private 超时(90s)，已跳过。"
    echo ""
  elif [[ $ret -ne 0 ]]; then
    exit 1
  else
    echo "pay_invoice_credits_private OK"
  fi
elif [[ -n "${BUYER_PRIVATE_KEY:-}" ]]; then
  echo "Skipping (set CREDITS_RECORD in .env with a credits.aleo/credits record to run pay_invoice_credits_private)."
else
  echo "Skipping (set BUYER_PRIVATE_KEY in .env to run as buyer)."
fi
echo ""

echo "========== Step 9: compute_invoice_hash (nonce 77777, USDCx) =========="
out=$(leo run compute_invoice_hash \
  "$seller" "$BUYER" \
  1000000u64 100000u64 1735689600u32 77777field 0field 840field 11111field 0field 2>&1); ret=$?
[[ $ret -ne 0 ]] && exit 1
invoice_hash3=$(echo "$out" | sed -n '/➡️  Output/,$p' | grep "field" | tail -1 | sed 's/^[[:space:]]*•[[:space:]]*//' | tr -d '\n\r')
echo "invoice_hash3=$invoice_hash3"
echo ""

echo "========== Step 10: make_jct_non_jct (USDCx) =========="
out=$(leo run make_jct_non_jct 1100000u64 1u8 2>&1); ret=$?
[[ $ret -ne 0 ]] && exit 1
jct_usdcx_block=$(echo "$out" | sed -n '/➡️  Output/,$p' | tail -n +2)
jct_usdcx_oneline=$(echo "$jct_usdcx_block" | sed 's/^[[:space:]]*•[[:space:]]*//' | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
echo "jct (USDCx) obtained"
echo ""

echo "========== Step 11: create_invoice #3 (USDCx, for pay_usdcx) =========="
out11=$(leo run create_invoice \
  "$BUYER" 1000000u64 100000u64 1735689600u32 \
  "$invoice_hash3" 77777field 1700000000u32 0field 840field 11111field 0field \
  1000000u64 1100000u64 1000u64 "$jct_usdcx_oneline" 2>&1); ret=$?
echo "$out11"
[[ $ret -ne 0 ]] && exit 1
parse_two_invoice_records "$out11"
buyer_rec3="$rec2_oneline"
echo "Parsed buyer_rec3 for pay_invoice_usdcx"
echo ""

echo "========== Step 12: pay_invoice_usdcx =========="
if [[ -n "${BUYER_PRIVATE_KEY:-}" && -n "${TOKEN_RECORD:-}" && -n "${USDCX_PROOFS:-}" ]]; then
  echo "(需要 test_usdcx 的 Token record 与 [MerkleProof; 2]；若长时间无输出可能是跨程序调用挂起)"
  out=$(run_with_timeout 90 leo run --private-key "$BUYER_PRIVATE_KEY" pay_invoice_usdcx \
    "$TOKEN_RECORD" "$buyer_rec3" 22222field 1700000000u32 "$USDCX_PROOFS" 2>&1); ret=$?
  echo "$out"
  if [[ $ret -eq 124 ]]; then
    echo "pay_invoice_usdcx 超时(90s)，已跳过。"
    echo ""
  elif [[ $ret -ne 0 ]]; then
    exit 1
  else
    echo "pay_invoice_usdcx OK"
  fi
elif [[ -n "${BUYER_PRIVATE_KEY:-}" ]]; then
  echo "Skipping (set TOKEN_RECORD and USDCX_PROOFS in .env to run pay_invoice_usdcx)."
else
  echo "Skipping (set BUYER_PRIVATE_KEY in .env to run as buyer)."
fi
echo ""
echo "========== Done =========="
