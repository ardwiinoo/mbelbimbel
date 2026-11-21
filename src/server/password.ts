import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

// scrypt bawaan Node: tanpa dependency native (aman untuk node:22-alpine).
const N = 16384;
const r = 8;
const p = 1;
const KEYLEN = 64;

function scrypt(pw: string, salt: Buffer, keylen: number, opts: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) =>
    scryptCb(pw, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** Format: scrypt$N$r$p$<salt base64>$<hash base64> */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r, p });
  return ["scrypt", N, r, p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string) {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, rr, pp, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(rr),
    p: Number(pp),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Hash palsu untuk menyamakan waktu respons saat email tidak terdaftar. */
let dummy: string | null = null;
export async function dummyVerify(password: string) {
  dummy ??= await hashPassword("dummy-password-untuk-timing");
  await verifyPassword(password, dummy);
}
