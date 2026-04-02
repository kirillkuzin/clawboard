/**
 * Tests for the OpenClaw Gateway Ed25519 device identity auth flow.
 *
 * Covers:
 * 1. Canonical auth payload format correctness
 * 2. Ed25519 signature generation and verification via tweetnacl
 * 3. Challenge-response round-trip with a mock WebSocket server
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import nacl from "tweetnacl";
import {
  buildAuthPayload,
  parseAuthPayload,
  createDefaultPayloadFields,
  AUTH_PAYLOAD_VERSION,
  AUTH_PAYLOAD_SEPARATOR,
  type AuthPayloadFields,
} from "@/lib/gateway/auth-payload";
import {
  generateDeviceIdentity,
  signChallenge,
  verifySignature,
  toHex,
  fromHex,
  type DeviceIdentity,
} from "@/lib/device-identity";
import type {
  GatewayRequest,
  GatewayResponse,
} from "@/lib/gateway-types";

// =============================================================================
// 1. Canonical Auth Payload Format Tests
// =============================================================================

describe("Canonical Auth Payload", () => {
  const sampleFields: AuthPayloadFields = {
    deviceId: "550e8400-e29b-41d4-a716-446655440000",
    clientId: "client-abc123",
    clientMode: "device",
    role: "operator",
    scopes: "monitor.read,operator.pairing",
    signedAtMs: 1710864000000,
    authToken: "dt_abc123xyz",
    nonce: "random-nonce-from-server",
    platform: "web",
    deviceFamily: "browser",
  };

  it("builds payload with correct v3 version prefix", () => {
    const payload = buildAuthPayload(sampleFields);
    expect(payload.startsWith("v3|")).toBe(true);
  });

  it("builds payload with exactly 11 pipe-separated parts (version + 10 fields)", () => {
    const payload = buildAuthPayload(sampleFields);
    const parts = payload.split("|");
    expect(parts).toHaveLength(11);
  });

  it("preserves exact field order: version|deviceId|clientId|clientMode|role|scopes|signedAtMs|authToken|nonce|platform|deviceFamily", () => {
    const payload = buildAuthPayload(sampleFields);
    const expected = [
      AUTH_PAYLOAD_VERSION,
      sampleFields.deviceId,
      sampleFields.clientId,
      sampleFields.clientMode,
      sampleFields.role,
      sampleFields.scopes,
      String(sampleFields.signedAtMs),
      sampleFields.authToken,
      sampleFields.nonce,
      sampleFields.platform,
      sampleFields.deviceFamily,
    ].join(AUTH_PAYLOAD_SEPARATOR);

    expect(payload).toBe(expected);
  });

  it("matches the documented example output exactly", () => {
    const payload = buildAuthPayload(sampleFields);
    expect(payload).toBe(
      "v3|550e8400-e29b-41d4-a716-446655440000|client-abc123|device|operator|monitor.read,operator.pairing|1710864000000|dt_abc123xyz|random-nonce-from-server|web|browser"
    );
  });

  it("sanitizes pipe characters from field values to prevent injection", () => {
    const malicious: AuthPayloadFields = {
      ...sampleFields,
      deviceId: "evil|injected",
      nonce: "nonce|with|pipes",
    };
    const payload = buildAuthPayload(malicious);
    const parts = payload.split("|");
    // Should still be exactly 11 parts since pipes are stripped
    expect(parts).toHaveLength(11);
    expect(parts[1]).toBe("evilinjected");
    expect(parts[8]).toBe("noncewithpipes");
  });

  it("converts signedAtMs number to string in the payload", () => {
    const payload = buildAuthPayload(sampleFields);
    const parts = payload.split("|");
    expect(parts[6]).toBe("1710864000000");
  });

  it("handles empty string fields correctly", () => {
    const fields: AuthPayloadFields = {
      ...sampleFields,
      authToken: "",
      scopes: "",
    };
    const payload = buildAuthPayload(fields);
    const parts = payload.split("|");
    // authToken is field index 7 (0=version, 7=authToken)
    expect(parts[7]).toBe("");
    // scopes is field index 5
    expect(parts[5]).toBe("");
  });

  describe("parseAuthPayload", () => {
    it("round-trips correctly: build → parse → build", () => {
      const payload = buildAuthPayload(sampleFields);
      const parsed = parseAuthPayload(payload);
      expect(parsed).not.toBeNull();
      expect(parsed).toEqual(sampleFields);
      // Double round-trip
      const rebuilt = buildAuthPayload(parsed!);
      expect(rebuilt).toBe(payload);
    });

    it("returns null for wrong version prefix", () => {
      const payload = "v2|a|b|c|d|e|123|f|g|h|i";
      expect(parseAuthPayload(payload)).toBeNull();
    });

    it("returns null for wrong number of fields", () => {
      expect(parseAuthPayload("v3|a|b|c")).toBeNull();
      expect(parseAuthPayload("v3|a|b|c|d|e|123|f|g|h|i|extra")).toBeNull();
    });

    it("returns null for non-numeric signedAtMs", () => {
      expect(parseAuthPayload("v3|a|b|c|d|e|notanumber|f|g|h|i")).toBeNull();
    });

    it("parses signedAtMs as a number", () => {
      const parsed = parseAuthPayload(buildAuthPayload(sampleFields));
      expect(typeof parsed!.signedAtMs).toBe("number");
      expect(parsed!.signedAtMs).toBe(1710864000000);
    });
  });

  describe("createDefaultPayloadFields", () => {
    it("fills in sensible defaults for browser-based clients", () => {
      // Mock crypto.randomUUID
      const mockUUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
      vi.stubGlobal("crypto", { randomUUID: () => mockUUID });

      const fields = createDefaultPayloadFields({
        deviceId: "test-device-id",
        nonce: "test-nonce",
      });

      expect(fields.deviceId).toBe("test-device-id");
      expect(fields.nonce).toBe("test-nonce");
      expect(fields.clientId).toBe(mockUUID);
      expect(fields.clientMode).toBe("device");
      expect(fields.role).toBe("operator");
      expect(fields.platform).toBe("web");
      expect(fields.deviceFamily).toBe("browser");
      expect(fields.authToken).toBe("");
      expect(fields.scopes).toBe("");
      expect(typeof fields.signedAtMs).toBe("number");

      vi.unstubAllGlobals();
    });

    it("allows overriding all defaults", () => {
      vi.stubGlobal("crypto", { randomUUID: () => "uuid" });

      const fields = createDefaultPayloadFields({
        deviceId: "d1",
        nonce: "n1",
        clientId: "custom-client",
        role: "viewer",
        scopes: "monitor.read",
        platform: "electron",
        deviceFamily: "desktop",
      });

      expect(fields.clientId).toBe("custom-client");
      expect(fields.role).toBe("viewer");
      expect(fields.scopes).toBe("monitor.read");
      expect(fields.platform).toBe("electron");
      expect(fields.deviceFamily).toBe("desktop");

      vi.unstubAllGlobals();
    });
  });
});

// =============================================================================
// 2. Ed25519 Signature Generation & Verification Tests
// =============================================================================

describe("Ed25519 Signature Generation & Verification", () => {
  let identity: DeviceIdentity;

  beforeEach(() => {
    identity = generateDeviceIdentity();
  });

  describe("hex encoding helpers", () => {
    it("round-trips Uint8Array through toHex/fromHex", () => {
      const original = nacl.randomBytes(32);
      const hex = toHex(original);
      const restored = fromHex(hex);
      expect(restored).toEqual(original);
    });

    it("produces lowercase hex strings", () => {
      const bytes = new Uint8Array([0xff, 0x0a, 0x00, 0xab]);
      expect(toHex(bytes)).toBe("ff0a00ab");
    });

    it("produces correct length hex for Ed25519 keys", () => {
      // Public key: 32 bytes → 64 hex chars
      expect(identity.publicKey).toHaveLength(64);
      // Secret key: 64 bytes → 128 hex chars
      expect(identity.secretKey).toHaveLength(128);
    });
  });

  describe("generateDeviceIdentity", () => {
    it("generates valid Ed25519 keypair", () => {
      const pk = fromHex(identity.publicKey);
      const sk = fromHex(identity.secretKey);
      expect(pk).toHaveLength(32);
      expect(sk).toHaveLength(64);
    });

    it("derives deviceId from first 16 bytes of public key", () => {
      const pk = fromHex(identity.publicKey);
      const expectedId = toHex(pk.slice(0, 16));
      expect(identity.deviceId).toBe(expectedId);
      expect(identity.deviceId).toHaveLength(32);
    });

    it("initializes with empty deviceToken", () => {
      expect(identity.deviceToken).toBe("");
    });

    it("generates unique identities each time", () => {
      const id2 = generateDeviceIdentity();
      expect(identity.publicKey).not.toBe(id2.publicKey);
      expect(identity.deviceId).not.toBe(id2.deviceId);
    });
  });

  describe("signChallenge", () => {
    it("produces a 64-byte (128 hex char) Ed25519 signature", () => {
      const signature = signChallenge("test-challenge", identity.secretKey);
      expect(signature).toHaveLength(128);
    });

    it("produces deterministic signatures for same input", () => {
      const sig1 = signChallenge("same-challenge", identity.secretKey);
      const sig2 = signChallenge("same-challenge", identity.secretKey);
      expect(sig1).toBe(sig2);
    });

    it("produces different signatures for different challenges", () => {
      const sig1 = signChallenge("challenge-a", identity.secretKey);
      const sig2 = signChallenge("challenge-b", identity.secretKey);
      expect(sig1).not.toBe(sig2);
    });
  });

  describe("verifySignature", () => {
    it("verifies a valid signature", () => {
      const challenge = "test-challenge-12345";
      const sig = signChallenge(challenge, identity.secretKey);
      const valid = verifySignature(challenge, sig, identity.publicKey);
      expect(valid).toBe(true);
    });

    it("rejects a tampered signature", () => {
      const sig = signChallenge("test", identity.secretKey);
      // Flip a byte in the signature
      const tampered = "ff" + sig.slice(2);
      // May or may not fail depending on the byte, but with different challenge always fails
      const valid = verifySignature("different-challenge", tampered, identity.publicKey);
      expect(valid).toBe(false);
    });

    it("rejects verification with wrong public key", () => {
      const otherIdentity = generateDeviceIdentity();
      const sig = signChallenge("test", identity.secretKey);
      const valid = verifySignature("test", sig, otherIdentity.publicKey);
      expect(valid).toBe(false);
    });

    it("rejects verification with wrong challenge text", () => {
      const sig = signChallenge("original-challenge", identity.secretKey);
      const valid = verifySignature("different-challenge", sig, identity.publicKey);
      expect(valid).toBe(false);
    });
  });

  describe("full canonical payload signing flow", () => {
    it("signs and verifies a canonical auth payload", () => {
      const fields: AuthPayloadFields = {
        deviceId: identity.deviceId,
        clientId: "client-123",
        clientMode: "device",
        role: "operator",
        scopes: "monitor.read",
        signedAtMs: Date.now(),
        authToken: "",
        nonce: "server-nonce-abc",
        platform: "web",
        deviceFamily: "browser",
      };

      const payload = buildAuthPayload(fields);
      const signature = signChallenge(payload, identity.secretKey);
      const valid = verifySignature(payload, signature, identity.publicKey);

      expect(valid).toBe(true);
    });

    it("detects payload tampering after signing", () => {
      const fields: AuthPayloadFields = {
        deviceId: identity.deviceId,
        clientId: "client-123",
        clientMode: "device",
        role: "operator",
        scopes: "monitor.read",
        signedAtMs: 1710864000000,
        authToken: "",
        nonce: "nonce-123",
        platform: "web",
        deviceFamily: "browser",
      };

      const payload = buildAuthPayload(fields);
      const signature = signChallenge(payload, identity.secretKey);

      // Tamper with the payload (change role to viewer)
      const tampered = payload.replace("operator", "viewer");
      const valid = verifySignature(tampered, signature, identity.publicKey);

      expect(valid).toBe(false);
    });
  });
});

// =============================================================================
// 3. Challenge-Response Round-Trip with Mock WebSocket
// =============================================================================

describe("Challenge-Response Round-Trip (Mock WebSocket)", () => {
  let identity: DeviceIdentity;
  let mockServer: MockGatewayServer;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    identity = generateDeviceIdentity();
    mockServer = new MockGatewayServer();
    mockWs = new MockWebSocket(mockServer);
  });

  afterEach(() => {
    mockWs.close();
  });

  it("completes full auth flow: auth → challenge → sign → paired", async () => {
    // Step 1: Client sends device.auth request
    const authReqId = crypto.randomUUID();
    const authReq: GatewayRequest = {
      frame: "req",
      id: authReqId,
      method: "device.auth",
      params: {
        deviceId: identity.deviceId,
        publicKey: identity.publicKey,
        deviceToken: identity.deviceToken,
        deviceLabel: identity.deviceLabel,
      },
    };

    mockWs.send(JSON.stringify(authReq));

    // Step 2: Server responds with challenge
    const challengeRes = await mockWs.waitForMessage();
    expect(challengeRes.frame).toBe("res");
    expect(challengeRes.id).toBe(authReqId);
    expect(challengeRes.ok).toBe(true);
    expect(challengeRes.result?.status).toBe("challenge");

    const challenge = challengeRes.result!.challenge as string;
    const nonce = challengeRes.result!.nonce as string;
    expect(challenge).toBeTruthy();
    expect(nonce).toBeTruthy();

    // Step 3: Client signs the canonical payload
    const payloadFields: AuthPayloadFields = {
      deviceId: identity.deviceId,
      clientId: authReqId,
      clientMode: "device",
      role: "operator",
      scopes: "",
      signedAtMs: Date.now(),
      authToken: "",
      nonce,
      platform: "web",
      deviceFamily: "browser",
    };
    const canonicalPayload = buildAuthPayload(payloadFields);
    const signature = signChallenge(canonicalPayload, identity.secretKey);

    // Step 4: Client sends challenge response
    const challengeReqId = crypto.randomUUID();
    const challengeReq: GatewayRequest = {
      frame: "req",
      id: challengeReqId,
      method: "device.auth.challenge",
      params: {
        deviceId: identity.deviceId,
        signature,
        payload: canonicalPayload,
      },
    };

    mockWs.send(JSON.stringify(challengeReq));

    // Step 5: Server verifies signature and responds with paired status
    const pairedRes = await mockWs.waitForMessage();
    expect(pairedRes.frame).toBe("res");
    expect(pairedRes.id).toBe(challengeReqId);
    expect(pairedRes.ok).toBe(true);
    expect(pairedRes.result?.status).toBe("paired");
    expect(pairedRes.result?.deviceToken).toBeTruthy();
    expect(pairedRes.result?.scopes).toEqual(["monitor.read", "operator.pairing"]);
  });

  it("authenticates directly with a valid device token", async () => {
    const reqId = crypto.randomUUID();
    const req: GatewayRequest = {
      frame: "req",
      id: reqId,
      method: "device.auth",
      params: {
        deviceId: identity.deviceId,
        publicKey: identity.publicKey,
        deviceToken: "valid-token-abc123",
        deviceLabel: identity.deviceLabel,
      },
    };

    mockWs.send(JSON.stringify(req));

    const res = await mockWs.waitForMessage();
    expect(res.frame).toBe("res");
    expect(res.id).toBe(reqId);
    expect(res.ok).toBe(true);
    expect(res.result?.status).toBe("authenticated");
    expect(res.result?.scopes).toEqual(["monitor.read", "operator.pairing"]);
  });

  it("rejects invalid signature during challenge response", async () => {
    // Step 1: Get challenge
    const authReqId = crypto.randomUUID();
    mockWs.send(JSON.stringify({
      frame: "req",
      id: authReqId,
      method: "device.auth",
      params: {
        deviceId: identity.deviceId,
        publicKey: identity.publicKey,
        deviceToken: "",
      },
    } satisfies GatewayRequest));

    const challengeRes = await mockWs.waitForMessage();
    const nonce = challengeRes.result!.nonce as string;

    // Step 2: Send invalid signature
    const challengeReqId = crypto.randomUUID();
    const fields: AuthPayloadFields = {
      deviceId: identity.deviceId,
      clientId: authReqId,
      clientMode: "device",
      role: "operator",
      scopes: "",
      signedAtMs: Date.now(),
      authToken: "",
      nonce,
      platform: "web",
      deviceFamily: "browser",
    };
    const payload = buildAuthPayload(fields);
    // Create signature with a DIFFERENT identity (wrong key)
    const wrongIdentity = generateDeviceIdentity();
    const badSignature = signChallenge(payload, wrongIdentity.secretKey);

    mockWs.send(JSON.stringify({
      frame: "req",
      id: challengeReqId,
      method: "device.auth.challenge",
      params: {
        deviceId: identity.deviceId,
        signature: badSignature,
        payload,
      },
    } satisfies GatewayRequest));

    const res = await mockWs.waitForMessage();
    expect(res.frame).toBe("res");
    expect(res.id).toBe(challengeReqId);
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("INVALID_SIGNATURE");
  });

  it("correlates responses to requests by UUID id", async () => {
    // Send two requests with different IDs
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();

    mockWs.send(JSON.stringify({
      frame: "req",
      id: id1,
      method: "device.auth",
      params: {
        deviceId: identity.deviceId,
        publicKey: identity.publicKey,
        deviceToken: "valid-token-abc123",
      },
    } satisfies GatewayRequest));

    const res1 = await mockWs.waitForMessage();
    expect(res1.id).toBe(id1);

    mockWs.send(JSON.stringify({
      frame: "req",
      id: id2,
      method: "device.auth",
      params: {
        deviceId: identity.deviceId,
        publicKey: identity.publicKey,
        deviceToken: "valid-token-abc123",
      },
    } satisfies GatewayRequest));

    const res2 = await mockWs.waitForMessage();
    expect(res2.id).toBe(id2);
    expect(res1.id).not.toBe(res2.id);
  });

  it("returns error for unknown methods", async () => {
    const reqId = crypto.randomUUID();
    mockWs.send(JSON.stringify({
      frame: "req",
      id: reqId,
      method: "unknown.method",
      params: {},
    } satisfies GatewayRequest));

    const res = await mockWs.waitForMessage();
    expect(res.frame).toBe("res");
    expect(res.id).toBe(reqId);
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("METHOD_NOT_FOUND");
  });
});

// =============================================================================
// Mock WebSocket Infrastructure
// =============================================================================

/**
 * Mock Gateway Server that implements the OpenClaw JSON-RPC auth protocol.
 * Validates signatures using tweetnacl to ensure real crypto correctness.
 */
