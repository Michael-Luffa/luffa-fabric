import { createHash } from "node:crypto";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G: Point = {
  x: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  y: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
};

type Point = { x: bigint; y: bigint };
type MaybePoint = Point | undefined;

export function evmAddressFromSecret(signingSecret: string): string {
  const publicKey = pointMultiply(G, secretToScalar(signingSecret));
  if (!publicKey) {
    throw new Error("Invalid EVM fixture key");
  }
  const hash = keccak_256(concatBytes(toBytes(publicKey.x, 32), toBytes(publicKey.y, 32)));
  return `0x${bytesToHex(hash.slice(-20))}`;
}

export function signEthereumMessage(message: string, signingSecret: string): string {
  const d = secretToScalar(signingSecret);
  const hash = ethereumMessageHash(message);
  const z = bytesToBigInt(hash);
  let k = deterministicNonce(signingSecret, hash);

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const point = pointMultiply(G, k);
    if (!point) {
      k = mod(k + 1n, N);
      continue;
    }

    const r = mod(point.x, N);
    if (r === 0n) {
      k = mod(k + 1n, N);
      continue;
    }

    let s = mod(invert(k, N) * (z + r * d), N);
    if (s === 0n) {
      k = mod(k + 1n, N);
      continue;
    }

    let recovery = Number(point.y & 1n) | (point.x >= N ? 2 : 0);
    if (s > N / 2n) {
      s = N - s;
      recovery ^= 1;
    }

    return `0x${bytesToHex(toBytes(r, 32))}${bytesToHex(toBytes(s, 32))}${(27 + recovery)
      .toString(16)
      .padStart(2, "0")}`;
  }

  throw new Error("Unable to sign EVM message fixture");
}

function ethereumMessageHash(message: string): Uint8Array {
  const messageBytes = utf8ToBytes(message);
  const prefix = utf8ToBytes(`\x19Ethereum Signed Message:\n${messageBytes.length}`);
  return keccak_256(concatBytes(prefix, messageBytes));
}

function secretToScalar(signingSecret: string): bigint {
  const value = bytesToBigInt(hexToBytes(stripHex(signingSecret)));
  if (value <= 0n || value >= N) {
    throw new Error("Invalid secp256k1 private key");
  }
  return value;
}

function deterministicNonce(signingSecret: string, hash: Uint8Array): bigint {
  const digest = createHash("sha256")
    .update(stripHex(signingSecret))
    .update(bytesToHex(hash))
    .digest("hex");
  const value = mod(BigInt(`0x${digest}`), N - 1n) + 1n;
  return value;
}

function pointAdd(a: MaybePoint, b: MaybePoint): MaybePoint {
  if (!a) return b;
  if (!b) return a;
  if (a.x === b.x) {
    if (modP(a.y + b.y) === 0n) {
      return undefined;
    }
    return pointDouble(a);
  }

  const slope = modP((b.y - a.y) * invert(b.x - a.x, P));
  const x = modP(slope * slope - a.x - b.x);
  const y = modP(slope * (a.x - x) - a.y);
  return { x, y };
}

function pointDouble(point: Point): MaybePoint {
  if (point.y === 0n) {
    return undefined;
  }
  const slope = modP(3n * point.x * point.x * invert(2n * point.y, P));
  const x = modP(slope * slope - 2n * point.x);
  const y = modP(slope * (point.x - x) - point.y);
  return { x, y };
}

function pointMultiply(point: Point, scalar: bigint): MaybePoint {
  let n = mod(scalar, N);
  let result: MaybePoint;
  let addend: MaybePoint = point;

  while (n > 0n) {
    if (n & 1n) {
      result = pointAdd(result, addend);
    }
    addend = addend ? pointDouble(addend) : undefined;
    n >>= 1n;
  }

  return result;
}

function invert(value: bigint, modulo: bigint): bigint {
  let a = mod(value, modulo);
  let b = modulo;
  let x = 0n;
  let y = 1n;
  let u = 1n;
  let v = 0n;

  while (a !== 0n) {
    const q = b / a;
    const r = b % a;
    const m = x - u * q;
    const n = y - v * q;
    b = a;
    a = r;
    x = u;
    y = v;
    u = m;
    v = n;
  }

  if (b !== 1n) {
    throw new Error("Inverse does not exist");
  }
  return mod(x, modulo);
}

function modP(value: bigint): bigint {
  return mod(value, P);
}

function mod(value: bigint, modulo: bigint): bigint {
  const result = value % modulo;
  return result >= 0n ? result : result + modulo;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt(`0x${bytesToHex(bytes) || "0"}`);
}

function toBytes(value: bigint, length: number): Uint8Array {
  return hexToBytes(value.toString(16).padStart(length * 2, "0"));
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const length = arrays.reduce((total, array) => total + array.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}

function stripHex(value: string): string {
  return value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
}
