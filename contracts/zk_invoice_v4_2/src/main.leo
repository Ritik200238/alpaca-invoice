// zk_invoice_v4_2.aleo — Wave 4.2: ESCROWED-only Dispute + Arbiter Flow
//
// Changes from v4.1:
//   - raise_dispute now requires STATUS_ESCROWED (was STATUS_PENDING)
//     Disputes only make sense after funds are locked in escrow.
//   - arbiter_resolve: allows arbiter to release funds OR refund without timeout restriction
//
// Dependencies: credits.aleo (network)

import credits.aleo;

program zk_invoice_v4_2.aleo {

    @noupgrade
    async constructor() {}

    // ========= Constants =========
    const STATUS_PENDING: u8 = 0u8;
    const STATUS_PAID: u8 = 1u8;
    const STATUS_CANCELLED: u8 = 2u8;
    const STATUS_EXPIRED: u8 = 3u8;
    const STATUS_DISPUTED: u8 = 4u8;
    const STATUS_RESOLVED_CANCELLED: u8 = 5u8;
    const STATUS_RESOLVED_PAID: u8 = 6u8;
    const STATUS_ESCROWED: u8 = 7u8;
    const STATUS_REFUNDED: u8 = 8u8;

    const DISPUTE_OPEN: u8 = 0u8;
    const DISPUTE_RESOLVED_CANCEL: u8 = 1u8;
    const DISPUTE_RESOLVED_PAY: u8 = 2u8;

    const ESCROW_LOCKED: u8 = 0u8;
    const ESCROW_RELEASED: u8 = 1u8;
    const ESCROW_REFUNDED: u8 = 2u8;

    const ARBITER_RELEASE: u8 = 1u8;
    const ARBITER_REFUND: u8 = 2u8;

    const MAX_INVOICE_AMOUNT: u64 = 1000000000000000u64;

    const BLOCKS_PER_DAY: u32 = 17280u32;
    const MAX_DISPUTE_WINDOW_BLOCKS: u32 = 1036800u32;

    // ========= Structs =========
    struct DisputeData {
        invoice_id: field,
        disputant: address,
        arbiter: address,
        reason_hash: field,
        evidence_hash: field,
        created_at: u32,
        resolution_deadline: u32
    }

    struct EscrowData {
        invoice_id: field,
        payer: address,
        payee: address,
        amount: u64,
        delivery_deadline: u32,
        arbiter: address
    }

    struct PaymentCommitData {
        invoice_id: field,
        amount: u64,
        nonce: field
    }

    // ========= Records =========
    record DisputeRecord {
        owner: address,
        dispute_id: field,
        invoice_id: field,
        disputant: address,
        arbiter: address,
        reason_hash: field,
        evidence_hash: field,
        status: u8,
        created_at: u32,
        resolution_deadline: u32
    }

    record EscrowRecord {
        owner: address,
        escrow_id: field,
        invoice_id: field,
        payer: address,
        payee: address,
        amount: u64,
        currency_flag: u8,
        delivery_deadline: u32,
        arbiter: address,
        status: u8
    }

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

    // ========= Public Mappings =========
    mapping dispute_registry: field => field;
    mapping dispute_status: field => u8;
    mapping dispute_resolution: field => field;

    mapping escrow_registry: field => field;
    mapping escrow_status: field => u8;
    mapping escrow_balances: field => u64;

    mapping invoice_status: field => u8;
    mapping payment_commitments: field => field;

    // ========= Dispute Transitions =========

    async transition raise_dispute(
        invoice_id: field,
        invoice_status_val: u8,
        buyer: address,
        seller: address,
        arbiter: address,
        reason_hash: field,
        evidence_hash: field,
        current_time: u32,
        resolution_deadline: u32
    ) -> (DisputeRecord, DisputeRecord, DisputeRecord, Future) {
        let caller: address = self.caller;
        assert_eq(caller, buyer);
        assert_eq(invoice_status_val, STATUS_ESCROWED);
        assert(resolution_deadline > current_time);

        let dispute_data: DisputeData = DisputeData {
            invoice_id: invoice_id,
            disputant: caller,
            arbiter: arbiter,
            reason_hash: reason_hash,
            evidence_hash: evidence_hash,
            created_at: current_time,
            resolution_deadline: resolution_deadline
        };
        let dispute_id: field = BHP256::hash_to_field(dispute_data);

        let disputant_record: DisputeRecord = DisputeRecord {
            owner: caller,
            dispute_id: dispute_id,
            invoice_id: invoice_id,
            disputant: caller,
            arbiter: arbiter,
            reason_hash: reason_hash,
            evidence_hash: evidence_hash,
            status: DISPUTE_OPEN,
            created_at: current_time,
            resolution_deadline: resolution_deadline
        };

        let seller_record: DisputeRecord = DisputeRecord {
            owner: seller,
            dispute_id: dispute_id,
            invoice_id: invoice_id,
            disputant: caller,
            arbiter: arbiter,
            reason_hash: reason_hash,
            evidence_hash: evidence_hash,
            status: DISPUTE_OPEN,
            created_at: current_time,
            resolution_deadline: resolution_deadline
        };

        let arbiter_record: DisputeRecord = DisputeRecord {
            owner: arbiter,
            dispute_id: dispute_id,
            invoice_id: invoice_id,
            disputant: caller,
            arbiter: arbiter,
            reason_hash: reason_hash,
            evidence_hash: evidence_hash,
            status: DISPUTE_OPEN,
            created_at: current_time,
            resolution_deadline: resolution_deadline
        };

        return (
            disputant_record,
            seller_record,
            arbiter_record,
            finalize_raise_dispute(invoice_id, dispute_id)
        );
    }

    async function finalize_raise_dispute(
        public invoice_id: field,
        public dispute_id: field
    ) {
        let current: u8 = Mapping::get_or_use(invoice_status, invoice_id, STATUS_PENDING);
        assert_eq(current, STATUS_ESCROWED);
        assert(block.height > 0u32);
        Mapping::set(invoice_status, invoice_id, STATUS_DISPUTED);
        Mapping::set(dispute_registry, invoice_id, dispute_id);
        Mapping::set(dispute_status, dispute_id, DISPUTE_OPEN);
    }

    async transition resolve_dispute(
        dispute: DisputeRecord,
        resolution: u8,
        resolution_hash: field
    ) -> Future {
        let caller: address = self.caller;
        assert_eq(caller, dispute.arbiter);
        assert_eq(dispute.status, DISPUTE_OPEN);
        assert(resolution == DISPUTE_RESOLVED_CANCEL || resolution == DISPUTE_RESOLVED_PAY);

        let new_invoice_status: u8 = resolution == DISPUTE_RESOLVED_PAY ? STATUS_RESOLVED_PAID : STATUS_RESOLVED_CANCELLED;

        return finalize_resolve_dispute(
            dispute.dispute_id,
            dispute.invoice_id,
            resolution,
            new_invoice_status,
            resolution_hash
        );
    }

    async function finalize_resolve_dispute(
        public dispute_id: field,
        public invoice_id: field,
        public resolution: u8,
        public new_invoice_status: u8,
        public resolution_hash: field
    ) {
        let current: u8 = Mapping::get_or_use(dispute_status, dispute_id, DISPUTE_OPEN);
        assert_eq(current, DISPUTE_OPEN);
        Mapping::set(dispute_status, dispute_id, resolution);
        Mapping::set(invoice_status, invoice_id, new_invoice_status);
        Mapping::set(dispute_resolution, dispute_id, resolution_hash);
    }

    async transition submit_evidence(
        dispute: DisputeRecord,
        new_evidence_hash: field
    ) -> (DisputeRecord, Future) {
        let caller: address = self.caller;
        assert(caller == dispute.disputant || caller == dispute.arbiter);
        assert_eq(dispute.status, DISPUTE_OPEN);

        let updated: DisputeRecord = DisputeRecord {
            owner: caller,
            dispute_id: dispute.dispute_id,
            invoice_id: dispute.invoice_id,
            disputant: dispute.disputant,
            arbiter: dispute.arbiter,
            reason_hash: dispute.reason_hash,
            evidence_hash: new_evidence_hash,
            status: DISPUTE_OPEN,
            created_at: dispute.created_at,
            resolution_deadline: dispute.resolution_deadline
        };

        return (updated, finalize_submit_evidence(dispute.dispute_id));
    }

    async function finalize_submit_evidence(public dispute_id: field) {
        let current: u8 = Mapping::get_or_use(dispute_status, dispute_id, DISPUTE_OPEN);
        assert_eq(current, DISPUTE_OPEN);
    }

    // ========= Escrow Transitions =========

    async transition escrow_payment_credits(
        pay_record: credits.aleo/credits,
        invoice_id: field,
        invoice_seller: address,
        invoice_amount: u64,
        delivery_deadline: u32,
        arbiter: address,
        current_time: u32
    ) -> (credits.aleo/credits, EscrowRecord, EscrowRecord, Future) {
        let payer: address = self.caller;
        assert(invoice_amount > 0u64);
        assert(invoice_amount <= MAX_INVOICE_AMOUNT);
        assert(delivery_deadline > current_time);

        let (change_credits, deposit_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(pay_record, self.address, invoice_amount);

        let escrow_data: EscrowData = EscrowData {
            invoice_id: invoice_id,
            payer: payer,
            payee: invoice_seller,
            amount: invoice_amount,
            delivery_deadline: delivery_deadline,
            arbiter: arbiter
        };
        let escrow_id: field = BHP256::hash_to_field(escrow_data);

        let payer_escrow: EscrowRecord = EscrowRecord {
            owner: payer,
            escrow_id: escrow_id,
            invoice_id: invoice_id,
            payer: payer,
            payee: invoice_seller,
            amount: invoice_amount,
            currency_flag: 0u8,
            delivery_deadline: delivery_deadline,
            arbiter: arbiter,
            status: ESCROW_LOCKED
        };

        let payee_escrow: EscrowRecord = EscrowRecord {
            owner: invoice_seller,
            escrow_id: escrow_id,
            invoice_id: invoice_id,
            payer: payer,
            payee: invoice_seller,
            amount: invoice_amount,
            currency_flag: 0u8,
            delivery_deadline: delivery_deadline,
            arbiter: arbiter,
            status: ESCROW_LOCKED
        };

        return (
            change_credits,
            payer_escrow,
            payee_escrow,
            finalize_escrow_payment(deposit_future, invoice_id, escrow_id, invoice_amount)
        );
    }

    async function finalize_escrow_payment(
        deposit_future: Future,
        public invoice_id: field,
        public escrow_id: field,
        public amount: u64
    ) {
        deposit_future.await();
        Mapping::set(invoice_status, invoice_id, STATUS_ESCROWED);
        Mapping::set(escrow_registry, invoice_id, escrow_id);
        Mapping::set(escrow_status, escrow_id, ESCROW_LOCKED);
        Mapping::set(escrow_balances, escrow_id, amount);
    }

    async transition confirm_delivery(
        escrow: EscrowRecord,
        payment_nonce: field,
        paid_at: u32
    ) -> (credits.aleo/credits, PaymentRecord, Future) {
        let caller: address = self.caller;
        assert(caller == escrow.payer || caller == escrow.arbiter);
        assert_eq(escrow.status, ESCROW_LOCKED);

        let (seller_credits, release_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(escrow.payee, escrow.amount);

        let commit_data: PaymentCommitData = PaymentCommitData {
            invoice_id: escrow.invoice_id,
            amount: escrow.amount,
            nonce: payment_nonce
        };
        let commitment: field = BHP256::hash_to_field(commit_data);
        let payment_id: field = BHP256::hash_to_field(escrow.invoice_id);

        let receipt: PaymentRecord = PaymentRecord {
            owner: escrow.payer,
            payment_id: payment_id,
            invoice_id: escrow.invoice_id,
            payer: escrow.payer,
            payee: escrow.payee,
            amount: escrow.amount,
            paid_at: paid_at,
            settlement_anchor: commitment
        };

        return (
            seller_credits,
            receipt,
            finalize_confirm_delivery(release_future, escrow.invoice_id, escrow.escrow_id, commitment)
        );
    }

    async function finalize_confirm_delivery(
        release_future: Future,
        public invoice_id: field,
        public escrow_id: field,
        public commitment: field
    ) {
        release_future.await();
        let current: u8 = Mapping::get_or_use(escrow_status, escrow_id, ESCROW_LOCKED);
        assert_eq(current, ESCROW_LOCKED);
        Mapping::set(escrow_status, escrow_id, ESCROW_RELEASED);
        Mapping::set(escrow_balances, escrow_id, 0u64);
        Mapping::set(invoice_status, invoice_id, STATUS_PAID);
        Mapping::set(payment_commitments, commitment, invoice_id);
    }

    async transition timeout_refund(
        escrow: EscrowRecord,
        current_time: u32
    ) -> (credits.aleo/credits, Future) {
        let caller: address = self.caller;
        assert(caller == escrow.payer || caller == escrow.arbiter);
        assert_eq(escrow.status, ESCROW_LOCKED);
        assert(current_time > escrow.delivery_deadline);

        let (refund_credits, refund_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(escrow.payer, escrow.amount);

        return (
            refund_credits,
            finalize_timeout_refund(refund_future, escrow.invoice_id, escrow.escrow_id, escrow.delivery_deadline)
        );
    }

    async function finalize_timeout_refund(
        refund_future: Future,
        public invoice_id: field,
        public escrow_id: field,
        public delivery_deadline: u32
    ) {
        refund_future.await();
        let current: u8 = Mapping::get_or_use(escrow_status, escrow_id, ESCROW_LOCKED);
        assert_eq(current, ESCROW_LOCKED);
        let deadline_block: u32 = delivery_deadline / 5u32;
        assert(block.height > deadline_block);
        Mapping::set(escrow_status, escrow_id, ESCROW_REFUNDED);
        Mapping::set(escrow_balances, escrow_id, 0u64);
        Mapping::set(invoice_status, invoice_id, STATUS_REFUNDED);
    }

    // ========= Arbiter Resolution (NEW in v4.1) =========
    //
    // Allows the arbiter to resolve an escrow at ANY time (no timeout required).
    //   decision = ARBITER_RELEASE (1) → release funds to seller (payee)
    //   decision = ARBITER_REFUND  (2) → refund funds to buyer  (payer)
    //
    // Only the designated arbiter can call this. The payer/payee cannot.
    // This is the core decentralization advantage: funds are locked in the
    // contract, and the arbiter's decision is automatically enforced on-chain.
    // Neither party can block or delay the resolution.

    async transition arbiter_resolve(
        escrow: EscrowRecord,
        decision: u8,
        resolution_nonce: field,
        resolved_at: u32
    ) -> (credits.aleo/credits, Future) {
        let caller: address = self.caller;
        // ONLY the arbiter can call this — not payer, not payee
        assert_eq(caller, escrow.arbiter);
        assert_eq(escrow.status, ESCROW_LOCKED);
        assert(decision == ARBITER_RELEASE || decision == ARBITER_REFUND);

        // Determine the recipient based on the decision
        let recipient: address = decision == ARBITER_RELEASE ? escrow.payee : escrow.payer;

        let (out_credits, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(recipient, escrow.amount);

        let new_escrow_status: u8 = decision == ARBITER_RELEASE ? ESCROW_RELEASED : ESCROW_REFUNDED;
        let new_invoice_status: u8 = decision == ARBITER_RELEASE ? STATUS_PAID : STATUS_REFUNDED;

        return (
            out_credits,
            finalize_arbiter_resolve(
                transfer_future,
                escrow.invoice_id,
                escrow.escrow_id,
                new_escrow_status,
                new_invoice_status
            )
        );
    }

    async function finalize_arbiter_resolve(
        transfer_future: Future,
        public invoice_id: field,
        public escrow_id: field,
        public new_escrow_status: u8,
        public new_invoice_status: u8
    ) {
        transfer_future.await();
        let current: u8 = Mapping::get_or_use(escrow_status, escrow_id, ESCROW_LOCKED);
        assert_eq(current, ESCROW_LOCKED);
        Mapping::set(escrow_status, escrow_id, new_escrow_status);
        Mapping::set(escrow_balances, escrow_id, 0u64);
        Mapping::set(invoice_status, invoice_id, new_invoice_status);
    }
}
