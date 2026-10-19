// Targeted tests for zk_invoice_v2_2.aleo

import zk_invoice_v2_2.aleo;

program test_zk_invoice_v2_2.aleo {

    // ---------- Test constants ----------
    // Align seller with test runner caller (from .env)
    const TEST_SELLER: address = aleo1n0gx6ehedlevfx2xtasc9l22vy4mkfwu0r2he6rdmm9n7hfuq5fq4d8r8u;
    const TEST_BUYER: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;
    const TEST_AMOUNT: u64 = 1_000_000u64;
    const TEST_TAX: u64 = 100_000u64;          // 10%
    const TEST_TAX_BPS: u64 = 1000u64;         // 10% in basis points
    const TEST_DUE: u32 = 1_735_689_600u32;    // 2025-01-01
    const TEST_NOW: u32 = 1_700_000_000u32;    // issue time
    const TEST_NONCE: field = 99999field;
    const TEST_ORDER_ID: field = 0field;
    const TEST_CURRENCY: field = 840field;     // USD numeric code as field
    const TEST_ITEMS_HASH: field = 11111field;
    const TEST_MEMO_HASH: field = 0field;
    const TEST_LINE_SUM: u64 = 1_000_000u64;
    const TEST_TOTAL: u64 = 1_100_000u64;
    const TEST_PAYMENT_NONCE: field = 22222field;
    const OTHER_SELLER: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;

    // Required placeholder transition (tests use scripts)
    transition placeholder() -> bool {
        return true;
    }

    // ---------- Test 1: create_invoice happy path ----------
    @test
    script test_create_invoice_success() {
        let caller_addr: address = zk_invoice_v2_2.aleo/get_caller();

        let invoice_hash: field = zk_invoice_v2_2.aleo/compute_invoice_hash(
            caller_addr,
            TEST_BUYER,
            TEST_AMOUNT,
            TEST_TAX,
            TEST_DUE,
            TEST_NONCE,
            TEST_ORDER_ID,
            TEST_CURRENCY,
            TEST_ITEMS_HASH,
            TEST_MEMO_HASH
        );

        let (seller_rec, buyer_rec, future1) =
            zk_invoice_v2_2.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_TAX,
                TEST_DUE,
                invoice_hash,
                TEST_NONCE,
                TEST_NOW,
                TEST_ORDER_ID,
                TEST_CURRENCY,
                TEST_ITEMS_HASH,
                TEST_MEMO_HASH,
                TEST_LINE_SUM,
                TEST_TOTAL,
                TEST_TAX_BPS
            );

        future1.await();

        assert_eq(seller_rec.seller, caller_addr);
        assert_eq(seller_rec.amount, TEST_AMOUNT);
        assert_eq(seller_rec.tax_amount, TEST_TAX);
        assert_eq(seller_rec.currency, TEST_CURRENCY);
        assert_eq(seller_rec.items_hash, TEST_ITEMS_HASH);
        assert_eq(seller_rec.status, 0u8);
        assert_eq(buyer_rec.owner, TEST_BUYER);
    }

    // ---------- Test 2: cancel_invoice updates status ----------
    @test
    script test_cancel_invoice() {
        let caller_addr: address = zk_invoice_v2_2.aleo/get_caller();

        let invoice_hash: field = zk_invoice_v2_2.aleo/compute_invoice_hash(
            caller_addr,
            TEST_BUYER,
            TEST_AMOUNT,
            TEST_TAX,
            TEST_DUE,
            TEST_NONCE,
            TEST_ORDER_ID,
            TEST_CURRENCY,
            TEST_ITEMS_HASH,
            TEST_MEMO_HASH
        );

        let (seller_rec3, buyer_rec3, future4) =
            zk_invoice_v2_2.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_TAX,
                TEST_DUE,
                invoice_hash,
                TEST_NONCE,
                TEST_NOW,
                TEST_ORDER_ID,
                TEST_CURRENCY,
                TEST_ITEMS_HASH,
                TEST_MEMO_HASH,
                TEST_LINE_SUM,
                TEST_TOTAL,
                TEST_TAX_BPS
            );

        let (cancelled, future5) =
            zk_invoice_v2_2.aleo/cancel_invoice(seller_rec3);

        future4.await();
        future5.await();

        assert_eq(cancelled.status, 2u8);
    }

    // ---------- Test 3: mark_as_paid via test helper ----------
    @test
    script test_mark_as_paid_helper() {
        let caller_addr: address = zk_invoice_v2_2.aleo/get_caller();

        let invoice_hash: field = zk_invoice_v2_2.aleo/compute_invoice_hash(
            caller_addr,
            TEST_BUYER,
            TEST_AMOUNT,
            TEST_TAX,
            TEST_DUE,
            TEST_NONCE,
            TEST_ORDER_ID,
            TEST_CURRENCY,
            TEST_ITEMS_HASH,
            TEST_MEMO_HASH
        );

        let (seller_rec, buyer_rec, f_create) =
            zk_invoice_v2_2.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_TAX,
                TEST_DUE,
                invoice_hash,
                TEST_NONCE,
                TEST_NOW,
                TEST_ORDER_ID,
                TEST_CURRENCY,
                TEST_ITEMS_HASH,
                TEST_MEMO_HASH,
                TEST_LINE_SUM,
                TEST_TOTAL,
                TEST_TAX_BPS
            );
        f_create.await();

        let (receipt, updated, f_pay) =
            zk_invoice_v2_2.aleo/test_mark_as_paid_with_payer(
                buyer_rec,
                TEST_BUYER,
                TEST_PAYMENT_NONCE,
                TEST_NOW
            );

        f_pay.await();
        assert_eq(receipt.amount, TEST_AMOUNT);
        assert_eq(updated.status, 1u8);
    }

    // ---------- Test 4: rules proof hash matches anchor ----------
    @test
    script test_rules_proof_and_anchor() {
        let caller_addr: address = zk_invoice_v2_2.aleo/get_caller();

        let invoice_hash: field = zk_invoice_v2_2.aleo/compute_invoice_hash(
            caller_addr,
            TEST_BUYER,
            TEST_AMOUNT,
            TEST_TAX,
            TEST_DUE,
            TEST_NONCE,
            TEST_ORDER_ID,
            TEST_CURRENCY,
            TEST_ITEMS_HASH,
            TEST_MEMO_HASH
        );

        let (seller_rec, buyer_rec, f_create) =
            zk_invoice_v2_2.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_TAX,
                TEST_DUE,
                invoice_hash,
                TEST_NONCE,
                TEST_NOW,
                TEST_ORDER_ID,
                TEST_CURRENCY,
                TEST_ITEMS_HASH,
                TEST_MEMO_HASH,
                TEST_LINE_SUM,
                TEST_TOTAL,
                TEST_TAX_BPS
            );
        f_create.await();

        let rules_hash: field = zk_invoice_v2_2.aleo/compute_rules_proof(
            seller_rec,
            TEST_NOW,
            TEST_LINE_SUM,
            TEST_TOTAL,
            TEST_TAX_BPS,
            invoice_hash
        );

        let fut_assert = zk_invoice_v2_2.aleo/assert_rules_anchor(
            seller_rec.invoice_id,
            rules_hash
        );
        fut_assert.await();

        assert_eq(rules_hash == 0field, false);
    }

    // ---------- Test 5: tax compliance proof ----------
    @test
    script test_tax_proof() {
        let caller_addr: address = zk_invoice_v2_2.aleo/get_caller();

        let invoice_hash: field = zk_invoice_v2_2.aleo/compute_invoice_hash(
            caller_addr,
            TEST_BUYER,
            TEST_AMOUNT,
            TEST_TAX,
            TEST_DUE,
            TEST_NONCE,
            TEST_ORDER_ID,
            TEST_CURRENCY,
            TEST_ITEMS_HASH,
            TEST_MEMO_HASH
        );

        let (seller_rec, buyer_rec, f_create) =
            zk_invoice_v2_2.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_TAX,
                TEST_DUE,
                invoice_hash,
                TEST_NONCE,
                TEST_NOW,
                TEST_ORDER_ID,
                TEST_CURRENCY,
                TEST_ITEMS_HASH,
                TEST_MEMO_HASH,
                TEST_LINE_SUM,
                TEST_TOTAL,
                TEST_TAX_BPS
            );
        f_create.await();

        let ok: bool = zk_invoice_v2_2.aleo/prove_tax_compliance(seller_rec, TEST_TAX_BPS);
        assert_eq(ok, true);
    }

    // ---------- Test 6: amount and ownership anchors ----------
    @test
    script test_amount_and_owner_anchor() {
        let caller_addr: address = zk_invoice_v2_2.aleo/get_caller();

        let invoice_hash: field = zk_invoice_v2_2.aleo/compute_invoice_hash(
            caller_addr,
            TEST_BUYER,
            TEST_AMOUNT,
            TEST_TAX,
            TEST_DUE,
            TEST_NONCE,
            TEST_ORDER_ID,
            TEST_CURRENCY,
            TEST_ITEMS_HASH,
            TEST_MEMO_HASH
        );

        let (seller_rec, buyer_rec, f_create) =
            zk_invoice_v2_2.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_TAX,
                TEST_DUE,
                invoice_hash,
                TEST_NONCE,
                TEST_NOW,
                TEST_ORDER_ID,
                TEST_CURRENCY,
                TEST_ITEMS_HASH,
                TEST_MEMO_HASH,
                TEST_LINE_SUM,
                TEST_TOTAL,
                TEST_TAX_BPS
            );
        f_create.await();

        let f_amount =
            zk_invoice_v2_2.aleo/assert_amount_anchor(
                seller_rec,
                invoice_hash,
                500_000u64,
                2_000_000u64
            );
        let f_owner =
            zk_invoice_v2_2.aleo/assert_ownership_anchor(
                seller_rec,
                invoice_hash,
                caller_addr,
                TEST_BUYER
            );

        f_amount.await();
        f_owner.await();
    }

    // ---------- Test 7: commitment and counter asserts ----------
    @test
    script test_commitment_and_counter() {
        let caller_addr: address = zk_invoice_v2_2.aleo/get_caller();

        let invoice_hash: field = zk_invoice_v2_2.aleo/compute_invoice_hash(
            caller_addr,
            TEST_BUYER,
            TEST_AMOUNT,
            TEST_TAX,
            TEST_DUE,
            TEST_NONCE,
            TEST_ORDER_ID,
            TEST_CURRENCY,
            TEST_ITEMS_HASH,
            TEST_MEMO_HASH
        );

        let (seller_rec, buyer_rec, f_create) =
            zk_invoice_v2_2.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_TAX,
                TEST_DUE,
                invoice_hash,
                TEST_NONCE,
                TEST_NOW,
                TEST_ORDER_ID,
                TEST_CURRENCY,
                TEST_ITEMS_HASH,
                TEST_MEMO_HASH,
                TEST_LINE_SUM,
                TEST_TOTAL,
                TEST_TAX_BPS
            );
        f_create.await();

        let fc_root: field = BHP256::hash_to_field(FieldCommitments {
            amount: zk_invoice_v2_2.aleo/commit_field(TEST_AMOUNT as field, TEST_NONCE, 1field),
            tax_amount: zk_invoice_v2_2.aleo/commit_field(TEST_TAX as field, TEST_NONCE, 2field),
            due_date: zk_invoice_v2_2.aleo/commit_field(TEST_DUE as field, TEST_NONCE, 3field),
            buyer: zk_invoice_v2_2.aleo/commit_field(TEST_BUYER as field, TEST_NONCE, 4field),
            seller: zk_invoice_v2_2.aleo/commit_field(caller_addr as field, TEST_NONCE, 5field),
            currency: zk_invoice_v2_2.aleo/commit_field(TEST_CURRENCY, TEST_NONCE, 6field),
            items_hash: zk_invoice_v2_2.aleo/commit_field(TEST_ITEMS_HASH, TEST_NONCE, 7field),
            memo_hash: zk_invoice_v2_2.aleo/commit_field(TEST_MEMO_HASH, TEST_NONCE, 8field),
            order_id: zk_invoice_v2_2.aleo/commit_field(TEST_ORDER_ID, TEST_NONCE, 9field)
        });

        let f_commit = zk_invoice_v2_2.aleo/assert_commitment_anchor(
            seller_rec.invoice_id,
            fc_root
        );

        let f_counter = zk_invoice_v2_2.aleo/assert_audit_counter_anchor(
            caller_addr,
            1u64
        );

        f_commit.await();
        f_counter.await();

        let (cancelled, f_cancel) = zk_invoice_v2_2.aleo/cancel_invoice(seller_rec);
        f_cancel.await();

        let f_counter2 = zk_invoice_v2_2.aleo/assert_audit_counter_anchor(
            caller_addr,
            0u64
        );
        f_counter2.await();
    }

    // ---------- Test 8: set_audit_authorization accepts valid input ----------
    @test
    script test_set_auth_ok() {
        let caller_addr: address = zk_invoice_v2_2.aleo/get_caller();

        let invoice_hash: field = zk_invoice_v2_2.aleo/compute_invoice_hash(
            caller_addr,
            TEST_BUYER,
            TEST_AMOUNT,
            TEST_TAX,
            TEST_DUE,
            TEST_NONCE,
            TEST_ORDER_ID,
            TEST_CURRENCY,
            TEST_ITEMS_HASH,
            TEST_MEMO_HASH
        );

        let (seller_rec, buyer_rec_auth, f_create) =
            zk_invoice_v2_2.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_TAX,
                TEST_DUE,
                invoice_hash,
                TEST_NONCE,
                TEST_NOW,
                TEST_ORDER_ID,
                TEST_CURRENCY,
                TEST_ITEMS_HASH,
                TEST_MEMO_HASH,
                TEST_LINE_SUM,
                TEST_TOTAL,
                TEST_TAX_BPS
            );
        f_create.await();

        let fut_auth = zk_invoice_v2_2.aleo/set_audit_authorization(
            seller_rec,
            999field,
            7u64,
            TEST_DUE,     // expires in future relative to TEST_NOW
            TEST_NOW
        );
        fut_auth.await();
    }

}
