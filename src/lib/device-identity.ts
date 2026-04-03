/**
 * Device Identity Manager for OpenClaw Gateway Authentication.
 *
 * Generates and persists an Ed25519 keypair using tweetnacl.
 * The deviceId is derived from the hex-encoded public key.
 * Identity is stored in localStorage and reused across sessions.
 *
 * Auth flow:
 * 1. Generate Ed25519 keypair on first use
 * 2. Store keypair + deviceId + deviceToken in localStorage
 * 3. On gateway connect, present deviceId + sign challenge with secret key
 * 4. Gateway returns deviceToken after pairing approval
 * 5. deviceToken cached for subsequent reconnects
 */

import * as nacl from "tweetnacl";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY_DEVICE_IDENTITY = "clawboard_device_identity";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeviceIdentity {
  /** Hex-encoded Ed25519 public key */
  publicKey: string;
  /** Hex-encoded Ed25519 secret key (64 bytes = seed + public key) */
  secretKey: string;
  /** Device ID derived from public key (hex of first 16 bytes) */
  deviceId: string;
  /** Device token issued by gateway after pairing approval (initially empty) */
  deviceToken: string;
  /** Human-readable label for this device */
  deviceLabel: string;
  /** Timestamp when identity was first created */
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert Uint8Array to hex string */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Convert hex string to Uint8Array */
export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Convert Uint8Array to base64url string (no padding) */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Convert base64url string to Uint8Array */
export function fromBase64Url(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(b64.length + (4 - b64.length % 4) % 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Pure-JS SHA-256 (fallback for non-secure HTTP contexts where crypto.subtle is unavailable) */
function sha256Sync(data: Uint8Array): Uint8Array {
  // Based on https://github.com/brillout/forge
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const msg = new Uint8Array(data.length + 72);
  msg.set(data);
  msg[data.length] = 0x80;
  const bitLen = data.length * 8;
  const dv = new DataView(msg.buffer);
  const padLen = ((data.length + 9 + 63) & ~63);
  dv.setUint32(padLen - 4, bitLen >>> 0, false);
  dv.setUint32(padLen - 8, Math.floor(bitLen / 2**32), false);
  const blocks = padLen / 64;
  const w = new Uint32Array(64);
  for (let i = 0; i < blocks; i++) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32((i * 64) + j * 4, false);
    for (let j = 16; j < 64; j++) {
      const s0 = ((w[j-15]>>>7)|(w[j-15]<<25)) ^ ((w[j-15]>>>18)|(w[j-15]<<14)) ^ (w[j-15]>>>3);
      const s1 = ((w[j-2]>>>17)|(w[j-2]<<15)) ^ ((w[j-2]>>>19)|(w[j-2]<<13)) ^ (w[j-2]>>>10);
      w[j] = (w[j-16]+s0+w[j-7]+s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = [h0,h1,h2,h3,h4,h5,h6,h7];
    for (let j = 0; j < 64; j++) {
      const S1 = ((e>>>6)|(e<<26)) ^ ((e>>>11)|(e<<21)) ^ ((e>>>25)|(e<<7));
      const ch = (e&f) ^ (~e&g);
      const temp1 = (h+S1+ch+K[j]+w[j]) >>> 0;
      const S0 = ((a>>>2)|(a<<30)) ^ ((a>>>13)|(a<<19)) ^ ((a>>>22)|(a<<10));
      const maj = (a&b) ^ (a&c) ^ (b&c);
      const temp2 = (S0+maj) >>> 0;
      [h,g,f,e,d,c,b,a] = [g,f,e,(d+temp1)>>>0,c,b,a,(temp1+temp2)>>>0];
    }
    h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0;
    h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  [h0,h1,h2,h3,h4,h5,h6,h7].forEach((v,i) => ov.setUint32(i*4, v, false));
  return out;
}

/** Derive deviceId as sha256(raw_public_key_bytes) in hex — matches OpenClaw server */
async function deriveDeviceId(publicKey: Uint8Array): Promise<string> {
  const exactBytes = new Uint8Array(publicKey);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', exactBytes.buffer as ArrayBuffer);
    return toHex(new Uint8Array(hashBuffer));
  }
  return toHex(sha256Sync(exactBytes));
}

/** Generate a default device label based on browser info */
function generateDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Clawboard Device";
  const ua = navigator.userAgent;
  if (ua.includes("Chrome")) return "Clawboard (Chrome)";
  if (ua.includes("Firefox")) return "Clawboard (Firefox)";
  if (ua.includes("Safari")) return "Clawboard (Safari)";
  if (ua.includes("Edge")) return "Clawboard (Edge)";
  return "Clawboard Device";
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Generate a new Ed25519 keypair and build a DeviceIdentity.
 * publicKey stored as base64url (raw 32 bytes), secretKey as hex.
 * deviceId is computed async as sha256(publicKeyBytes) — call getOrCreateDeviceIdentity() instead.
 */
export async function generateDeviceIdentity(): Promise<DeviceIdentity> {
  const keyPair = nacl.sign.keyPair();
  const deviceId = await deriveDeviceId(keyPair.publicKey);

  return {
    publicKey: toBase64Url(keyPair.publicKey),
    secretKey: toHex(keyPair.secretKey),
    deviceId,
    deviceToken: "",
    deviceLabel: generateDeviceLabel(),
    createdAt: Date.now(),
  };
}

/**
 * Load device identity from localStorage.
 * Returns null if not found or corrupted.
 */
export function loadDeviceIdentity(): DeviceIdentity | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEVICE_IDENTITY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as DeviceIdentity;

    // Validate required fields
    if (
      !parsed.publicKey ||
      !parsed.secretKey ||
      !parsed.deviceId ||
      typeof parsed.createdAt !== "number"
    ) {
      return null;
    }

    // Verify the keypair is still valid
    // publicKey: base64url of 32 bytes (~43 chars) OR legacy hex (64 chars)
    // secretKey: hex of 64 bytes (128 chars)
    const pubLen = parsed.publicKey.length;
    if ((pubLen < 40 || pubLen > 64) || parsed.secretKey.length !== 128) {
      return null;
    }

    return parsed;
  } catch {
    // Corrupted data — will regenerate
    return null;
  }
}

/**
 * Save device identity to localStorage.
 */
export function saveDeviceIdentity(identity: DeviceIdentity): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY_DEVICE_IDENTITY, JSON.stringify(identity));
  } catch {
    // Storage full or unavailable — silently fail
    console.warn("[DeviceIdentity] Failed to save identity to localStorage");
  }
}

