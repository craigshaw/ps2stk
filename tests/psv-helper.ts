import { createHmac, createDecipheriv } from 'node:crypto';

/** Independent Node/OpenSSL implementation, not the browser crypto libraries. */
export function psvDigest(bytes: Uint8Array): Buffer {
  const input = new Uint8Array(bytes); input.fill(0, 28, 48);
  const seed = Buffer.alloc(64); seed.set(input.subarray(8, 28));
  const cipher = createDecipheriv('aes-128-cbc', Buffer.from('ea02ceef5bb4d2998f611910d77f51c6', 'hex'), Buffer.from('b30ffeedb7dc5eb7133da60d1b6b2cdc', 'hex'));
  cipher.setAutoPadding(false);
  const key = Buffer.concat([cipher.update(seed), cipher.final()]).subarray(0, 20);
  return createHmac('sha1', key).update(input).digest();
}
