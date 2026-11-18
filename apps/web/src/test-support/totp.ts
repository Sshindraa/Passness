import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** TOTP RFC 6238 (SHA-1, 6 chiffres, 30 s) à partir d'une URI `otpauth://`. Tests uniquement. */
export function totpFromUri(uri: string, now = Date.now()): string {
  const secret = new URL(uri).searchParams.get('secret') ?? '';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) {
    bits += BASE32.indexOf(c).toString(2).padStart(5, '0');
  }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = (h[h.length - 1] ?? 0) & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
