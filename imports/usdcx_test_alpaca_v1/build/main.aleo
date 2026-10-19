program usdcx_test_alpaca_v1.aleo;

struct AllowanceKey:
    from as address;
    spender as address;

mapping account:
    key as address.public;
    value as u64.public;

mapping allowance:
    key as field.public;
    value as u64.public;

function mint_public:
    input r0 as address.private;
    input r1 as u64.private;
    async mint_public r0 r1 into r2;
    output r2 as usdcx_test_alpaca_v1.aleo/mint_public.future;

finalize mint_public:
    input r0 as address.public;
    input r1 as u64.public;
    get.or_use account[r0] 0u64 into r2;
    add r2 r1 into r3;
    set r3 into account[r0];

function approve:
    input r0 as address.private;
    input r1 as u64.private;
    cast self.caller r0 into r2 as AllowanceKey;
    hash.bhp256 r2 into r3 as field;
    async approve r3 r1 into r4;
    output r4 as usdcx_test_alpaca_v1.aleo/approve.future;

finalize approve:
    input r0 as field.public;
    input r1 as u64.public;
    set r1 into allowance[r0];

function transfer_from_public:
    input r0 as address.private;
    input r1 as address.private;
    input r2 as u64.private;
    cast r0 self.caller into r3 as AllowanceKey;
    hash.bhp256 r3 into r4 as field;
    async transfer_from_public r0 r1 r2 r4 into r5;
    output r5 as usdcx_test_alpaca_v1.aleo/transfer_from_public.future;

finalize transfer_from_public:
    input r0 as address.public;
    input r1 as address.public;
    input r2 as u64.public;
    input r3 as field.public;
    get.or_use allowance[r3] 0u64 into r4;
    gte r4 r2 into r5;
    assert.eq r5 true;
    sub r4 r2 into r6;
    set r6 into allowance[r3];
    get.or_use account[r0] 0u64 into r7;
    gte r7 r2 into r8;
    assert.eq r8 true;
    sub r7 r2 into r9;
    set r9 into account[r0];
    get.or_use account[r1] 0u64 into r10;
    add r10 r2 into r11;
    set r11 into account[r1];

constructor:
    assert.eq edition 0u16;
