import credits.aleo;
import merkle_tree.aleo;
import test_usdcx_multisig_core.aleo;
import test_usdcx_freezelist.aleo;
import test_usdcx_stablecoin.aleo;
program zk_invoice_v3_3.aleo;

record InvoiceRecord:
    owner as address.private;
    invoice_id as field.private;
    seller as address.private;
    buyer as address.private;
    amount as u64.private;
    tax_amount as u64.private;
    invoice_hash as field.private;
    due_date as u32.private;
    created_at as u32.private;
    status as u8.private;
    order_id as field.private;
    currency as field.private;
    items_hash as field.private;
    memo_hash as field.private;
    tax_tag as field.private;
    jct_registration as field.private;
    total_amount as u64.private;
    currency_flag as u8.private;

record PaymentRecord:
    owner as address.private;
    payment_id as field.private;
    invoice_id as field.private;
    payer as address.private;
    payee as address.private;
    amount as u64.private;
    paid_at as u32.private;
    settlement_anchor as field.private;

struct InvoiceData:
    seller as address;
    buyer as address;
    amount as u64;
    due_date as u32;
    invoice_number as field;

struct FieldCommitments:
    amount as field;
    tax_amount as field;
    due_date as field;
    buyer as field;
    seller as field;
    currency as field;
    items_hash as field;
    memo_hash as field;
    order_id as field;
    tax_tag as field;
    jct_registration as field;

struct AuditAuthorization:
    audit_key_hash as field;
    scopes_bitmask as u64;
    expires_at as u32;
    issuer as address;

struct InvoiceHashInput:
    seller as address;
    buyer as address;
    amount as u64;
    tax_amount as u64;
    due_date as u32;
    nonce as field;
    order_id as field;
    currency as field;
    items_hash as field;
    memo_hash as field;

struct FieldCommitInput:
    val as field;
    salt as field;
    tag as field;

struct RulesBits:
    r1 as boolean;
    r2 as boolean;
    r3 as boolean;
    r4 as boolean;
    r5 as boolean;

struct TaxGroup:
    rate_bps as u64;
    net_sum as u64;
    tax_sum as u64;

struct TaxGroups:
    group_a as TaxGroup;
    group_b as TaxGroup;

struct PaymentCommitData:
    invoice_id as field;
    amount as u64;
    nonce as field;

struct CreateInvoiceJct:
    tax_groups as TaxGroups;
    tax_tag as field;
    total_amount as u64;
    jct_registration as field;
    currency_flag as u8;

mapping invoice_registry:
    key as field.public;
    value as field.public;

mapping invoice_status:
    key as field.public;
    value as u8.public;

mapping invoice_count:
    key as address.public;
    value as u64.public;

mapping invoice_commitment:
    key as field.public;
    value as field.public;

mapping invoice_field_commitments:
    key as field.public;
    value as FieldCommitments.public;

mapping invoice_rules_result:
    key as field.public;
    value as field.public;

mapping audit_authorization:
    key as field.public;
    value as AuditAuthorization.public;

mapping audit_counter:
    key as address.public;
    value as u64.public;

mapping invoice_tax_tag:
    key as field.public;
    value as field.public;

mapping invoice_jct_reg:
    key as field.public;
    value as field.public;

mapping payment_commitments:
    key as field.public;
    value as field.public;

mapping getter_commitment_cache:
    key as field.public;
    value as field.public;

mapping getter_field_commitments_cache:
    key as field.public;
    value as FieldCommitments.public;

mapping getter_rules_cache:
    key as field.public;
    value as field.public;

mapping getter_auth_cache:
    key as field.public;
    value as AuditAuthorization.public;

mapping getter_counter_cache:
    key as address.public;
    value as u64.public;

mapping getter_tax_tag_cache:
    key as field.public;
    value as field.public;

mapping getter_jct_reg_cache:
    key as field.public;
    value as field.public;

mapping getter_payment_commitment_cache:
    key as field.public;
    value as field.public;

mapping invoice_arbiter:
    key as field.public;
    value as address.public;

