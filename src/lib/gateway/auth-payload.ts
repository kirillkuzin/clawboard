/**
 * Canonical Auth Payload Builder for OpenClaw Gateway.
 *
 * Constructs the v3 auth payload string with correct field ordering:
 *   v3|deviceId|clientId|clientMode|role|scopes|signedAtMs|authToken|nonce|platform|deviceFamily
 *
 * This payload is signed with the device's Ed25519 private key
 * to prove device identity during the challenge-response auth flow.
 */

/** All fields required to build a v3 canonical auth payload */
export interface AuthPayloadFields {
  /** Unique device identifier (UUID v4, persisted in localStorage) */
  deviceId: string;
  /** Client/session identifier for this connection */
  clientId: string;
  /** Client mode: "device" for device-identity auth */
  clientMode: string;
  /** Role assigned to this device (e.g., "operator", "viewer") */
  role: string;
  /** Comma-separated list of granted scopes (e.g., "monitor.read,operator.pairing") */
  scopes: string;
  /** Millisecond timestamp when the payload was signed */
  signedAtMs: number;
  /** Auth/device token issued by the gateway after pairing approval */
  authToken: string;
  /** One-time nonce from the gateway challenge */
  nonce: string;
  /** Platform identifier (e.g., "web", "electron", "cli") */
  platform: string;
  /** Device family (e.g., "browser", "desktop", "mobile") */
  deviceFamily: string;
}

/** The canonical auth payload version */
export const AUTH_PAYLOAD_VERSION = "v3";

/** Separator used between fields in the canonical payload */
export const AUTH_PAYLOAD_SEPARATOR = "|";

/**
 * Ordered list of field keys in the canonical auth payload.
 * The order MUST match the gateway's expected format exactly:
 *   v3|deviceId|clientId|clientMode|role|scopes|signedAtMs|authToken|nonce|platform|deviceFamily
 */
const AUTH_PAYLOAD_FIELD_ORDER: ReadonlyArray<keyof AuthPayloadFields> = [
  "deviceId",
  "clientId",
  "clientMode",
  "role",
  "scopes",
  "signedAtMs",
  "authToken",
  "nonce",
  "platform",
  "deviceFamily",
] as const;

/**
 * Sanitize a field value by replacing any pipe characters to prevent
 * field boundary injection. Converts to string for numeric fields.
 */
function sanitizeField(value: string | number): string {
  return String(value).replace(/\|/g, "");
}

/**
 * Build the canonical auth payload string for v3 device identity auth.
 *
 * The resulting string follows the exact format:
 *   v3|deviceId|clientId|clientMode|role|scopes|signedAtMs|authToken|nonce|platform|deviceFamily
 *
 * This string is what gets signed with the Ed25519 private key and sent
 * to the gateway for challenge-response verification.
 *
 * @param fields - All fields required for the auth payload
 * @returns The canonical payload string ready for signing
 *
 * @example
 * ```ts
 * const payload = buildAuthPayload({
 *   deviceId: "550e8400-e29b-41d4-a716-446655440000",
 *   clientId: "client-abc123",
 *   clientMode: "device",
 *   role: "operator",
 *   scopes: "monitor.read,operator.pairing",
 *   signedAtMs: 1710864000000,
 *   authToken: "dt_abc123xyz",
 *   nonce: "random-nonce-from-server",
 *   platform: "web",
 *   deviceFamily: "browser",
 * });
 * // => "v3|550e8400-e29b-41d4-a716-446655440000|client-abc123|device|operator|monitor.read,operator.pairing|1710864000000|dt_abc123xyz|random-nonce-from-server|web|browser"
 * ```
 */
export function buildAuthPayload(fields: AuthPayloadFields): string {
  const parts: string[] = [AUTH_PAYLOAD_VERSION];

  for (const key of AUTH_PAYLOAD_FIELD_ORDER) {
    parts.push(sanitizeField(fields[key]));
  }

  return parts.join(AUTH_PAYLOAD_SEPARATOR);
}

/**
 * Parse a canonical auth payload string back into its constituent fields.
 * Useful for debugging and testing.
 *
 * @param payload - The canonical payload string
 * @returns Parsed fields or null if the payload is malformed
 */
export function parseAuthPayload(payload: string): AuthPayloadFields | null {
  const parts = payload.split(AUTH_PAYLOAD_SEPARATOR);

  // Must have version + 10 fields = 11 parts
  if (parts.length !== 11) {
    return null;
  }

  const [version, ...fieldValues] = parts;

  if (version !== AUTH_PAYLOAD_VERSION) {
    return null;
  }

  const result: Record<string, string | number> = {};
  for (let i = 0; i < AUTH_PAYLOAD_FIELD_ORDER.length; i++) {
    const key = AUTH_PAYLOAD_FIELD_ORDER[i];
    const value = fieldValues[i];

    // signedAtMs should be a number
    if (key === "signedAtMs") {
      const num = Number(value);
      if (isNaN(num)) return null;
      result[key] = num;
    } else {
      result[key] = value;
    }
  }

  return result as unknown as AuthPayloadFields;
}

/**
 * Create auth payload fields with sensible defaults for browser-based clients.
 * Merges provided overrides with default values.
 *
 * @param overrides - Fields to override from defaults
 * @returns Complete AuthPayloadFields with defaults applied
 */
export function createDefaultPayloadFields(
  overrides: Partial<AuthPayloadFields> & Pick<AuthPayloadFields, "deviceId" | "nonce">
): AuthPayloadFields {
  return {
    clientId: crypto.randomUUID(),
    clientMode: "device",
    role: "operator",
    scopes: "",
    signedAtMs: Date.now(),
    authToken: "",
    platform: "web",
    deviceFamily: "browser",
    ...overrides,
  };
}
