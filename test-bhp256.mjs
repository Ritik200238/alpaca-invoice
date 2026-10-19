const sdk = await import('@provablehq/sdk');

const addr = sdk.Address.from_string('aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz15mn7vh8zmsvhq9m5q2y6gggasc');
console.log('Address bits len:', addr.toBitsLe().length);

const bits = [
  ...addr.toBitsLe(),
  ...addr.toBitsLe(),
  ...sdk.U64.fromString('1000000u64').toBitsLe(),
  ...sdk.U64.fromString('0u64').toBitsLe(),
  ...sdk.U32.fromString('1700000000u32').toBitsLe(),
  ...sdk.Field.fromString('12345field').toBitsLe(),
  ...sdk.Field.fromString('1field').toBitsLe(),
  ...sdk.Field.fromString('1field').toBitsLe(),
  ...sdk.Field.fromString('1field').toBitsLe(),
  ...sdk.Field.fromString('1field').toBitsLe(),
];
console.log('Total bits:', bits.length);

const h = new sdk.BHP256();
const result = h.hash(bits);
console.log('BHP256 hash:', result.toString());