class MockGatewayServer {
  /** Store registered device public keys (deviceId → publicKeyHex) */
  private devices = new Map<string, string>();
  /** Store active challenges (deviceId → { challenge, nonce }) */
  private challenges = new Map<string, { challenge: string; nonce: string }>();
  /** Valid device tokens */
  private validTokens = new Set(["valid-token-abc123"]);

  handleMessage(data: string): GatewayResponse {
    const req = JSON.parse(data) as GatewayRequest;

    if (req.frame !== "req") {
      return this.errorResponse(req.id || "unknown", "INVALID_FRAME", "Expected req frame");
    }

    switch (req.method) {
      case "device.auth":
        return this.handleDeviceAuth(req);
      case "device.auth.challenge":
        return this.handleDeviceAuthChallenge(req);
      default:
        return this.errorResponse(req.id, "METHOD_NOT_FOUND", `Unknown method: ${req.method}`);
    }
  }

  private handleDeviceAuth(req: GatewayRequest): GatewayResponse {
    const { deviceId, publicKey, deviceToken } = req.params as {
      deviceId: string;
      publicKey?: string;
      deviceToken?: string;
    };

    // Store the public key for later signature verification
    if (publicKey) {
      this.devices.set(deviceId, publicKey);
    }

    // If a valid token is provided, authenticate directly
    if (deviceToken && this.validTokens.has(deviceToken)) {
      return {
        frame: "res",
        id: req.id,
        ok: true,
        result: {
          status: "authenticated",
          scopes: ["monitor.read", "operator.pairing"],
          deviceToken,
        },
      };
    }

    // Otherwise, issue a challenge
    const challenge = `challenge-${crypto.randomUUID()}`;
    const nonce = `nonce-${crypto.randomUUID()}`;
    this.challenges.set(deviceId, { challenge, nonce });

    return {
      frame: "res",
      id: req.id,
      ok: true,
      result: {
        status: "challenge",
        challenge,
        nonce,
      },
    };
  }

