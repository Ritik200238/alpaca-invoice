program pingdemo123.aleo;

function ping:
    output 1u8 as u8.private;

constructor:
    assert.eq edition 0u16;
