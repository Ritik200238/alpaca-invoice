// zk_credit_v1.aleo — ZK Credit Proof
//
// Allows users to generate zero-knowledge proofs of their payment reliability
// without revealing sensitive transaction data. Third parties can verify claims
// on-chain using the proof_id.

program zk_credit_v1_1.aleo {

    @noupgrade
    async constructor() {}

    // ========= Structs =========
    struct CreditProofInput {
        total_invoices: u64,
        paid_on_time: u64,
        total_paid_amount: u64,
        first_invoice_date: u32,
        dispute_count: u64,
        proof_generated_at: u32
    }

    struct CreditClaim {
        claim_type: u8,
        threshold: u64,
        period_start: u32,
        period_end: u32
    }

    // ========= Records =========
    record CreditProofToken {
        owner: address,
        proof_id: field,
        claim_hash: field,
        data_commitment: field,
        is_valid: bool,
        generated_at: u32,
        expires_at: u32
    }

    // ========= Mappings =========
    mapping credit_proofs: field => field;

    // ========= Transitions =========

    async transition generate_credit_proof(
        input: CreditProofInput,
        claim: CreditClaim,
        validity_days: u32
    ) -> (CreditProofToken, Future) {
        let caller: address = self.caller;

        let claim_hash: field = BHP256::hash_to_field(claim);
        let data_commitment: field = BHP256::hash_to_field(input);

        let is_valid: bool = verify_claim(input, claim);

        let proof_id: field = BHP256::hash_to_field(data_commitment);

        let expires_at: u32 = input.proof_generated_at + (validity_days * 86400u32);

        let token: CreditProofToken = CreditProofToken {
            owner: caller,
            proof_id: proof_id,
            claim_hash: claim_hash,
            data_commitment: data_commitment,
            is_valid: is_valid,
            generated_at: input.proof_generated_at,
            expires_at: expires_at
        };

        return (token, finalize_generate_credit_proof(proof_id, claim_hash));
    }

    async function finalize_generate_credit_proof(
        public proof_id: field,
        public claim_hash: field
    ) {
        Mapping::set(credit_proofs, proof_id, claim_hash);
    }

    function verify_claim(input: CreditProofInput, claim: CreditClaim) -> bool {
        // safe_total: always >= 1 so ZK circuit never divides by zero.
        // Leo evaluates ALL branches regardless of the condition,
        // so early-return guards cannot prevent division; safe_total is the correct pattern.
        let safe_total: u64 = input.total_invoices == 0u64 ? 1u64 : input.total_invoices;

        // claim_type 0: On-time rate (threshold in basis points, e.g. 9000 = 90%)
        if claim.claim_type == 0u8 {
            let rate_bps: u64 = (input.paid_on_time * 10000u64) / safe_total;
            return input.total_invoices > 0u64 && rate_bps >= claim.threshold;
        }

        // claim_type 1: Transaction volume >= threshold
        if claim.claim_type == 1u8 {
            return input.total_invoices >= claim.threshold;
        }

        // claim_type 2: Total paid amount >= threshold
        if claim.claim_type == 2u8 {
            return input.total_paid_amount >= claim.threshold;
        }

        // claim_type 3: Account age >= threshold (in seconds)
        if claim.claim_type == 3u8 {
            let safe_start: u32 = input.first_invoice_date == 0u32 ? input.proof_generated_at : input.first_invoice_date;
            let age: u64 = (input.proof_generated_at - safe_start) as u64;
            return input.first_invoice_date > 0u32 && age >= claim.threshold;
        }

        // claim_type 4: Dispute rate <= threshold (basis points)
        if claim.claim_type == 4u8 {
            let dispute_rate_bps: u64 = (input.dispute_count * 10000u64) / safe_total;
            return input.total_invoices == 0u64 || dispute_rate_bps <= claim.threshold;
        }

        return false;
    }

    async transition verify_credit_claim(proof_id: field) -> Future {
        return finalize_verify_credit_claim(proof_id);
    }

    async function finalize_verify_credit_claim(public proof_id: field) {
        let claim_hash: field = Mapping::get_or_use(credit_proofs, proof_id, 0field);
        assert_neq(claim_hash, 0field);
    }
}
