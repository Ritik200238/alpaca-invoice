#!/bin/bash

# Comprehensive test runner for zk_invoice_v3_1.aleo
# Usage: ./run_tests.sh [function_name]
# Example: ./run_tests.sh compute_invoice_id
#
# NOTE ON PRIVATE RECORDS:
# Transitions that consume private Records (create_invoice, pay_invoice_credits_private,
# cancel_invoice, set_audit_authorization) cannot be exercised automatically because
# leo run requires the record ciphertext + a matching view-key/private-key.
# Those transitions are documented below with SKIP markers and manual guidance.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error()   { echo -e "${RED}✗ $1${NC}"; }
print_info()    { echo -e "${BLUE}ℹ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_header()  {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

run_test() {
    local function_name=$1
    local test_name=$2
    shift 2
    local args=("$@")

    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    print_info "Running: $test_name"

    if leo run "$function_name" "${args[@]}" > /dev/null 2>&1; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        print_success "$test_name passed"
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        print_error "$test_name failed"
        # Re-run without redirect to show the actual error
        leo run "$function_name" "${args[@]}" 2>&1 | tail -5 | sed 's/^/    /'
    fi
}

# ---------------------------------------------------------------------------
# Utility transitions (pure functions, no Records, fully automatable)
# ---------------------------------------------------------------------------

test_get_caller() {
    print_header "Testing get_caller"
    run_test "get_caller" "get_caller (no inputs)"
}

test_compute_invoice_id() {
    print_header "Testing compute_invoice_id"
    # Signature: seller buyer amount:u64 due_date:u32 nonce:field -> field

    run_test "compute_invoice_id" "Basic invoice_id computation" \
        "aleo1qnlczqwxpgmmxzl7kk62a5ze6tpj7s87gy90xzmcagkjxqxp3uyqsaqvyu" \
        "aleo1rhgdu77ht6wx9g3lq6z6jlhygpdnmv2hr8v3fn9yfmkqe9vlfvsqwvl344" \
        "1000000u64" "1767225600u32" "12345678901234567890field"

    run_test "compute_invoice_id" "Minimum amount" \
        "aleo1qnlczqwxpgmmxzl7kk62a5ze6tpj7s87gy90xzmcagkjxqxp3uyqsaqvyu" \
        "aleo1rhgdu77ht6wx9g3lq6z6jlhygpdnmv2hr8v3fn9yfmkqe9vlfvsqwvl344" \
        "1u64" "1767225600u32" "1field"

    run_test "compute_invoice_id" "Large amount (1e12 microcredits = 1M credits)" \
        "aleo1qnlczqwxpgmmxzl7kk62a5ze6tpj7s87gy90xzmcagkjxqxp3uyqsaqvyu" \
        "aleo1rhgdu77ht6wx9g3lq6z6jlhygpdnmv2hr8v3fn9yfmkqe9vlfvsqwvl344" \
        "1000000000000u64" "1767225600u32" "99999999999field"

    print_info "compute_invoice_id tests completed"
}

test_compute_invoice_hash() {
    print_header "Testing compute_invoice_hash"
    # Signature: seller buyer amount:u64 tax_amount:u64 due_date:u32 nonce:field
    #            order_id:field currency:field items_hash:field memo_hash:field -> field

    run_test "compute_invoice_hash" "Standard JCT invoice hash (10% tax)" \
        "aleo1qnlczqwxpgmmxzl7kk62a5ze6tpj7s87gy90xzmcagkjxqxp3uyqsaqvyu" \
        "aleo1rhgdu77ht6wx9g3lq6z6jlhygpdnmv2hr8v3fn9yfmkqe9vlfvsqwvl344" \
        "1000000u64" "100000u64" "1767225600u32" \
        "12345678901234567890field" \
        "111111field" "222222field" "333333field" "444444field"

    run_test "compute_invoice_hash" "Non-JCT invoice hash (zero tax)" \
        "aleo1qnlczqwxpgmmxzl7kk62a5ze6tpj7s87gy90xzmcagkjxqxp3uyqsaqvyu" \
        "aleo1rhgdu77ht6wx9g3lq6z6jlhygpdnmv2hr8v3fn9yfmkqe9vlfvsqwvl344" \
        "500000u64" "0u64" "1767225600u32" \
        "99999field" \
        "0field" "0field" "555555field" "0field"

    print_info "compute_invoice_hash tests completed"
}

test_compute_tax_tag() {
    print_header "Testing compute_tax_tag_for_test and compute_tax_tag_export"
    # compute_tax_tag_for_test: ga_rate_bps ga_net_sum ga_tax_sum gb_rate_bps gb_net_sum gb_tax_sum -> field

    run_test "compute_tax_tag_for_test" "Standard 10%+8% tax groups" \
        "1000u64" "100000u64" "10000u64" \
        "800u64"  "200000u64" "16000u64"

    run_test "compute_tax_tag_for_test" "Group A only (10%), group B zero" \
        "1000u64" "500000u64" "50000u64" \
        "0u64"    "0u64"      "0u64"

    run_test "compute_tax_tag_for_test" "Both groups zero (non-JCT equivalent)" \
        "0u64" "0u64" "0u64" \
        "0u64" "0u64" "0u64"

    # compute_tax_tag_export: TaxGroups struct
    run_test "compute_tax_tag_export" "TaxGroups struct (10% group A)" \
        "{ group_a: { rate_bps: 1000u64, net_sum: 100000u64, tax_sum: 10000u64 }, group_b: { rate_bps: 0u64, net_sum: 0u64, tax_sum: 0u64 } }"

    print_info "compute_tax_tag tests completed"
}

test_make_jct() {
    print_header "Testing make_jct_non_jct and make_jct_jct"
    # make_jct_non_jct: total_amount:u64 currency_flag:u8

    run_test "make_jct_non_jct" "Credits non-JCT (currency_flag=0)" \
        "1000000u64" "0u8"

    run_test "make_jct_non_jct" "USDCx non-JCT (currency_flag=1)" \
        "1000000u64" "1u8"

    # make_jct_jct: ga_rate_bps ga_net_sum ga_tax_sum gb_rate_bps gb_net_sum gb_tax_sum tax_tag total_amount jct_reg currency_flag
    # tax_tag must equal BHP256(TaxGroups) — use 0field for script testing (will produce a JCT struct)
    run_test "make_jct_jct" "JCT struct (10%+8%, credits)" \
        "1000u64" "100000u64" "10000u64" \
        "800u64"  "200000u64" "16000u64" \
        "0field" "326000u64" "0field" "0u8"

    print_info "make_jct tests completed"
}

# ---------------------------------------------------------------------------
# Transitions requiring private Records — documented, not auto-run
# ---------------------------------------------------------------------------

test_create_invoice_doc() {
    print_header "create_invoice (SKIP — requires pre-computed invoice_hash)"
    print_warning "create_invoice cannot be tested automatically because:"
    print_info "  1. invoice_hash must equal BHP256(InvoiceHashInput{...}) — must be pre-computed"
    print_info "  2. leo run does not support the CreateInvoiceJct struct literal via CLI on all platforms"
    print_info ""
    print_info "Manual test (after computing correct invoice_hash offline):"
    print_info "  leo run create_invoice \\"
    print_info "    <buyer_addr> \\"
    print_info "    <amount_u64> <tax_amount_u64> <due_date_u32> \\"
    print_info "    <invoice_hash_field> <nonce_field> <current_time_u32> \\"
    print_info "    <order_id_field> <currency_field> <items_hash_field> <memo_hash_field> \\"
    print_info "    <line_items_sum_u64> <expected_total_u64> <tax_rate_bps_u64> \\"
    print_info "    '{ tax_groups: { group_a: { rate_bps: 1000u64, net_sum: 100000u64, tax_sum: 10000u64 }, group_b: { rate_bps: 0u64, net_sum: 0u64, tax_sum: 0u64 } }, tax_tag: <tag_field>, total_amount: 110000u64, jct_registration: <reg_field>, currency_flag: 0u8 }'"
    print_info ""
    print_info "See DEPLOYMENT_LOG.md for testnet tx: at1kf9tl2vmd84398qrpzdrmtfkw2jdt4revyjlv2hmv5efg6rnegzqp3a0yp"
}

test_pay_invoice_credits_private_doc() {
    print_header "pay_invoice_credits_private (SKIP — requires credits record + invoice record)"
    print_warning "pay_invoice_credits_private requires:"
    print_info "  1. credits.aleo/credits private record (from buyer wallet)"
    print_info "  2. zk_invoice_v3_1.aleo/InvoiceRecord private record (status=PENDING, currency_flag=0)"
    print_info "  3. payment_nonce: field  (any field, e.g. 12345field)"
    print_info "  4. paid_at: u32  (Unix timestamp, must be <= invoice.due_date)"
    print_info ""
    print_info "Manual test:"
    print_info "  leo run pay_invoice_credits_private \\"
    print_info "    '<credits_record_ciphertext>' \\"
    print_info "    '<invoice_record_ciphertext>' \\"
    print_info "    <payment_nonce_field> <paid_at_u32>"
    print_info ""
    print_info "Expected outputs (6): seller_credits change_credits PaymentRecord buyer_InvoiceRecord seller_InvoiceRecord Future"
}

test_cancel_invoice_doc() {
    print_header "cancel_invoice (SKIP — requires InvoiceRecord)"
    print_warning "cancel_invoice requires a zk_invoice_v3_1.aleo/InvoiceRecord (status=PENDING, caller=seller)."
    print_info "Manual: leo run cancel_invoice '<invoice_record_ciphertext>'"
}

test_set_audit_authorization_doc() {
    print_header "set_audit_authorization (SKIP — requires InvoiceRecord)"
    print_warning "set_audit_authorization requires a zk_invoice_v3_1.aleo/InvoiceRecord (caller=seller)."
    print_info "Manual: leo run set_audit_authorization '<invoice_record>' <audit_key_hash_field> <scopes_bitmask_u64> <expires_at_u32> <current_time_u32>"
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

print_summary() {
    print_header "Test Summary"
    echo -e "Total Tests:  ${BLUE}${TOTAL_TESTS}${NC}"
    echo -e "Passed:       ${GREEN}${PASSED_TESTS}${NC}"
    echo -e "Failed:       ${RED}${FAILED_TESTS}${NC}"

    if [ $FAILED_TESTS -eq 0 ]; then
        print_success "All automatable tests passed!"
        return 0
    else
        print_error "Some tests failed!"
        return 1
    fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════╗"
    echo "║   zk_invoice_v3_1.aleo Test Suite      ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}"

    if ! command -v leo &> /dev/null; then
        print_error "Leo CLI not found. Please install Leo first."
        echo "Visit: https://developer.aleo.org/leo/installation"
        exit 1
    fi

    print_info "Leo version: $(leo --version)"
    print_info "Contract: zk_invoice_v3_1.aleo (testnet deploy tx: at1kf9tl2vmd84398qrpzdrmtfkw2jdt4revyjlv2hmv5efg6rnegzqp3a0yp)"
    echo ""

    if [ $# -eq 0 ]; then
        # Automatable tests
        test_get_caller
        test_compute_invoice_id
        test_compute_invoice_hash
        test_compute_tax_tag
        test_make_jct

        # Documentation-only (record-dependent)
        test_create_invoice_doc
        test_pay_invoice_credits_private_doc
        test_cancel_invoice_doc
        test_set_audit_authorization_doc
    else
        case $1 in
            get_caller)                     test_get_caller ;;
            compute_invoice_id)             test_compute_invoice_id ;;
            compute_invoice_hash)           test_compute_invoice_hash ;;
            compute_tax_tag)                test_compute_tax_tag ;;
            make_jct)                       test_make_jct ;;
            create_invoice)                 test_create_invoice_doc ;;
            pay_invoice_credits_private)    test_pay_invoice_credits_private_doc ;;
            cancel_invoice)                 test_cancel_invoice_doc ;;
            set_audit_authorization)        test_set_audit_authorization_doc ;;
            *)
                print_error "Unknown test: $1"
                echo "Automatable:  get_caller  compute_invoice_id  compute_invoice_hash  compute_tax_tag  make_jct"
                echo "Docs only:    create_invoice  pay_invoice_credits_private  cancel_invoice  set_audit_authorization"
                exit 1
                ;;
        esac
    fi

    print_summary
}

main "$@"
