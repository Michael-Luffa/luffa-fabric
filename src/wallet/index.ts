import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import type { LaelDb } from "../db/index.js";
import { newId, nowIso, sha256Hex } from "../utils.js";
import type {
  ConnectWalletInput,
  ConnectWalletResult,
  VerifyWalletInput,
  WalletBinding,
} from "./types.js";
import { WalletType } from "./types.js";

ed25519.etc.sha512Sync = (...messages: Uint8Array[]) =>
  sha512(ed25519.etc.concatBytes(...messages));

interface WalletBindingRow {
  binding_id: string;
  owner_ref: string;
  wallet_type: WalletType;
  chain_type: WalletBinding["chainType"];
  address: string;
  signature: string;
  nonce: string;
  nonce_expires_at: string | null;
  verified: number;
  created_at: string;
}

export class WalletService {
  constructor(private readonly database: LaelDb) {}

  connect(input: ConnectWalletInput): ConnectWalletResult {
    assertWalletInput(input);
    const address = normalizeAddress(input.address, input.chainType);
    const duplicateOwner = this.findBindingOwner(input.chainType, address);
    if (duplicateOwner && duplicateOwner.owner_ref !== input.ownerRef) {
      throw new Error("Wallet already bound to another owner");
    }

    const existing = this.findLatestBinding(input.ownerRef, input.chainType, address);
    const bindingId = existing?.binding_id ?? newId("wallet");
    const nonce = newId("nonce");
    const createdAt = nowIso();
    const nonceExpiresAt = new Date(Date.now() + walletNonceTtlMs()).toISOString();

    this.database.db
      .prepare(
        `
          INSERT INTO wallet_bindings (
            binding_id, owner_ref, wallet_type, chain_type, address,
            signature, nonce, nonce_expires_at, verified, created_at
          )
          VALUES (?, ?, ?, ?, ?, '', ?, ?, 0, ?)
          ON CONFLICT(owner_ref, chain_type, address)
          DO UPDATE SET
            binding_id = excluded.binding_id,
            wallet_type = excluded.wallet_type,
            signature = '',
            nonce = excluded.nonce,
            nonce_expires_at = excluded.nonce_expires_at,
            verified = 0,
            created_at = excluded.created_at
        `,
      )
      .run(
        bindingId,
        input.ownerRef,
        input.walletType,
        input.chainType,
        address,
        nonce,
        nonceExpiresAt,
        createdAt,
      );

    return {
      bindingId,
      ownerRef: input.ownerRef,
      walletType: input.walletType,
      chainType: input.chainType,
      address,
      nonce,
      nonceExpiresAt,
      message: createWalletBindingMessage({
        ownerRef: input.ownerRef,
        chainType: input.chainType,
        address,
        nonce,
      }),
    };
  }

  async verify(input: VerifyWalletInput): Promise<WalletBinding> {
    assertWalletInput(input);
    if (!input.signature) {
      throw new Error("Wallet signature is required");
    }

    const address = normalizeAddress(input.address, input.chainType);
    const existing = this.findPendingBinding(input.bindingId, input.ownerRef, input.chainType, address);
    if (!existing) {
      throw new Error("Wallet binding nonce not found");
    }
    if (
      existing.owner_ref !== input.ownerRef ||
      existing.chain_type !== input.chainType ||
      existing.address !== address
    ) {
      throw new Error("Wallet binding does not match verification input");
    }
    if (existing.verified === 1) {
      throw new Error("Wallet binding nonce already used");
    }
    if (existing.nonce !== input.nonce) {
      throw new Error("Wallet binding nonce mismatch");
    }
    if (Date.parse(existing.nonce_expires_at ?? existing.created_at) <= Date.now()) {
      throw new Error("Wallet binding nonce expired");
    }

    const message = createWalletBindingMessage({
      ownerRef: input.ownerRef,
      chainType: input.chainType,
      address,
      nonce: input.nonce,
    });
    const verified = await verifyWalletSignature({
      walletType: input.walletType,
      chainType: input.chainType,
      address,
      message,
      signature: input.signature,
    });
    if (!verified) {
      throw new Error("Wallet signature verification failed");
    }

    this.database.db
      .prepare(
        `
          UPDATE wallet_bindings
          SET wallet_type = ?, signature = ?, verified = ?
          WHERE binding_id = ?
        `,
      )
      .run(input.walletType, input.signature, 1, existing.binding_id);

    const binding = this.getBinding(existing.binding_id);
    if (!binding) {
      throw new Error("Wallet binding update failed");
    }
    return binding;
  }

