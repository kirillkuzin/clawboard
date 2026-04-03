/**
 * Device Identity Manager for OpenClaw Gateway Authentication.
 *
 * Uses WebCrypto API (SubtleCrypto) for Ed25519 keypair generation and signing.
 * This ensures compatibility with Node.js crypto used by the OpenClaw gateway server.
 *
 * Storage format:
 * - publicKey: base64url (raw 32 bytes)
 * - privateKey: base64url (raw 32-byte seed, NOT the 64-byte nacl secret key)
 * - deviceId: sha256(publicKeyBytes) in hex
 */

const STORAGE_KEY_DEVICE_IDENTITY = "clawboard_device_identity";

export interface DeviceIdentity {
  /** base64url-encoded raw Ed25519 public key (32 bytes) */
  publicKey: string;
  /** base64url-encoded raw Ed25519 private key seed (32 bytes) */
  privateKey: string;
  /** sha256(publicKeyBytes) in hex — matches OpenClaw server fingerprint */
  deviceId: string;
  /** Device token issued by gateway after pairing approval */
  deviceToken: string;
  /** Human-readable label for this device */
  deviceLabel: string;
  /** Timestamp when identity was first created */
  createdAt: number;
  // Legacy fields (ignored but kept for type compat)
  secretKey?: string;
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return bytes;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function fromBase64Url(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    b64.length + (4 - (b64.length % 4)) % 4, "="
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
// WebCrypto helpers
// ---------------------------------------------------------------------------

async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const kp = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  );

  // Export raw public key (32 bytes)
  const pubRaw = await crypto.subtle.exportKey("raw", kp.publicKey);

  // Export private key as PKCS8, then extract the 32-byte seed
  const privPkcs8 = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
  // PKCS8 for Ed25519: 48 bytes total, last 32 bytes are the seed
  const privSeed = new Uint8Array(privPkcs8).slice(-32);

  return {
    publicKey: toBase64Url(new Uint8Array(pubRaw)),
    privateKey: toBase64Url(privSeed),
  };
}

async function computeDeviceId(publicKeyB64url: string): Promise<string> {
  const pubBytes = fromBase64Url(publicKeyB64url);
  const hashBuffer = await crypto.subtle.digest("SHA-256", pubBytes.buffer as ArrayBuffer);
  return toHex(new Uint8Array(hashBuffer));
}

/**
 * Sign a payload string using the Ed25519 private key seed.
 * Returns base64url-encoded signature.
 */
export async function signPayload(payload: string, privateKeyB64url: string): Promise<string> {
  const seedBytes = fromBase64Url(privateKeyB64url);

  // Reconstruct PKCS8 from seed (standard Ed25519 PKCS8 wrapper)
  // Header: 302e020100300506032b657004220420 + 32-byte seed
  const pkcs8Header = new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ]);
  const pkcs8 = new Uint8Array(pkcs8Header.length + seedBytes.length);
  pkcs8.set(pkcs8Header);
  pkcs8.set(seedBytes, pkcs8Header.length);

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "Ed25519" },
    false,
    ["sign"]
  );

  const msgBytes = new TextEncoder().encode(payload);
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, msgBytes);
  return toBase64Url(new Uint8Array(sig));
}

// Legacy sync shim (kept for backward compat, not used for signing now)
export function signChallenge(_challenge: string, _secretKeyHex: string): string {
  throw new Error("signChallenge is sync-only legacy — use signPayload() instead");
}

// ---------------------------------------------------------------------------
// Identity lifecycle
// ---------------------------------------------------------------------------

function generateDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Clawboard Device";
  const ua = navigator.userAgent;
  if (ua.includes("Chrome")) return "Clawboard (Chrome)";
  if (ua.includes("Firefox")) return "Clawboard (Firefox)";
  if (ua.includes("Safari")) return "Clawboard (Safari)";
  if (ua.includes("Edge")) return "Clawboard (Edge)";
  return "Clawboard Device";
}

export async function generateDeviceIdentity(): Promise<DeviceIdentity> {
  const { publicKey, privateKey } = await generateKeyPair();
  const deviceId = await computeDeviceId(publicKey);
  return {
    publicKey,
    privateKey,
    deviceId,
    deviceToken: "",
    deviceLabel: generateDeviceLabel(),
    createdAt: Date.now(),
  };
}

export function loadDeviceIdentity(): DeviceIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEVICE_IDENTITY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceIdentity;
    // Must have privateKey (new format) and deviceId
    if (!parsed.publicKey || !parsed.deviceId || typeof parsed.createdAt !== "number") return null;
    if (!parsed.privateKey && !parsed.secretKey) return null; // no signing key
    return parsed;
  } catch {
    return null;
  }
}

export function saveDeviceIdentity(identity: DeviceIdentity): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_DEVICE_IDENTITY, JSON.stringify(identity));
  } catch {
    console.warn("[DeviceIdentity] Failed to save to localStorage");
  }
}

export async function getOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  const existing = loadDeviceIdentity();
  if (existing) return existing;
  const identity = await generateDeviceIdentity();
  saveDeviceIdentity(identity);
  return identity;
}

export function updateDeviceToken(token: string): DeviceIdentity | null {
  const identity = loadDeviceIdentity();
  if (!identity) return null;
  identity.deviceToken = token;
  saveDeviceIdentity(identity);
  return identity;
}

export function clearDeviceIdentity(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY_DEVICE_IDENTITY);
  } catch { /* ignore */ }
}

export function verifySignature(_challenge: string, _sig: string, _pub: string): boolean {
  return false; // not used
}