closure compute_invoice_id_internal:
    input r0 as address;
    input r1 as address;
    input r2 as u64;
    input r3 as u32;
    input r4 as field;
    cast r0 r1 r2 r3 r4 into r5 as InvoiceData;
    hash.bhp256 r5 into r6 as field;
    output r6 as field;

closure compute_invoice_hash_internal:
    input r0 as address;
    input r1 as address;
    input r2 as u64;
    input r3 as u64;
    input r4 as u32;
    input r5 as field;
    input r6 as field;
    input r7 as field;
    input r8 as field;
    input r9 as field;
    cast r0 r1 r2 r3 r4 r5 r6 r7 r8 r9 into r10 as InvoiceHashInput;
    hash.bhp256 r10 into r11 as field;
    output r11 as field;

closure compute_tax_tag:
    input r0 as TaxGroups;
    hash.bhp256 r0 into r1 as field;
    output r1 as field;

closure tax_group_valid:
    input r0 as TaxGroup;
    is.eq r0.rate_bps 0u64 into r1;
    is.eq r0.net_sum 0u64 into r2;
    is.eq r0.tax_sum 0u64 into r3;
    and r2 r3 into r4;
    div r0.net_sum 10000u64 into r5;
    mul r5 r0.rate_bps into r6;
    is.eq r0.tax_sum r6 into r7;
    ternary r1 r4 r7 into r8;
    output r8 as boolean;

closure tax_groups_sum:
    input r0 as TaxGroups;
    add r0.group_a.net_sum r0.group_a.tax_sum into r1;
    add r0.group_b.net_sum r0.group_b.tax_sum into r2;
    add r1 r2 into r3;
    output r3 as u64;

closure compute_rules_result:
    input r0 as boolean;
    input r1 as boolean;
    input r2 as boolean;
    input r3 as boolean;
    input r4 as boolean;
    cast r0 r1 r2 r3 r4 into r5 as RulesBits;
    hash.bhp256 r5 into r6 as field;
    output r6 as field;

closure commit_field:
    input r0 as field;
    input r1 as field;
    input r2 as field;
    cast r0 r1 r2 into r3 as FieldCommitInput;
    hash.bhp256 r3 into r4 as field;
    output r4 as field;

function create_invoice:
    input r0 as address.private;
    input r1 as u64.private;
    input r2 as u64.private;
    input r3 as u32.private;
    input r4 as field.private;
    input r5 as field.private;
    input r6 as u32.private;
    input r7 as field.private;
    input r8 as field.private;
    input r9 as field.private;
    input r10 as field.private;
    input r11 as u64.private;
    input r12 as u64.private;
    input r13 as u64.private;
    input r14 as CreateInvoiceJct.private;
    input r15 as address.private;
    assert.neq self.caller r0;
    gt r1 0u64 into r16;
    assert.eq r16 true;
    lte r1 1000000000000000u64 into r17;
    assert.eq r17 true;
    gte r3 r6 into r18;
    assert.eq r18 true;
    call compute_invoice_id_internal self.caller r0 r1 r3 r5 into r19;
    call compute_invoice_hash_internal self.caller r0 r1 r2 r3 r5 r7 r8 r9 r10 into r20;
    assert.eq r4 r20;
    is.neq r14.tax_tag 0field into r21;
    call compute_tax_tag r14.tax_groups into r22;
    not r21 into r23;
    is.eq r22 r14.tax_tag into r24;
    or r24 r23 into r25;
    assert.eq r25 true;
    call tax_group_valid r14.tax_groups.group_a into r26;
    or r26 r23 into r27;
    assert.eq r27 true;
    call tax_group_valid r14.tax_groups.group_b into r28;
    or r28 r23 into r29;
    assert.eq r29 true;
    call tax_groups_sum r14.tax_groups into r30;
    is.eq r30 r14.total_amount into r31;
    or r31 r23 into r32;
    assert.eq r32 true;
    add r1 r2 into r33;
    assert.eq r33 r14.total_amount;
    div r1 10000u64 into r34;
    mul r34 r13 into r35;
    is.eq r2 r35 into r36;
    is.eq r33 r12 into r37;
    is.eq r11 r1 into r38;
    is.eq r4 r20 into r39;
    call compute_rules_result r36 r18 r37 r38 r39 into r40;
    cast r1 into r41 as field;
    call commit_field r41 r5 1field into r42;
    cast r2 into r43 as field;
    call commit_field r43 r5 2field into r44;
    cast r3 into r45 as field;
    call commit_field r45 r5 3field into r46;
    cast r0 into r47 as field;
    call commit_field r47 r5 4field into r48;
    cast self.caller into r49 as field;
    call commit_field r49 r5 5field into r50;
    call commit_field r8 r5 6field into r51;
    call commit_field r9 r5 7field into r52;
    call commit_field r10 r5 8field into r53;
    call commit_field r7 r5 9field into r54;
    call commit_field r14.tax_tag r5 10field into r55;
    call commit_field r14.jct_registration r5 11field into r56;
    cast r42 r44 r46 r48 r50 r51 r52 r53 r54 r55 r56 into r57 as FieldCommitments;
    hash.bhp256 r57 into r58 as field;
    cast self.caller r19 self.caller r0 r1 r2 r4 r3 r6 0u8 r7 r8 r9 r10 r14.tax_tag r14.jct_registration r14.total_amount r14.currency_flag into r59 as InvoiceRecord.record;
    cast r0 r19 self.caller r0 r1 r2 r4 r3 r6 0u8 r7 r8 r9 r10 r14.tax_tag r14.jct_registration r14.total_amount r14.currency_flag into r60 as InvoiceRecord.record;
    async create_invoice r19 r4 self.caller r58 r57 r40 r14.tax_tag r14.jct_registration r15 into r61;
    output r59 as InvoiceRecord.record;
    output r60 as InvoiceRecord.record;
    output r61 as zk_invoice_v3_3.aleo/create_invoice.future;