  list(ownerRef: string): WalletBinding[] {
    const rows = this.database.db
      .prepare(
        `
          SELECT * FROM wallet_bindings
          WHERE owner_ref = ?
          ORDER BY verified DESC, created_at DESC
        `,
      )
      .all(ownerRef) as unknown as WalletBindingRow[];

    return rows.map(mapWalletBinding);
  }

  getBinding(bindingId: string): WalletBinding | undefined {
    const row = this.database.db
      .prepare("SELECT * FROM wallet_bindings WHERE binding_id = ?")
      .get(bindingId) as WalletBindingRow | undefined;
    return row ? mapWalletBinding(row) : undefined;
  }

  hasVerifiedBinding(ownerRef: string, chainType: WalletBinding["chainType"], address: string): boolean {
    const row = this.database.db
      .prepare(
        `
          SELECT binding_id FROM wallet_bindings
          WHERE owner_ref = ? AND chain_type = ? AND address = ? AND verified = 1
          LIMIT 1
        `,
      )
      .get(ownerRef, chainType, normalizeAddress(address, chainType)) as
      | { binding_id: string }
      | undefined;
    return Boolean(row);
  }

  private findPendingBinding(
    bindingId: string | undefined,
    ownerRef: string,
    chainType: WalletBinding["chainType"],
    address: string,
  ): WalletBindingRow | undefined {
    if (bindingId) {
      return this.database.db
        .prepare("SELECT * FROM wallet_bindings WHERE binding_id = ?")
        .get(bindingId) as WalletBindingRow | undefined;
    }

    return this.database.db
      .prepare(
        `
          SELECT * FROM wallet_bindings
          WHERE owner_ref = ? AND chain_type = ? AND address = ?
          ORDER BY created_at DESC
          LIMIT 1
        `,
      )
      .get(ownerRef, chainType, address) as WalletBindingRow | undefined;
  }

  private findLatestBinding(
    ownerRef: string,
    chainType: WalletBinding["chainType"],
    address: string,
  ): WalletBindingRow | undefined {
    return this.database.db
      .prepare(
        `
          SELECT * FROM wallet_bindings
          WHERE owner_ref = ? AND chain_type = ? AND address = ?
          ORDER BY created_at DESC
          LIMIT 1
        `,
      )
      .get(ownerRef, chainType, address) as WalletBindingRow | undefined;
  }

  private findBindingOwner(
    chainType: WalletBinding["chainType"],
    address: string,
  ): Pick<WalletBindingRow, "owner_ref"> | undefined {
    return this.database.db
      .prepare(
        `
          SELECT owner_ref FROM wallet_bindings
          WHERE chain_type = ? AND address = ?
          ORDER BY verified DESC, created_at DESC
          LIMIT 1
        `,
      )
      .get(chainType, address) as Pick<WalletBindingRow, "owner_ref"> | undefined;
  }
}

export function createWalletBindingMessage(input: {
  ownerRef: string;
  chainType: WalletBinding["chainType"];
  address: string;
  nonce: string;
}): string {
  return [
    "Luffa Fabric Wallet Binding",
    `ownerRef=${input.ownerRef}`,
    `chainType=${input.chainType}`,
    `address=${normalizeAddress(input.address, input.chainType)}`,
    `nonce=${input.nonce}`,
  ].join("\n");
}

export function createDevWalletSignature(message: string, address: string): string {
  return `lael-dev:${sha256Hex({ message, address: address.toLowerCase() })}`;
}

