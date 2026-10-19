// zk_invoice_v3_3.aleo — Wave 3.3: on-chain arbiter mapping + USDCx public-as-signer compatibility
//
// 依赖：program.json 声明 credits.aleo、test_usdcx_stablecoin.aleo (location: network).
// - pay_invoice_credits_private: credits.aleo/transfer_private（私有 Record 转账，无 Future），
//   finalize 只写 invoice_status + payment_commitments（承诺哈希）。
// - pay_invoice_usdcx: test_usdcx_stablecoin.aleo/transfer_public_as_signer（无 Approve），
//   finalize await USDCx Future + 写 invoice_status + payment_commitments。
// - settlement_anchor = BHP256(PaymentCommitData{invoice_id, amount, nonce})，ZK 审计承诺。

import credits.aleo;
import test_usdcx_stablecoin.aleo;

program zk_invoice_v3_3.aleo {

    // ========= Program lifecycle =========
    // @noupgrade required by Leo compiler; new contract version can be deployed as zk_invoice_v3_3.aleo if needed.
    @noupgrade
    async constructor() {}

    // ========= Constants =========
    const STATUS_PENDING: u8 = 0u8;
    const STATUS_PAID: u8 = 1u8;
    const STATUS_CANCELLED: u8 = 2u8;
    const STATUS_EXPIRED: u8 = 3u8;
    const CURRENCY_CREDITS: u8 = 0u8;
    const CURRENCY_USDCX: u8 = 1u8;
    // Max invoice amount (microcredits) to avoid u64 overflow in tax math: 10^15 = 1e9 credits
    const MAX_INVOICE_AMOUNT: u64 = 1000000000000000u64;

    // ========= Struct definitions =========
    struct InvoiceData {
        seller: address,
        buyer: address,
        amount: u64,
        due_date: u32,
        invoice_number: field
    }

    struct PaymentData {
        invoice_id: field,
        payer: address,
        payee: address,
        payment_nonce: field
    }

    struct FieldCommitments {
        amount: field,
        tax_amount: field,
        due_date: field,
        buyer: field,
        seller: field,
        currency: field,
        items_hash: field,
        memo_hash: field,
        order_id: field,
        tax_tag: field,
        jct_registration: field
    }

    struct AuditAuthorization {
        audit_key_hash: field,
        scopes_bitmask: u64,
        expires_at: u32,
        issuer: address
    }

    struct InvoiceHashInput {
        seller: address,
        buyer: address,
        amount: u64,
        tax_amount: u64,
        due_date: u32,
        nonce: field,
        order_id: field,
        currency: field,
        items_hash: field,
        memo_hash: field
    }

    struct FieldCommitInput {
        val: field,
        salt: field,
        tag: field
    }

    struct RulesBits {
        r1: bool,
        r2: bool,
        r3: bool,
        r4: bool,
        r5: bool
    }

    // JCT: fixed 2 rate slots (10% / 8%). Unused slot: rate_bps = 0, net_sum = 0, tax_sum = 0.
    struct TaxGroup {
        rate_bps: u64,
        net_sum: u64,
        tax_sum: u64
    }

    struct TaxGroups {
        group_a: TaxGroup,
        group_b: TaxGroup
    }

    // Wave 3.1: commitment input for ZK audit anchor (settlement_anchor = BHP256(PaymentCommitData))
    struct PaymentCommitData {
        invoice_id: field,
        amount: u64,
        nonce: field
    }

    // Bundles JCT-related params to keep create_invoice under the 16-argument limit.
    struct CreateInvoiceJct {
        tax_groups: TaxGroups,
        tax_tag: field,
        total_amount: u64,
        jct_registration: field,
        currency_flag: u8
    }

    // ========= Record definitions =========
    record InvoiceRecord {
        owner: address,
        invoice_id: field,
        seller: address,
        buyer: address,
        amount: u64,
        tax_amount: u64,
        invoice_hash: field,
        due_date: u32,
        created_at: u32,
        status: u8,
        order_id: field,
        currency: field,
        items_hash: field,
        memo_hash: field,
        tax_tag: field,           // BHP256(TaxGroups); 0field = non-JCT
        jct_registration: field,   // BHP256(T_number as u64); 0field = non-JCT
        total_amount: u64,        // Net_sum + Tax_sum (for settlement)
        currency_flag: u8         // 0 = Credits, 1 = USDCx
    }

    // settlement_anchor: Wave 3.1 承诺哈希 = BHP256(PaymentCommitData{invoice_id, amount, nonce})
    // 买家凭 (invoice_id, amount, nonce) 向审计员证明支付真实性；payment_commitments[anchor] = invoice_id
    record PaymentRecord {
        owner: address,
        payment_id: field,
        invoice_id: field,
        payer: address,
        payee: address,
        amount: u64,
        paid_at: u32,
        settlement_anchor: field
    }

    // ========= Public mappings =========
    mapping invoice_registry: field => field;
    mapping invoice_status: field => u8;
    mapping invoice_count: address => u64;
    mapping invoice_commitment: field => field;
    mapping invoice_field_commitments: field => FieldCommitments;
    mapping invoice_rules_result: field => field;
    mapping audit_authorization: field => AuditAuthorization;
    mapping audit_counter: address => u64;
    mapping invoice_tax_tag: field => field;
    mapping invoice_jct_reg: field => field;
    // Wave 3.1: commitment → invoice_id（替换旧 invoice_tx_id）
    mapping payment_commitments: field => field;
    mapping getter_commitment_cache: field => field;
    mapping getter_field_commitments_cache: field => FieldCommitments;
    mapping getter_rules_cache: field => field;
    mapping getter_auth_cache: field => AuditAuthorization;
    mapping getter_counter_cache: address => u64;
    mapping getter_tax_tag_cache: field => field;
    mapping getter_jct_reg_cache: field => field;
    mapping getter_payment_commitment_cache: field => field;

    // Wave 3.2: on-chain arbiter designation (set at invoice creation)
    mapping invoice_arbiter: field => address;

    // ========= Helpers =========
    function compute_invoice_id_internal(
        seller: address,
        buyer: address,
        amount: u64,
        due_date: u32,
        nonce: field
    ) -> field {
        let data: InvoiceData = InvoiceData {
            seller: seller,
            buyer: buyer,
            amount: amount,
            due_date: due_date,
            invoice_number: nonce
        };
        return BHP256::hash_to_field(data);
    }

    function compute_invoice_hash_internal(
        seller: address,
        buyer: address,
        amount: u64,
        tax_amount: u64,
        due_date: u32,
        nonce: field,
        order_id: field,
        currency: field,
        items_hash: field,
        memo_hash: field
    ) -> field {
        let input: InvoiceHashInput = InvoiceHashInput {
            seller: seller,
            buyer: buyer,
            amount: amount,
            tax_amount: tax_amount,
            due_date: due_date,
            nonce: nonce,
            order_id: order_id,
            currency: currency,
            items_hash: items_hash,
            memo_hash: memo_hash
        };
        return BHP256::hash_to_field(input);
    }

    function commit_field(value: field, salt: field, tag: field) -> field {
        let input: FieldCommitInput = FieldCommitInput {
            val: value,
            salt: salt,
            tag: tag
        };
        return BHP256::hash_to_field(input);
    }

    function compute_rules_result(
        r1: bool,
        r2: bool,
        r3: bool,
        r4: bool,
        r5: bool
    ) -> field {
        let bits: RulesBits = RulesBits {
            r1: r1,
            r2: r2,
            r3: r3,
            r4: r4,
            r5: r5
        };
        return BHP256::hash_to_field(bits);
    }

    function compute_tax_tag(tax_groups: TaxGroups) -> field {
        return BHP256::hash_to_field(tax_groups);
    }

    // Verification A (per group): net_sum * rate_bps / 10000 == tax_sum. Overflow-safe when rate_bps <= 10000.
    function tax_group_valid(g: TaxGroup) -> bool {
        if g.rate_bps == 0u64 {
            return (g.net_sum == 0u64) && (g.tax_sum == 0u64);
        }
        let expected_tax: u64 = (g.net_sum / 10000u64) * g.rate_bps;
        return g.tax_sum == expected_tax;
    }

    // Verification C: sum(net_sum + tax_sum) == total_amount
    function tax_groups_sum(tax_groups: TaxGroups) -> u64 {
        let sa: u64 = tax_groups.group_a.net_sum + tax_groups.group_a.tax_sum;
        let sb: u64 = tax_groups.group_b.net_sum + tax_groups.group_b.tax_sum;
        return sa + sb;
    }

    // ========= Core transitions =========

    async transition create_invoice(
        buyer: address,
        amount: u64,
        tax_amount: u64,
        due_date: u32,
        invoice_hash: field,
        nonce: field,
        current_time: u32,
        order_id: field,
        currency: field,
        items_hash: field,
        memo_hash: field,
        line_items_sum: u64,
        expected_total: u64,
        tax_rate_bps: u64,
        jct: CreateInvoiceJct,
        arbiter: address
    ) -> (InvoiceRecord, InvoiceRecord, Future) {
        let seller: address = self.caller;
        let tax_groups: TaxGroups = jct.tax_groups;
        let tax_tag: field = jct.tax_tag;
        let total_amount: u64 = jct.total_amount;
        let jct_registration: field = jct.jct_registration;
        let currency_flag: u8 = jct.currency_flag;

        assert_neq(seller, buyer);
        assert(amount > 0u64);
        assert(amount <= MAX_INVOICE_AMOUNT);
        assert(due_date >= current_time);

        let invoice_id: field = compute_invoice_id_internal(seller, buyer, amount, due_date, nonce);
        let computed_hash: field = compute_invoice_hash_internal(
            seller, buyer, amount, tax_amount, due_date, nonce,
            order_id, currency, items_hash, memo_hash
        );
        assert_eq(invoice_hash, computed_hash);

        if tax_tag != 0field {
            assert_eq(compute_tax_tag(tax_groups), tax_tag);
            assert(tax_group_valid(tax_groups.group_a));
            assert(tax_group_valid(tax_groups.group_b));
            assert_eq(tax_groups_sum(tax_groups), total_amount);
        }
        assert_eq(amount + tax_amount, total_amount);

        let expected_tax: u64 = (amount / 10000u64) * tax_rate_bps;
        let r1_tax_ok: bool = tax_amount == expected_tax;
        let r2_due_ok: bool = due_date >= current_time;
        let r3_total_ok: bool = amount + tax_amount == expected_total;
        let r4_items_ok: bool = line_items_sum == amount;
        let r5_hash_ok: bool = invoice_hash == computed_hash;
        let rules_result: field = compute_rules_result(r1_tax_ok, r2_due_ok, r3_total_ok, r4_items_ok, r5_hash_ok);

        let c_amount: field = commit_field(amount as field, nonce, 1field);
        let c_tax: field = commit_field(tax_amount as field, nonce, 2field);
        let c_due: field = commit_field(due_date as field, nonce, 3field);
        let c_buyer: field = commit_field(buyer as field, nonce, 4field);
        let c_seller: field = commit_field(seller as field, nonce, 5field);
        let c_currency: field = commit_field(currency, nonce, 6field);
        let c_items_hash: field = commit_field(items_hash, nonce, 7field);
        let c_memo_hash: field = commit_field(memo_hash, nonce, 8field);
        let c_order_id: field = commit_field(order_id, nonce, 9field);
        let c_tax_tag: field = commit_field(tax_tag, nonce, 10field);
        let c_jct_reg: field = commit_field(jct_registration, nonce, 11field);

        let commitments: FieldCommitments = FieldCommitments {
            amount: c_amount,
            tax_amount: c_tax,
            due_date: c_due,
            buyer: c_buyer,
            seller: c_seller,
            currency: c_currency,
            items_hash: c_items_hash,
            memo_hash: c_memo_hash,
            order_id: c_order_id,
            tax_tag: c_tax_tag,
            jct_registration: c_jct_reg
        };

        let commitment_root: field = BHP256::hash_to_field(commitments);

        let seller_record: InvoiceRecord = InvoiceRecord {
            owner: seller,
            invoice_id: invoice_id,
            seller: seller,
            buyer: buyer,
            amount: amount,
            tax_amount: tax_amount,
            invoice_hash: invoice_hash,
            due_date: due_date,
            created_at: current_time,
            status: STATUS_PENDING,
            order_id: order_id,
            currency: currency,
            items_hash: items_hash,
            memo_hash: memo_hash,
            tax_tag: tax_tag,
            jct_registration: jct_registration,
            total_amount: total_amount,
            currency_flag: currency_flag
        };

        let buyer_record: InvoiceRecord = InvoiceRecord {
            owner: buyer,
            invoice_id: invoice_id,
            seller: seller,
            buyer: buyer,
            amount: amount,
            tax_amount: tax_amount,
            invoice_hash: invoice_hash,
            due_date: due_date,
            created_at: current_time,
            status: STATUS_PENDING,
            order_id: order_id,
            currency: currency,
            items_hash: items_hash,
            memo_hash: memo_hash,
            tax_tag: tax_tag,
            jct_registration: jct_registration,
            total_amount: total_amount,
            currency_flag: currency_flag
        };

        return (
            seller_record,
            buyer_record,
            finalize_create_invoice(
                invoice_id,
                invoice_hash,
                seller,
                commitment_root,
                commitments,
                rules_result,
                tax_tag,
                jct_registration,
                arbiter
            )
        );
    }

    async function finalize_create_invoice(
        public invoice_id: field,
        public invoice_hash: field,
        public seller: address,
        public commitment_root: field,
        public commitments: FieldCommitments,
        public rules_result: field,
        public tax_tag: field,
        public jct_registration: field,
        public arbiter: address
    ) {
        let existing_hash: field = Mapping::get_or_use(invoice_registry, invoice_id, 0field);
        assert_eq(existing_hash, 0field);

        Mapping::set(invoice_registry, invoice_id, invoice_hash);
        Mapping::set(invoice_status, invoice_id, STATUS_PENDING);
        Mapping::set(invoice_commitment, invoice_id, commitment_root);
        Mapping::set(invoice_field_commitments, invoice_id, commitments);
        Mapping::set(invoice_rules_result, invoice_id, rules_result);
        Mapping::set(invoice_tax_tag, invoice_id, tax_tag);
        Mapping::set(invoice_jct_reg, invoice_id, jct_registration);
        Mapping::set(invoice_arbiter, invoice_id, arbiter);

        let current_count: u64 = Mapping::get_or_use(invoice_count, seller, 0u64);
        Mapping::set(invoice_count, seller, current_count + 1u64);

        let audit_count: u64 = Mapping::get_or_use(audit_counter, seller, 0u64);
        Mapping::set(audit_counter, seller, audit_count + 1u64);
    }

    // Wave 3.1: Credits private payment — transfer_private returns records directly (no Future).
    // settlement_anchor = BHP256(PaymentCommitData{invoice_id, amount, nonce})（ZK audit commitment）
    async transition pay_invoice_credits_private(
        pay_record: credits.aleo/credits,
        invoice: InvoiceRecord,
        payment_nonce: field,
        paid_at: u32
    ) -> (credits.aleo/credits, credits.aleo/credits, PaymentRecord, InvoiceRecord, InvoiceRecord, Future) {
        let payer: address = self.caller;

        assert_eq(payer, invoice.buyer);
        assert_eq(invoice.status, STATUS_PENDING);
        assert_eq(invoice.currency_flag, CURRENCY_CREDITS);
        assert(paid_at <= invoice.due_date);
        assert(invoice.total_amount > 0u64);

        // transfer_private returns (seller_record, change_record) — no Future
        let (seller_credits, change_credits): (credits.aleo/credits, credits.aleo/credits) =
            credits.aleo/transfer_private(pay_record, invoice.seller, invoice.total_amount);

        let commit_data: PaymentCommitData = PaymentCommitData {
            invoice_id: invoice.invoice_id,
            amount: invoice.total_amount,
            nonce: payment_nonce
        };
        let commitment: field = BHP256::hash_to_field(commit_data);

        let payment_id: field = BHP256::hash_to_field(invoice.invoice_id);

        let receipt: PaymentRecord = PaymentRecord {
            owner: payer,
            payment_id: payment_id,
            invoice_id: invoice.invoice_id,
            payer: payer,
            payee: invoice.seller,
            amount: invoice.total_amount,
            paid_at: paid_at,
            settlement_anchor: commitment
        };

        let buyer_paid: InvoiceRecord = InvoiceRecord {
            owner: payer,
            invoice_id: invoice.invoice_id,
            seller: invoice.seller,
            buyer: invoice.buyer,
            amount: invoice.amount,
            tax_amount: invoice.tax_amount,
            invoice_hash: invoice.invoice_hash,
            due_date: invoice.due_date,
            created_at: invoice.created_at,
            status: STATUS_PAID,
            order_id: invoice.order_id,
            currency: invoice.currency,
            items_hash: invoice.items_hash,
            memo_hash: invoice.memo_hash,
            tax_tag: invoice.tax_tag,
            jct_registration: invoice.jct_registration,
            total_amount: invoice.total_amount,
            currency_flag: invoice.currency_flag
        };
        let seller_paid: InvoiceRecord = InvoiceRecord {
            owner: invoice.seller,
            invoice_id: invoice.invoice_id,
            seller: invoice.seller,
            buyer: invoice.buyer,
            amount: invoice.amount,
            tax_amount: invoice.tax_amount,
            invoice_hash: invoice.invoice_hash,
            due_date: invoice.due_date,
            created_at: invoice.created_at,
            status: STATUS_PAID,
            order_id: invoice.order_id,
            currency: invoice.currency,
            items_hash: invoice.items_hash,
            memo_hash: invoice.memo_hash,
            tax_tag: invoice.tax_tag,
            jct_registration: invoice.jct_registration,
            total_amount: invoice.total_amount,
            currency_flag: invoice.currency_flag
        };

        return (
            seller_credits,
            change_credits,
            receipt,
            buyer_paid,
            seller_paid,
            finalize_credits_private_pay(invoice.invoice_id, commitment)
        );
    }

    // Wave 3.3: USDCx payment via transfer_public_as_signer (no MerkleProof input).
    // settlement_anchor = BHP256(PaymentCommitData{invoice_id, amount, nonce})（ZK audit commitment）
    async transition pay_invoice_usdcx(
        invoice: InvoiceRecord,
        payment_nonce: field,
        paid_at: u32
    ) -> (PaymentRecord, InvoiceRecord, InvoiceRecord, Future) {
        let payer: address = self.caller;

        assert_eq(payer, invoice.buyer);
        assert_eq(invoice.status, STATUS_PENDING);
        assert_eq(invoice.currency_flag, CURRENCY_USDCX);
        assert(paid_at <= invoice.due_date);
        assert(invoice.total_amount > 0u64);

        // transfer_public_as_signer(recipient, amount_u128) -> Future
        // Uses caller's public USDCx balance directly.
        let transfer_future: Future =
            test_usdcx_stablecoin.aleo/transfer_public_as_signer(invoice.seller, invoice.total_amount as u128);

        let commit_data: PaymentCommitData = PaymentCommitData {
            invoice_id: invoice.invoice_id,
            amount: invoice.total_amount,
            nonce: payment_nonce
        };
        let commitment: field = BHP256::hash_to_field(commit_data);

        let payment_id: field = BHP256::hash_to_field(invoice.invoice_id);

        let receipt: PaymentRecord = PaymentRecord {
            owner: payer,
            payment_id: payment_id,
            invoice_id: invoice.invoice_id,
            payer: payer,
            payee: invoice.seller,
            amount: invoice.total_amount,
            paid_at: paid_at,
            settlement_anchor: commitment
        };

        let buyer_paid: InvoiceRecord = InvoiceRecord {
            owner: payer,
            invoice_id: invoice.invoice_id,
            seller: invoice.seller,
            buyer: invoice.buyer,
            amount: invoice.amount,
            tax_amount: invoice.tax_amount,
            invoice_hash: invoice.invoice_hash,
            due_date: invoice.due_date,
            created_at: invoice.created_at,
            status: STATUS_PAID,
            order_id: invoice.order_id,
            currency: invoice.currency,
            items_hash: invoice.items_hash,
            memo_hash: invoice.memo_hash,
            tax_tag: invoice.tax_tag,
            jct_registration: invoice.jct_registration,
            total_amount: invoice.total_amount,
            currency_flag: invoice.currency_flag
        };
        let seller_paid: InvoiceRecord = InvoiceRecord {
            owner: invoice.seller,
            invoice_id: invoice.invoice_id,
            seller: invoice.seller,
            buyer: invoice.buyer,
            amount: invoice.amount,
            tax_amount: invoice.tax_amount,
            invoice_hash: invoice.invoice_hash,
            due_date: invoice.due_date,
            created_at: invoice.created_at,
            status: STATUS_PAID,
            order_id: invoice.order_id,
            currency: invoice.currency,
            items_hash: invoice.items_hash,
            memo_hash: invoice.memo_hash,
            tax_tag: invoice.tax_tag,
            jct_registration: invoice.jct_registration,
            total_amount: invoice.total_amount,
            currency_flag: invoice.currency_flag
        };

        return (
            receipt,
            buyer_paid,
            seller_paid,
            finalize_usdcx_pay(invoice.invoice_id, commitment, transfer_future)
        );
    }

    // Credits private path: no transfer Future to await; just write status + commitment.
    async function finalize_credits_private_pay(
        public invoice_id: field,
        public commitment: field
    ) {
        Mapping::set(invoice_status, invoice_id, STATUS_PAID);
        Mapping::set(payment_commitments, commitment, invoice_id);
    }

    // USDCx path: await transfer_public_as_signer Future, then write status + commitment.
    async function finalize_usdcx_pay(
        public invoice_id: field,
        public commitment: field,
        transfer_future: Future
    ) {
        transfer_future.await();
        Mapping::set(invoice_status, invoice_id, STATUS_PAID);
        Mapping::set(payment_commitments, commitment, invoice_id);
    }

    async transition cancel_invoice(
        invoice: InvoiceRecord
    ) -> (InvoiceRecord, Future) {
        let caller: address = self.caller;

        assert_eq(caller, invoice.seller);
        assert_eq(invoice.status, STATUS_PENDING);

        let cancelled_invoice: InvoiceRecord = InvoiceRecord {
            owner: invoice.owner,
            invoice_id: invoice.invoice_id,
            seller: invoice.seller,
            buyer: invoice.buyer,
            amount: invoice.amount,
            tax_amount: invoice.tax_amount,
            invoice_hash: invoice.invoice_hash,
            due_date: invoice.due_date,
            created_at: invoice.created_at,
            status: STATUS_CANCELLED,
            order_id: invoice.order_id,
            currency: invoice.currency,
            items_hash: invoice.items_hash,
            memo_hash: invoice.memo_hash,
            tax_tag: invoice.tax_tag,
            jct_registration: invoice.jct_registration,
            total_amount: invoice.total_amount,
            currency_flag: invoice.currency_flag
        };

        return (
            cancelled_invoice,
            finalize_cancel_invoice(invoice.invoice_id, invoice.seller)
        );
    }

    async function finalize_cancel_invoice(
        public invoice_id: field,
        public seller: address
    ) {
        Mapping::set(invoice_status, invoice_id, STATUS_CANCELLED);
        let current_count: u64 = Mapping::get_or_use(audit_counter, seller, 0u64);
        if current_count > 0u64 {
            Mapping::set(audit_counter, seller, current_count - 1u64);
        }
    }

    async transition set_audit_authorization(
        invoice: InvoiceRecord,
        audit_key_hash: field,
        scopes_bitmask: u64,
        expires_at: u32,
        current_time: u32
    ) -> Future {
        let caller: address = self.caller;
        assert_eq(caller, invoice.seller);
        assert(expires_at >= current_time);

        let auth: AuditAuthorization = AuditAuthorization {
            audit_key_hash: audit_key_hash,
            scopes_bitmask: scopes_bitmask,
            expires_at: expires_at,
            issuer: caller
        };

        return finalize_set_audit_auth(invoice.invoice_id, auth);
    }

    async function finalize_set_audit_auth(
        public invoice_id: field,
        public auth: AuditAuthorization
    ) {
        Mapping::set(audit_authorization, invoice_id, auth);
    }

    // ========= Utility transitions =========
    transition compute_invoice_id(
        seller: address,
        buyer: address,
        amount: u64,
        due_date: u32,
        nonce: field
    ) -> field {
        return compute_invoice_id_internal(seller, buyer, amount, due_date, nonce);
    }

    transition compute_invoice_hash(
        seller: address,
        buyer: address,
        amount: u64,
        tax_amount: u64,
        due_date: u32,
        nonce: field,
        order_id: field,
        currency: field,
        items_hash: field,
        memo_hash: field
    ) -> field {
        return compute_invoice_hash_internal(
            seller, buyer, amount, tax_amount, due_date, nonce,
            order_id, currency, items_hash, memo_hash
        );
    }

    transition compute_tax_tag_export(tax_groups: TaxGroups) -> field {
        return compute_tax_tag(tax_groups);
    }

    transition get_caller() -> address {
        return self.caller;
    }

    // Test helpers: 供 tests/test_zk_invoice_v3_0.leo 构造 CreateInvoiceJct（外部程序不能直接创建本程序 struct）
    transition make_jct_non_jct(total_amount: u64, currency_flag: u8) -> CreateInvoiceJct {
        let zero: TaxGroup = TaxGroup { rate_bps: 0u64, net_sum: 0u64, tax_sum: 0u64 };
        return CreateInvoiceJct {
            tax_groups: TaxGroups { group_a: zero, group_b: zero },
            tax_tag: 0field,
            total_amount: total_amount,
            jct_registration: 0field,
            currency_flag: currency_flag
        };
    }
    transition make_jct_jct(
        ga_rate_bps: u64,
        ga_net_sum: u64,
        ga_tax_sum: u64,
        gb_rate_bps: u64,
        gb_net_sum: u64,
        gb_tax_sum: u64,
        tax_tag: field,
        total_amount: u64,
        jct_reg: field,
        currency_flag: u8
    ) -> CreateInvoiceJct {
        let ga: TaxGroup = TaxGroup { rate_bps: ga_rate_bps, net_sum: ga_net_sum, tax_sum: ga_tax_sum };
        let gb: TaxGroup = TaxGroup { rate_bps: gb_rate_bps, net_sum: gb_net_sum, tax_sum: gb_tax_sum };
        return CreateInvoiceJct {
            tax_groups: TaxGroups { group_a: ga, group_b: gb },
            tax_tag: tax_tag,
            total_amount: total_amount,
            jct_registration: jct_reg,
            currency_flag: currency_flag
        };
    }
    transition compute_tax_tag_for_test(ga_rate_bps: u64, ga_net_sum: u64, ga_tax_sum: u64, gb_rate_bps: u64, gb_net_sum: u64, gb_tax_sum: u64) -> field {
        let ga: TaxGroup = TaxGroup { rate_bps: ga_rate_bps, net_sum: ga_net_sum, tax_sum: ga_tax_sum };
        let gb: TaxGroup = TaxGroup { rate_bps: gb_rate_bps, net_sum: gb_net_sum, tax_sum: gb_tax_sum };
        return compute_tax_tag(TaxGroups { group_a: ga, group_b: gb });
    }

    // ========= Getters for Wave 3 mappings (read via finalize caches) =========
    async transition get_invoice_tax_tag(invoice_id: field) -> Future {
        return finalize_get_invoice_tax_tag(invoice_id);
    }
    async function finalize_get_invoice_tax_tag(public invoice_id: field) {
        let v: field = Mapping::get_or_use(invoice_tax_tag, invoice_id, 0field);
        Mapping::set(getter_tax_tag_cache, invoice_id, v);
    }

    async transition get_invoice_jct_reg(invoice_id: field) -> Future {
        return finalize_get_invoice_jct_reg(invoice_id);
    }
    async function finalize_get_invoice_jct_reg(public invoice_id: field) {
        let v: field = Mapping::get_or_use(invoice_jct_reg, invoice_id, 0field);
        Mapping::set(getter_jct_reg_cache, invoice_id, v);
    }

    // Wave 3.1: payment_commitments[commitment] => invoice_id（供审计 Step 2 承诺验证回溯）
    async transition get_payment_commitment(commitment: field) -> Future {
        return finalize_get_payment_commitment(commitment);
    }
    async function finalize_get_payment_commitment(public commitment: field) {
        let v: field = Mapping::get_or_use(payment_commitments, commitment, 0field);
        Mapping::set(getter_payment_commitment_cache, commitment, v);
    }
}
