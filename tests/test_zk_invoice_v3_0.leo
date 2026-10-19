// Test suite for zk_invoice_v3_0.aleo (Wave 3: JCT, tax_tag, atomic settlement)

import zk_invoice_v3_0.aleo;

program test_zk_invoice_v3_0.aleo {

    const TEST_BUYER: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;
    const TEST_AMOUNT: u64 = 1_000_000u64;
    const TEST_TAX: u64 = 100_000u64;
    const TEST_TAX_BPS: u64 = 1000u64;
    const TEST_DUE: u32 = 1_735_689_600u32;
    const TEST_NOW: u32 = 1_700_000_000u32;
    const TEST_NONCE: field = 99999field;
    const TEST_ORDER_ID: field = 0field;
    const TEST_CURRENCY: field = 840field;
    const TEST_ITEMS_HASH: field = 11111field;
    const TEST_MEMO_HASH: field = 0field;
    const TEST_LINE_SUM: u64 = 1_000_000u64;
    const TEST_TOTAL: u64 = 1_100_000u64;
    const TEST_PAYMENT_NONCE: field = 22222field;
    const TEST_TX_ID_HASH: field = 12345678field;
    const TEST_AUDIT_KEY_HASH: field = 999field;
    const TEST_SCOPES: u64 = 7u64;

    transition placeholder() -> bool {
        return true;
    }

    @test
    script test_create_invoice_ok_non_jct() {
        let seller: address = zk_invoice_v3_0.aleo/get_caller();

        let invoice_hash: field = zk_invoice_v3_0.aleo/compute_invoice_hash(
            seller,
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

        let jct = zk_invoice_v3_0.aleo/make_jct_non_jct(TEST_TOTAL, 0u8);

        let (seller_rec, buyer_rec, fut) =
            zk_invoice_v3_0.aleo/create_invoice(
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
                TEST_TAX_BPS,
                jct
            );

        fut.await();

        assert_eq(seller_rec.seller, seller);
        assert_eq(seller_rec.amount, TEST_AMOUNT);
        assert_eq(seller_rec.tax_amount, TEST_TAX);
        assert_eq(seller_rec.status, 0u8);
        assert_eq(seller_rec.total_amount, TEST_TOTAL);
        assert_eq(seller_rec.currency_flag, 0u8);
        assert_eq(buyer_rec.owner, TEST_BUYER);
        assert_eq(buyer_rec.currency_flag, 0u8);
    }

    @test
    script test_create_invoice_ok_jct() {
        let seller: address = zk_invoice_v3_0.aleo/get_caller();

        let invoice_hash: field = zk_invoice_v3_0.aleo/compute_invoice_hash(
            seller,
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

        let tax_tag: field = zk_invoice_v3_0.aleo/compute_tax_tag_for_test(1000u64, TEST_AMOUNT, TEST_TAX, 0u64, 0u64, 0u64);
        let jct_reg: field = 111222333field;
        let jct = zk_invoice_v3_0.aleo/make_jct_jct(
            1000u64, TEST_AMOUNT, TEST_TAX,
            0u64, 0u64, 0u64,
            tax_tag, TEST_TOTAL, jct_reg, 0u8
        );

        let (seller_rec, buyer_rec, fut) =
            zk_invoice_v3_0.aleo/create_invoice(
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
                TEST_TAX_BPS,
                jct
            );

        fut.await();

        assert_eq(seller_rec.tax_tag, tax_tag);
        assert_eq(seller_rec.jct_registration, jct_reg);
        assert_eq(seller_rec.total_amount, TEST_TOTAL);
        assert_eq(buyer_rec.tax_tag, tax_tag);
    }

    @test
    script test_cancel_invoice() {
        let seller: address = zk_invoice_v3_0.aleo/get_caller();

        let invoice_hash: field = zk_invoice_v3_0.aleo/compute_invoice_hash(
            seller,
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

        let jct = zk_invoice_v3_0.aleo/make_jct_non_jct(TEST_TOTAL, 0u8);

        let (seller_rec, buyer_rec, f_create) =
            zk_invoice_v3_0.aleo/create_invoice(
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
                TEST_TAX_BPS,
                jct
            );
        f_create.await();

        let (cancelled, f_cancel) = zk_invoice_v3_0.aleo/cancel_invoice(seller_rec);
        f_cancel.await();

        assert_eq(cancelled.status, 2u8);
    }

    @test
    script test_pay_invoice_public() {
        let seller: address = zk_invoice_v3_0.aleo/get_caller();

        let invoice_hash: field = zk_invoice_v3_0.aleo/compute_invoice_hash(
            seller,
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

        let jct = zk_invoice_v3_0.aleo/make_jct_non_jct(TEST_TOTAL, 0u8);

        let (seller_rec, buyer_rec, f_create) =
            zk_invoice_v3_0.aleo/create_invoice(
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
                TEST_TAX_BPS,
                jct
            );
        f_create.await();

        let (receipt, buyer_paid, seller_paid, f_pay) =
            zk_invoice_v3_0.aleo/pay_invoice_public(
                buyer_rec,
                TEST_PAYMENT_NONCE,
                TEST_NOW,
                TEST_TX_ID_HASH
            );
        f_pay.await();

        assert_eq(receipt.settlement_anchor, TEST_TX_ID_HASH);
        assert_eq(receipt.amount, TEST_TOTAL);
        assert_eq(receipt.invoice_id, buyer_rec.invoice_id);
        assert_eq(buyer_paid.status, 1u8);
        assert_eq(seller_paid.status, 1u8);
    }

    @test
    script test_pay_invoice_usdcx() {
        let seller: address = zk_invoice_v3_0.aleo/get_caller();

        let invoice_hash: field = zk_invoice_v3_0.aleo/compute_invoice_hash(
            seller,
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

        let jct = zk_invoice_v3_0.aleo/make_jct_non_jct(TEST_TOTAL, 1u8);

        let (seller_rec, buyer_rec, f_create) =
            zk_invoice_v3_0.aleo/create_invoice(
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
                TEST_TAX_BPS,
                jct
            );
        f_create.await();

        let (receipt, buyer_paid, seller_paid, f_pay) =
            zk_invoice_v3_0.aleo/pay_invoice_usdcx(
                buyer_rec,
                TEST_PAYMENT_NONCE,
                TEST_NOW,
                TEST_TX_ID_HASH
            );
        f_pay.await();

        assert_eq(receipt.settlement_anchor, TEST_TX_ID_HASH);
        assert_eq(receipt.amount, TEST_TOTAL);
        assert_eq(buyer_paid.status, 1u8);
        assert_eq(seller_paid.status, 1u8);
    }

    @test
    script test_set_audit_authorization() {
        let seller: address = zk_invoice_v3_0.aleo/get_caller();

        let invoice_hash: field = zk_invoice_v3_0.aleo/compute_invoice_hash(
            seller,
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

        let jct = zk_invoice_v3_0.aleo/make_jct_non_jct(TEST_TOTAL, 0u8);

        let (seller_rec, buyer_rec, f_create) =
            zk_invoice_v3_0.aleo/create_invoice(
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
                TEST_TAX_BPS,
                jct
            );
        f_create.await();

        let f_auth = zk_invoice_v3_0.aleo/set_audit_authorization(
            seller_rec,
            TEST_AUDIT_KEY_HASH,
            TEST_SCOPES,
            TEST_DUE,
            TEST_NOW
        );
        f_auth.await();
    }

    @test
    script test_getters_tax_tag_jct_reg() {
        let seller: address = zk_invoice_v3_0.aleo/get_caller();

        let invoice_hash: field = zk_invoice_v3_0.aleo/compute_invoice_hash(
            seller,
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

        let tax_tag: field = zk_invoice_v3_0.aleo/compute_tax_tag_for_test(1000u64, TEST_AMOUNT, TEST_TAX, 0u64, 0u64, 0u64);
        let jct_reg: field = 444555666field;
        let jct = zk_invoice_v3_0.aleo/make_jct_jct(
            1000u64, TEST_AMOUNT, TEST_TAX,
            0u64, 0u64, 0u64,
            tax_tag, TEST_TOTAL, jct_reg, 0u8
        );

        let (seller_rec, buyer_rec, f_create) =
            zk_invoice_v3_0.aleo/create_invoice(
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
                TEST_TAX_BPS,
                jct
            );
        f_create.await();

        let f_tt = zk_invoice_v3_0.aleo/get_invoice_tax_tag(seller_rec.invoice_id);
        f_tt.await();
        let f_jr = zk_invoice_v3_0.aleo/get_invoice_jct_reg(seller_rec.invoice_id);
        f_jr.await();
    }

    @test
    script test_getter_tx_id_after_pay() {
        let seller: address = zk_invoice_v3_0.aleo/get_caller();

        let invoice_hash: field = zk_invoice_v3_0.aleo/compute_invoice_hash(
            seller,
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

        let jct = zk_invoice_v3_0.aleo/make_jct_non_jct(TEST_TOTAL, 0u8);

        let (seller_rec, buyer_rec, f_create) =
            zk_invoice_v3_0.aleo/create_invoice(
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
                TEST_TAX_BPS,
                jct
            );
        f_create.await();

        let (receipt, bp, sp, f_pay) =
            zk_invoice_v3_0.aleo/pay_invoice_public(
                buyer_rec,
                TEST_PAYMENT_NONCE,
                TEST_NOW,
                TEST_TX_ID_HASH
            );
        f_pay.await();

        let f_tx = zk_invoice_v3_0.aleo/get_invoice_tx_id(TEST_TX_ID_HASH);
        f_tx.await();
    }
}