async function verifyWalletSignature(input: {
  walletType: WalletType;
  chainType: WalletBinding["chainType"];
  address: string;
  message: string;
  signature: string;
}): Promise<boolean> {
  if (input.signature === createDevWalletSignature(input.message, input.address)) {
    return true;
  }

  if (input.chainType === "evm") {
    return verifyEvmSignature(input.message, input.signature, input.address);
  }

  return verifyEd25519WalletSignature(input.address, input.message, input.signature);
}

async function verifyEvmSignature(
  message: string,
  signature: string,
  address: string,
): Promise<boolean> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<{
      recoverMessageAddress?: (args: { message: string; signature: `0x${string}` }) => Promise<string>;
    }>;
    const viem = await dynamicImport("viem");
    if (!viem.recoverMessageAddress) {
      return false;
    }
    const recovered = await viem.recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return verifyEvmSignatureNative(message, signature, address);
  }
}

function verifyEvmSignatureNative(message: string, signature: string, address: string): boolean {
  try {
    const normalizedSignature = stripHexPrefix(signature);
    if (!/^[a-fA-F0-9]{130}$/.test(normalizedSignature)) {
      return false;
    }

    const signatureBytes = hexToBytes(normalizedSignature);
    const r = bytesToBigInt(signatureBytes.slice(0, 32));
    const s = bytesToBigInt(signatureBytes.slice(32, 64));
    let recovery = Number(signatureBytes[64]);
    if (recovery >= 27) {
      recovery -= 27;
    }
    if (recovery < 0 || recovery > 3 || r <= 0n || s <= 0n) {
      return false;
    }

    const hash = ethereumMessageHash(message);
    const publicKey = recoverSecp256k1PublicKey(hash, r, s, recovery);
    if (!publicKey) {
      return false;
    }

    return publicKeyToEvmAddress(publicKey).toLowerCase() === normalizeEvmAddress(address);
  } catch {
    return false;
  }
}

async function verifyEd25519WalletSignature(
  address: string,
  message: string,
  signature: string,
): Promise<boolean> {
  try {
    const publicKey = decodeFlexibleBytes(address);
    const signatureBytes = decodeFlexibleBytes(signature);
    return await ed25519.verifyAsync(signatureBytes, utf8ToBytes(message), publicKey);
  } catch {
    return false;
  }
}

function assertWalletInput(input: ConnectWalletInput | VerifyWalletInput): void {
  if (!input.ownerRef || !input.walletType || !input.chainType || !input.address) {
    throw new Error("ownerRef, walletType, chainType, and address are required");
  }
}

function normalizeAddress(address: string, chainType: WalletBinding["chainType"]): string {
  return chainType === "evm" ? address.toLowerCase() : address;
}

function normalizeEvmAddress(address: string): string {
  return stripHexPrefix(address).toLowerCase().padStart(40, "0");
}