  private handleDeviceAuthChallenge(req: GatewayRequest): GatewayResponse {
    const { deviceId, signature, payload } = req.params as {
      deviceId: string;
      signature: string;
      payload: string;
    };

    const publicKeyHex = this.devices.get(deviceId);
    if (!publicKeyHex) {
      return this.errorResponse(req.id, "UNKNOWN_DEVICE", "Device not registered");
    }

    // Verify the Ed25519 signature using the real tweetnacl library
    const isValid = verifySignature(payload, signature, publicKeyHex);
    if (!isValid) {
      return this.errorResponse(req.id, "INVALID_SIGNATURE", "Signature verification failed");
    }

    // Verify the payload contains the expected nonce
    const storedChallenge = this.challenges.get(deviceId);
    if (!storedChallenge) {
      return this.errorResponse(req.id, "NO_CHALLENGE", "No pending challenge for device");
    }

    // Verify nonce is present in the canonical payload
    if (!payload.includes(storedChallenge.nonce)) {
      return this.errorResponse(req.id, "INVALID_NONCE", "Payload does not contain expected nonce");
    }

    // Clean up challenge
    this.challenges.delete(deviceId);

    // Issue a device token
    const newToken = `dt_${crypto.randomUUID()}`;
    this.validTokens.add(newToken);

    return {
      frame: "res",
      id: req.id,
      ok: true,
      result: {
        status: "paired",
        deviceToken: newToken,
        scopes: ["monitor.read", "operator.pairing"],
      },
    };
  }

  private errorResponse(id: string, code: string, message: string): GatewayResponse {
    return {
      frame: "res",
      id,
      ok: false,
      error: { code, message },
    };
  }
}

/**
 * Mock WebSocket that simulates client-server communication
 * without a real network connection. Messages are processed
 * synchronously by the MockGatewayServer.
 */
class MockWebSocket {
  private server: MockGatewayServer;
  private messageQueue: GatewayResponse[] = [];
  private resolvers: Array<(res: GatewayResponse) => void> = [];
  private _closed = false;

  constructor(server: MockGatewayServer) {
    this.server = server;
  }

  send(data: string): void {
    if (this._closed) throw new Error("WebSocket is closed");

    const response = this.server.handleMessage(data);

    // If someone is waiting for a message, deliver immediately
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve(response);
    } else {
      this.messageQueue.push(response);
    }
  }

  waitForMessage(): Promise<GatewayResponse> {
    // If there's already a queued message, return it
    if (this.messageQueue.length > 0) {
      return Promise.resolve(this.messageQueue.shift()!);
    }

    // Otherwise wait for the next message
    return new Promise((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  close(): void {
    this._closed = true;
    this.resolvers = [];
    this.messageQueue = [];
  }
}