/**
 * Get or create device identity.
 * Loads from localStorage if available, otherwise generates a new one and persists it.
 */
export async function getOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  const existing = loadDeviceIdentity();
  if (existing) return existing;

  const identity = await generateDeviceIdentity();
  saveDeviceIdentity(identity);
  return identity;
}

/**
 * Update the device token after gateway pairing approval.
 */
export function updateDeviceToken(token: string): DeviceIdentity | null {
  const identity = loadDeviceIdentity();
  if (!identity) return null;

  identity.deviceToken = token;
  saveDeviceIdentity(identity);
  return identity;
}

/**
 * Clear the stored device identity (for debugging/reset).
 */
export function clearDeviceIdentity(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY_DEVICE_IDENTITY);
  } catch {
    // ignore
  }
}

/**
 * Sign a challenge string with the device's secret key.
 * Used during the gateway authentication handshake.
 *
 * @param challenge - The challenge string from the gateway
 * @param secretKeyHex - Hex-encoded Ed25519 secret key
 * @returns Hex-encoded signature
 */
export function signChallenge(
  challenge: string,
  secretKeyHex: string
): string {
  const secretKey = fromHex(secretKeyHex);
  const messageBytes = new TextEncoder().encode(challenge);
  const signature = nacl.sign.detached(messageBytes, secretKey);
  return toBase64Url(signature);
}

/**
 * Verify a signature (useful for testing).
 *
 * @param challenge - The original challenge string
 * @param signatureHex - Hex-encoded signature
 * @param publicKeyHex - Hex-encoded public key
 * @returns true if signature is valid
 */
export function verifySignature(
  challenge: string,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  const publicKey = fromHex(publicKeyHex);
  const signature = fromHex(signatureHex);
  const messageBytes = new TextEncoder().encode(challenge);
  return nacl.sign.detached.verify(messageBytes, signature, publicKey);
}
