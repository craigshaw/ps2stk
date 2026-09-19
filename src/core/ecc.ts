// ECC calculation adapted from Ross Ridge's public-domain mymc/ps2mc_ecc.py.
// See THIRD_PARTY_NOTICES.md for provenance.
const parity = Uint8Array.from({ length: 256 }, (_, value) => {
  let result = 0;
  for (; value; value >>>= 1) result ^= value & 1;
  return result;
});
const masks = [0x55, 0x33, 0x0f, 0x00, 0xaa, 0xcc, 0xf0];
const columns = Uint8Array.from({ length: 256 }, (_, value) =>
  masks.reduce((result, mask, bit) => result | (parity[value & mask]! << bit), 0));

/** Twelve ECC bytes for one 512-byte PS2 data page. No error correction. */
export function pageEcc(data: Uint8Array): Uint8Array {
  if (data.length !== 512) throw new RangeError('ECC requires a 512-byte page.');
  const result = new Uint8Array(12);
  for (let chunk = 0; chunk < 4; chunk++) {
    let column = 0x77, line0 = 0x7f, line1 = 0x7f;
    for (let i = 0; i < 128; i++) {
      const value = data[chunk * 128 + i]!;
      column ^= columns[value]!;
      if (parity[value]) { line0 ^= ~i; line1 ^= i; }
    }
    result.set([column, line0 & 0x7f, line1], chunk * 3);
  }
  return result;
}
