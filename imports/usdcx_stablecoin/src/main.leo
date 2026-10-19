// Stub for usdcx_stablecoin.aleo — used when the network program is unavailable (e.g. local build).
// Real interface: verify transfer_from_public(owner, recipient, amount) on aleo.org/usdcx or Provable Explorer.
// Approve is done by the frontend separately; this transition is called by the invoice program as approved spender.

program usdcx_stablecoin.aleo {
    async transition transfer_from_public(owner: address, recipient: address, amount: u64) -> Future {
        return finalize_transfer_from_public(owner, recipient, amount);
    }

    async function finalize_transfer_from_public(
        public owner: address,
        public recipient: address,
        public amount: u64
    ) {
        // Stub: no mappings. Real program deducts from owner and adds to recipient per allowance.
    }
}