finalize create_invoice:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as address.public;
    input r3 as field.public;
    input r4 as FieldCommitments.public;
    input r5 as field.public;
    input r6 as field.public;
    input r7 as field.public;
    input r8 as address.public;
    get.or_use invoice_registry[r0] 0field into r9;
    assert.eq r9 0field;
    set r1 into invoice_registry[r0];
    set 0u8 into invoice_status[r0];
    set r3 into invoice_commitment[r0];
    set r4 into invoice_field_commitments[r0];
    set r5 into invoice_rules_result[r0];
    set r6 into invoice_tax_tag[r0];
    set r7 into invoice_jct_reg[r0];
    set r8 into invoice_arbiter[r0];
    get.or_use invoice_count[r2] 0u64 into r10;
    add r10 1u64 into r11;
    set r11 into invoice_count[r2];
    get.or_use audit_counter[r2] 0u64 into r12;
    add r12 1u64 into r13;
    set r13 into audit_counter[r2];

function pay_invoice_credits_private:
    input r0 as credits.aleo/credits.record;
    input r1 as InvoiceRecord.record;
    input r2 as field.private;
    input r3 as u32.private;
    assert.eq self.caller r1.buyer;
    assert.eq r1.status 0u8;
    assert.eq r1.currency_flag 0u8;
    lte r3 r1.due_date into r4;
    assert.eq r4 true;
    gt r1.total_amount 0u64 into r5;
    assert.eq r5 true;
    call credits.aleo/transfer_private r0 r1.seller r1.total_amount into r6 r7;
    cast r1.invoice_id r1.total_amount r2 into r8 as PaymentCommitData;
    hash.bhp256 r8 into r9 as field;
    hash.bhp256 r1.invoice_id into r10 as field;
    cast self.caller r10 r1.invoice_id self.caller r1.seller r1.total_amount r3 r9 into r11 as PaymentRecord.record;
    cast self.caller r1.invoice_id r1.seller r1.buyer r1.amount r1.tax_amount r1.invoice_hash r1.due_date r1.created_at 1u8 r1.order_id r1.currency r1.items_hash r1.memo_hash r1.tax_tag r1.jct_registration r1.total_amount r1.currency_flag into r12 as InvoiceRecord.record;
    cast r1.seller r1.invoice_id r1.seller r1.buyer r1.amount r1.tax_amount r1.invoice_hash r1.due_date r1.created_at 1u8 r1.order_id r1.currency r1.items_hash r1.memo_hash r1.tax_tag r1.jct_registration r1.total_amount r1.currency_flag into r13 as InvoiceRecord.record;
    async pay_invoice_credits_private r1.invoice_id r9 into r14;
    output r6 as credits.aleo/credits.record;
    output r7 as credits.aleo/credits.record;
    output r11 as PaymentRecord.record;
    output r12 as InvoiceRecord.record;
    output r13 as InvoiceRecord.record;
    output r14 as zk_invoice_v3_3.aleo/pay_invoice_credits_private.future;

