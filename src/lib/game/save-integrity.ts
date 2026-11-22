// @ts-nocheck -- hand-rolled SHA-256 uses fixed-size typed arrays; indices are always in range.
/**
 * Tamper-evident save envelopes. Saves are stored as {"crosianSave":1,"sig":<hex>,"data":<json string>}
 * where sig = SHA-256(secret + data). Any manual edit to `data` breaks the signature and the save is rejected.
 * Browser-safe, synchronous and dependency-free so load/save stay in the existing event handlers.
 * Note: an offline game cannot hide its key completely; this blocks casual edits, not determined reverse engineering.
 */
const SECRET = 'crosian-games:president-rise-to-power:7f3c9a1e5b';
/** Device flag: once a signed save has been written, unsigned saves are no longer accepted on this device. */
export const INTEGRITY_FLAG_KEY = 'crosian-save-integrity-v1';

const K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);

export function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const len = bytes.length;
  const total = (((len + 9) + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(bytes); buf[len] = 0x80;
  const bits = len * 8;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor(bits / 0x100000000)); view.setUint32(total - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i-15], 7) ^ rotr(w[i-15], 18) ^ (w[i-15] >>> 3);
      const s1 = rotr(w[i-2], 17) ^ rotr(w[i-2], 19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return Array.from(h, x => x.toString(16).padStart(8, '0')).join('');
}

const sign = (data: string) => sha256Hex(`${SECRET}|${data}|${SECRET.length}`);

/** Wrap a JSON save string in a signed envelope. */
export function sealSave(json: string): string {
  return JSON.stringify({ crosianSave: 1, sig: sign(json), data: json });
}

export type OpenResult = { status: 'signed' | 'unsigned'; data: string } | { status: 'tampered' | 'empty' };

/** Verify a stored save. Signed saves return their inner JSON; edited ones are reported as tampered. */
export function openSave(raw: string | null): OpenResult {
  if (!raw) return { status: 'empty' };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { status: 'tampered' }; }
  if (parsed && typeof parsed === 'object' && 'crosianSave' in parsed) {
    const env = parsed as { sig?: unknown; data?: unknown };
    if (typeof env.sig !== 'string' || typeof env.data !== 'string') return { status: 'tampered' };
    return sign(env.data) === env.sig ? { status: 'signed', data: env.data } : { status: 'tampered' };
  }
  return { status: 'unsigned', data: raw };
}

/** Read a save; unsigned legacy saves are accepted only until this device has written a signed one. */
export function readVerified(storage: Pick<Storage, 'getItem'>, key: string): { data: string | null; tampered: boolean } {
  const r = openSave(storage.getItem(key));
  if (r.status === 'signed') return { data: r.data, tampered: false };
  if (r.status === 'unsigned') return storage.getItem(INTEGRITY_FLAG_KEY) ? { data: null, tampered: true } : { data: r.data, tampered: false };
  return { data: null, tampered: r.status === 'tampered' };
}

export function writeSigned(storage: Pick<Storage, 'setItem'>, key: string, json: string) {
  storage.setItem(key, sealSave(json));
  storage.setItem(INTEGRITY_FLAG_KEY, '1');
}
