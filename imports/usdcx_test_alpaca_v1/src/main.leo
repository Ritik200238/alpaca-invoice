// Testnet USDCx program for Alpaca Invoice (Wave 3).
// Deploy as usdcx_test_alpaca_v1.aleo; provides mint_public (recharge), approve, allowance, transfer_from_public.
// Allowance key = BHP256(AllowanceKey{from, spender}). Spender for transfer_from_public = self.caller (the program
// that invoked this transition, i.e. zk_invoice_v3_0.aleo). No constant needed; frontend getUsdcxAllowance key = same field.

program usdcx_test_alpaca_v1.aleo {
    struct AllowanceKey {
        from: address,
        spender: address
    }

    mapping account: address => u64;
    mapping allowance: field => u64;

    @noupgrade
    async constructor() {}

    async transition mint_public(recipient: address, amount: u64) -> Future {
        return finalize_mint_public(recipient, amount);
    }

    async function finalize_mint_public(public recipient: address, public amount: u64) {
        let current: u64 = Mapping::get_or_use(account, recipient, 0u64);
        Mapping::set(account, recipient, current + amount);
    }

    async transition approve(spender: address, amount: u64) -> Future {
        let key: field = BHP256::hash_to_field(AllowanceKey {
            from: self.caller,
            spender: spender
        });
        return finalize_approve(key, amount);
    }

    async function finalize_approve(public key: field, public amount: u64) {
        Mapping::set(allowance, key, amount);
    }

    async transition transfer_from_public(owner: address, recipient: address, amount: u64) -> Future {
        let key: field = BHP256::hash_to_field(AllowanceKey {
            from: owner,
            spender: self.caller
        });
        return finalize_transfer_from_public(owner, recipient, amount, key);
    }

    async function finalize_transfer_from_public(
        public owner: address,
        public recipient: address,
        public amount: u64,
        public allowance_key: field
    ) {
        let allowed: u64 = Mapping::get_or_use(allowance, allowance_key, 0u64);
        assert(allowed >= amount);
        Mapping::set(allowance, allowance_key, allowed - amount);

        let owner_balance: u64 = Mapping::get_or_use(account, owner, 0u64);
        assert(owner_balance >= amount);
        Mapping::set(account, owner, owner_balance - amount);

        let recipient_balance: u64 = Mapping::get_or_use(account, recipient, 0u64);
        Mapping::set(account, recipient, recipient_balance + amount);
    }
}