finalize pay_invoice_credits_private:
    input r0 as field.public;
    input r1 as field.public;
    set 1u8 into invoice_status[r0];
    set r0 into payment_commitments[r1];

function pay_invoice_usdcx:
    input r0 as InvoiceRecord.record;
    input r1 as field.private;
    input r2 as u32.private;
    assert.eq self.caller r0.buyer;
    assert.eq r0.status 0u8;
    assert.eq r0.currency_flag 1u8;
    lte r2 r0.due_date into r3;
    assert.eq r3 true;
    gt r0.total_amount 0u64 into r4;
    assert.eq r4 true;
    cast r0.total_amount into r5 as u128;
    call test_usdcx_stablecoin.aleo/transfer_public_as_signer r0.seller r5 into r6;
    cast r0.invoice_id r0.total_amount r1 into r7 as PaymentCommitData;
    hash.bhp256 r7 into r8 as field;
    hash.bhp256 r0.invoice_id into r9 as field;
    cast self.caller r9 r0.invoice_id self.caller r0.seller r0.total_amount r2 r8 into r10 as PaymentRecord.record;
    cast self.caller r0.invoice_id r0.seller r0.buyer r0.amount r0.tax_amount r0.invoice_hash r0.due_date r0.created_at 1u8 r0.order_id r0.currency r0.items_hash r0.memo_hash r0.tax_tag r0.jct_registration r0.total_amount r0.currency_flag into r11 as InvoiceRecord.record;
    cast r0.seller r0.invoice_id r0.seller r0.buyer r0.amount r0.tax_amount r0.invoice_hash r0.due_date r0.created_at 1u8 r0.order_id r0.currency r0.items_hash r0.memo_hash r0.tax_tag r0.jct_registration r0.total_amount r0.currency_flag into r12 as InvoiceRecord.record;
    async pay_invoice_usdcx r0.invoice_id r8 r6 into r13;
    output r10 as PaymentRecord.record;
    output r11 as InvoiceRecord.record;
    output r12 as InvoiceRecord.record;
    output r13 as zk_invoice_v3_3.aleo/pay_invoice_usdcx.future;

finalize pay_invoice_usdcx:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as test_usdcx_stablecoin.aleo/transfer_public_as_signer.future;
    await r2;
    set 1u8 into invoice_status[r0];
    set r0 into payment_commitments[r1];

function cancel_invoice:
    input r0 as InvoiceRecord.record;
    assert.eq self.caller r0.seller;
    assert.eq r0.status 0u8;
    cast r0.owner r0.invoice_id r0.seller r0.buyer r0.amount r0.tax_amount r0.invoice_hash r0.due_date r0.created_at 2u8 r0.order_id r0.currency r0.items_hash r0.memo_hash r0.tax_tag r0.jct_registration r0.total_amount r0.currency_flag into r1 as InvoiceRecord.record;
    async cancel_invoice r0.invoice_id r0.seller into r2;
    output r1 as InvoiceRecord.record;
    output r2 as zk_invoice_v3_3.aleo/cancel_invoice.future;

finalize cancel_invoice:
    input r0 as field.public;
    input r1 as address.public;
    set 2u8 into invoice_status[r0];
    get.or_use audit_counter[r1] 0u64 into r2;
    gt r2 0u64 into r3;
    branch.eq r3 false to end_then_0_0;
    sub r2 1u64 into r4;
    set r4 into audit_counter[r1];
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    position end_otherwise_0_1;