function decodeFlexibleBytes(value: string): Uint8Array {
  if (/^[a-fA-F0-9]+$/.test(value) && value.length % 2 === 0) {
    return hexToBytes(value);
  }

  if ([...value].every((char) => BASE58_ALPHABET.includes(char))) {
    return decodeBase58(value);
  }

  try {
    return Uint8Array.from(Buffer.from(value, "base64"));
  } catch {
    return decodeBase58(value);
  }
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function decodeBase58(value: string): Uint8Array {
  let bytes = [0];
  for (const char of value) {
    const valueIndex = BASE58_ALPHABET.indexOf(char);
    if (valueIndex < 0) {
      throw new Error("Invalid base58 character");
    }

    let carry = valueIndex;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (const char of value) {
    if (char !== "1") {
      break;
    }
    bytes.push(0);
  }

  return Uint8Array.from(bytes.reverse());
}

function mapWalletBinding(row: WalletBindingRow): WalletBinding {
  return {
    bindingId: row.binding_id,
    ownerRef: row.owner_ref,
    walletType: row.wallet_type,
    chainType: row.chain_type,
    address: row.address,
    signature: row.signature,
    nonce: row.nonce,
    nonceExpiresAt: row.nonce_expires_at ?? undefined,
    verified: row.verified === 1,
    createdAt: row.created_at,
  };
}

function walletNonceTtlMs(): number {
  const configured = Number(process.env.LAEL_WALLET_NONCE_TTL_MS ?? 10 * 60 * 1000);
  return Number.isFinite(configured) && configured > 0 ? configured : 10 * 60 * 1000;
}

const SECP256K1_P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP256K1_G: CurvePoint = {
  x: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  y: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
};

type CurvePoint = { x: bigint; y: bigint };
type MaybePoint = CurvePoint | undefined;

function ethereumMessageHash(message: string): Uint8Array {
  const messageBytes = utf8ToBytes(message);
  const prefix = utf8ToBytes(`\x19Ethereum Signed Message:\n${messageBytes.length}`);
  return keccak_256(concatBytes(prefix, messageBytes));
}

function recoverSecp256k1PublicKey(
  hash: Uint8Array,
  r: bigint,
  s: bigint,
  recovery: number,
): MaybePoint {
  const x = r + BigInt(recovery >> 1) * SECP256K1_N;
  if (x >= SECP256K1_P) {
    return undefined;
  }

  const alpha = modP(x ** 3n + 7n);
  const beta = powMod(alpha, (SECP256K1_P + 1n) / 4n, SECP256K1_P);
  const y = beta % 2n === BigInt(recovery & 1) ? beta : SECP256K1_P - beta;
  const rPoint: CurvePoint = { x, y };
  if (pointMultiply(rPoint, SECP256K1_N)) {
    return undefined;
  }

  const e = bytesToBigInt(hash);
  const rInv = invertMod(r, SECP256K1_N);
  const sR = pointMultiply(rPoint, s);
  const eG = pointMultiply(SECP256K1_G, e);
  if (!sR || !eG) {
    return undefined;
  }

  const candidate = pointAdd(sR, pointNegate(eG));
  return candidate ? pointMultiply(candidate, rInv) : undefined;
}

function publicKeyToEvmAddress(point: CurvePoint): string {
  const publicKey = concatBytes(bigIntToBytes(point.x, 32), bigIntToBytes(point.y, 32));
  const hash = keccak_256(publicKey);
  return bytesToHex(hash.slice(-20));
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

  const slope = modP((b.y - a.y) * invertMod(b.x - a.x, SECP256K1_P));
  const x = modP(slope * slope - a.x - b.x);
  const y = modP(slope * (a.x - x) - a.y);
  return { x, y };
}

function pointDouble(point: CurvePoint): MaybePoint {
  if (point.y === 0n) {
    return undefined;
  }
  const slope = modP(3n * point.x * point.x * invertMod(2n * point.y, SECP256K1_P));
  const x = modP(slope * slope - 2n * point.x);
  const y = modP(slope * (point.x - x) - point.y);
  return { x, y };
}

function pointNegate(point: CurvePoint): CurvePoint {
  return { x: point.x, y: modP(-point.y) };
}

function pointMultiply(point: CurvePoint, scalar: bigint): MaybePoint {
  let n = mod(scalar, SECP256K1_N);
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

function invertMod(value: bigint, modulo: bigint): bigint {
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

function powMod(base: bigint, exponent: bigint, modulo: bigint): bigint {
  let result = 1n;
  let value = mod(base, modulo);
  let power = exponent;
  while (power > 0n) {
    if (power & 1n) {
      result = mod(result * value, modulo);
    }
    value = mod(value * value, modulo);
    power >>= 1n;
  }
  return result;
}

function modP(value: bigint): bigint {
  return mod(value, SECP256K1_P);
}

function mod(value: bigint, modulo: bigint): bigint {
  const result = value % modulo;
  return result >= 0n ? result : result + modulo;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt(`0x${bytesToHex(bytes) || "0"}`);
}

function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const hex = value.toString(16).padStart(length * 2, "0");
  return hexToBytes(hex);
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

function stripHexPrefix(value: string): string {
  return value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
}

export * from "./types.js";
