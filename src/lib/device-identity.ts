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

/** Derive deviceId as sha256(raw_public_key_bytes) in hex — matches OpenClaw server */
async function deriveDeviceId(publicKey: Uint8Array): Promise<string> {
  // Copy to new ArrayBuffer to avoid issues with shared/offset buffers (tweetnacl)
  const exactBytes = new Uint8Array(publicKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', exactBytes);
  return toHex(new Uint8Array(hashBuffer));
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