function set_audit_authorization:
    input r0 as InvoiceRecord.record;
    input r1 as field.private;
    input r2 as u64.private;
    input r3 as u32.private;
    input r4 as u32.private;
    assert.eq self.caller r0.seller;
    gte r3 r4 into r5;
    assert.eq r5 true;
    cast r1 r2 r3 self.caller into r6 as AuditAuthorization;
    async set_audit_authorization r0.invoice_id r6 into r7;
    output r7 as zk_invoice_v3_3.aleo/set_audit_authorization.future;

finalize set_audit_authorization:
    input r0 as field.public;
    input r1 as AuditAuthorization.public;
    set r1 into audit_authorization[r0];

function compute_invoice_id:
    input r0 as address.private;
    input r1 as address.private;
    input r2 as u64.private;
    input r3 as u32.private;
    input r4 as field.private;
    call compute_invoice_id_internal r0 r1 r2 r3 r4 into r5;
    output r5 as field.private;

function compute_invoice_hash:
    input r0 as address.private;
    input r1 as address.private;
    input r2 as u64.private;
    input r3 as u64.private;
    input r4 as u32.private;
    input r5 as field.private;
    input r6 as field.private;
    input r7 as field.private;
    input r8 as field.private;
    input r9 as field.private;
    call compute_invoice_hash_internal r0 r1 r2 r3 r4 r5 r6 r7 r8 r9 into r10;
    output r10 as field.private;

function compute_tax_tag_export:
    input r0 as TaxGroups.private;
    call compute_tax_tag r0 into r1;
    output r1 as field.private;

function get_caller:
    output self.caller as address.private;

function make_jct_non_jct:
    input r0 as u64.private;
    input r1 as u8.private;
    cast 0u64 0u64 0u64 into r2 as TaxGroup;
    cast r2 r2 into r3 as TaxGroups;
    cast r3 0field r0 0field r1 into r4 as CreateInvoiceJct;
    output r4 as CreateInvoiceJct.private;

function make_jct_jct:
    input r0 as u64.private;
    input r1 as u64.private;
    input r2 as u64.private;
    input r3 as u64.private;
    input r4 as u64.private;
    input r5 as u64.private;
    input r6 as field.private;
    input r7 as u64.private;
    input r8 as field.private;
    input r9 as u8.private;
    cast r0 r1 r2 into r10 as TaxGroup;
    cast r3 r4 r5 into r11 as TaxGroup;
    cast r10 r11 into r12 as TaxGroups;
    cast r12 r6 r7 r8 r9 into r13 as CreateInvoiceJct;
    output r13 as CreateInvoiceJct.private;

function compute_tax_tag_for_test:
    input r0 as u64.private;
    input r1 as u64.private;
    input r2 as u64.private;
    input r3 as u64.private;
    input r4 as u64.private;
    input r5 as u64.private;
    cast r0 r1 r2 into r6 as TaxGroup;
    cast r3 r4 r5 into r7 as TaxGroup;
    cast r6 r7 into r8 as TaxGroups;
    call compute_tax_tag r8 into r9;
    output r9 as field.private;

function get_invoice_tax_tag:
    input r0 as field.private;
    async get_invoice_tax_tag r0 into r1;
    output r1 as zk_invoice_v3_3.aleo/get_invoice_tax_tag.future;

finalize get_invoice_tax_tag:
    input r0 as field.public;
    get.or_use invoice_tax_tag[r0] 0field into r1;
    set r1 into getter_tax_tag_cache[r0];

function get_invoice_jct_reg:
    input r0 as field.private;
    async get_invoice_jct_reg r0 into r1;
    output r1 as zk_invoice_v3_3.aleo/get_invoice_jct_reg.future;

finalize get_invoice_jct_reg:
    input r0 as field.public;
    get.or_use invoice_jct_reg[r0] 0field into r1;
    set r1 into getter_jct_reg_cache[r0];

function get_payment_commitment:
    input r0 as field.private;
    async get_payment_commitment r0 into r1;
    output r1 as zk_invoice_v3_3.aleo/get_payment_commitment.future;

finalize get_payment_commitment:
    input r0 as field.public;
    get.or_use payment_commitments[r0] 0field into r1;
    set r1 into getter_payment_commitment_cache[r0];

constructor:
    assert.eq edition 0u16;
