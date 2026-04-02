"use client";

import { useState, useCallback, useEffect } from "react";
import { useSettings, SETTINGS_STORAGE_KEYS } from "@/hooks/use-settings";
import { useGateway } from "@/components/providers/gateway-provider";
import {
  type DeviceIdentity,
  loadDeviceIdentity,
  clearDeviceIdentity,
  getOrCreateDeviceIdentity,
} from "@/lib/device-identity";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RotateCcw,
  Loader2,
  Zap,
  Database,
  Fingerprint,
  Copy,
  Check,
  Trash2,
  Wifi,
  WifiOff,
  KeyRound,
  Shield,
} from "lucide-react";
import { ThemeSelector } from "@/components/theme-toggle";

export function SettingsSection() {
  const {
    gatewayUrl,
    gatewayToken,
    gatewayPassword,
    setGatewayUrl,
    setGatewayToken,
    setGatewayPassword,
    clearSettings,
    isLoaded,
    defaultGatewayUrl,
  } = useSettings();

  const [showToken, setShowToken] = useState(false);

  const gateway = useGateway();

  const [deviceIdentity, setDeviceIdentity] = useState<DeviceIdentity | null>(
    null
  );
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Load device identity on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const identity = loadDeviceIdentity();
    setDeviceIdentity(identity);
  }, []);

  const handleResetDeviceIdentity = useCallback(() => {
    clearDeviceIdentity();
    const newIdentity = getOrCreateDeviceIdentity();
    setDeviceIdentity(newIdentity);
  }, []);

  const handleCopyToClipboard = useCallback(
    (value: string, field: string) => {
      navigator.clipboard.writeText(value).then(() => {
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
      });
    },
    []
  );

  const handleReset = useCallback(() => {
    gateway.disconnect();
    clearSettings();
  }, [clearSettings]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-2xl">
        <div className="space-y-6">
          {/* Gateway Connection Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Gateway Connection</CardTitle>
                  <CardDescription>
                    Connect to your OpenClaw gateway. All communication uses
                    WebSocket JSON-RPC with Ed25519 device authentication.
                  </CardDescription>
                </div>
                <ConnectionIndicator
                  isConnected={gateway.isConnected}
                  isConnecting={gateway.isConnecting}
                  isPendingPairing={gateway.isPendingPairing}
                  latencyMs={gateway.latencyMs}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Gateway URL */}
              <div className="space-y-2">
                <Label htmlFor="gateway-url">Gateway URL</Label>
                <Input
                  id="gateway-url"
                  type="text"
                  placeholder={defaultGatewayUrl}
                  value={gatewayUrl}
                  onChange={(e) => setGatewayUrl(e.target.value)}
                  autoComplete="url"
                />
                <p className="text-xs text-muted-foreground">
                  WebSocket URL of your OpenClaw gateway (e.g.{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    ws://localhost:18789
                  </code>
                  ). Set via{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    NEXT_PUBLIC_OPENCLAW_GATEWAY_WS_URL
                  </code>{" "}
                  env var.
                </p>
              </div>

              {/* Token (optional) */}
              <div className="space-y-2">
                <Label htmlFor="gateway-token">
                  Token{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <div className="relative">
                  <Input
                    id="gateway-token"
                    type={showToken ? "text" : "password"}
                    placeholder="Gateway shared token"
                    value={gatewayToken}
                    onChange={(e) => setGatewayToken(e.target.value)}
                    autoComplete="off"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showToken ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Shared secret token configured on the gateway. Leave empty if
                  using device identity only.
                </p>
              </div>

              {/* Password (optional, not persisted) */}
              <div className="space-y-2">
                <Label htmlFor="gateway-password">
                  Password{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional, not saved)
                  </span>
                </Label>
                <Input
                  id="gateway-password"
                  type="password"
                  placeholder="Gateway password"
                  value={gatewayPassword}
                  onChange={(e) => setGatewayPassword(e.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Password configured on the gateway. Not stored — cleared on
                  page reload.
                </p>
              </div>

              {/* Live Connection Status */}
              <GatewayStatus gateway={gateway} />
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button
                onClick={() => {
                  setGatewayUrl(gatewayUrl);
                  gateway.reconnect();
                }}
                disabled={gateway.isConnecting || !gatewayUrl.trim()}
                className="flex-1 sm:flex-none"
              >
                {gateway.isConnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wifi className="mr-2 h-4 w-4" />
                )}
                {gateway.isConnected ? "Reconnect" : "Connect"}
              </Button>
              {gateway.isConnected && (
                <Button
                  variant="outline"
                  onClick={() => gateway.disconnect()}
                >
                  Disconnect
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleReset}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </CardFooter>
          </Card>

          {/* Appearance Card */}
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Theme preference is saved in localStorage and persists across
                sessions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>Theme</Label>
                <ThemeSelector />
              </div>
            </CardContent>
          </Card>

          {/* Device Identity Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Fingerprint className="h-4 w-4 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Device Identity</CardTitle>
                  <CardDescription>
                    Ed25519 keypair for gateway authentication. Auto-generated on
                    first connection.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {deviceIdentity ? (
                <>
                  <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                    <IdentityRow
                      label="Device Name"
                      value={deviceIdentity.deviceLabel}
                    />
                    <IdentityRow
                      label="Device ID"
                      value={deviceIdentity.deviceId}
                      mono
                      copyable
                      copiedField={copiedField}
                      onCopy={(v) => handleCopyToClipboard(v, "deviceId")}
                      field="deviceId"
                    />
                    <IdentityRow
                      label="Public Key"
                      value={deviceIdentity.publicKey}
                      mono
                      copyable
                      copiedField={copiedField}
                      onCopy={(v) => handleCopyToClipboard(v, "publicKey")}
                      field="publicKey"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Pairing Status
                      </span>
                      <span
                        className={`text-xs font-medium ${
                          deviceIdentity.deviceToken
                            ? "text-green-500"
                            : "text-yellow-500"
                        }`}
                      >
                        {deviceIdentity.deviceToken ? "Paired" : "Not Paired"}
                      </span>
                    </div>
                    {gateway.scopes.length > 0 && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          Scopes
                        </span>
                        <div className="flex flex-wrap gap-1 justify-end">
                          {gateway.scopes.map((s) => (
                            <code
                              key={s}
                              className="text-[10px] font-mono rounded bg-primary/10 text-primary px-1.5 py-0.5"
                            >
                              {s}
                            </code>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Created
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(deviceIdentity.createdAt).toLocaleDateString(
                          undefined,
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground max-w-[280px]">
                      Resetting generates a new keypair. You will need to
                      re-pair with the gateway.
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleResetDeviceIdentity}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Reset Identity
                    </Button>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <Fingerprint className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">
                    No device identity found. One will be generated
                    automatically when you connect.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const identity = getOrCreateDeviceIdentity();
                      setDeviceIdentity(identity);
                    }}
                  >
                    Generate Now
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Storage Info Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Local Storage</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                All settings are stored in your browser&apos;s localStorage.
                No data is sent to external servers beyond your configured
                OpenClaw gateway. Changes sync across open tabs.
              </p>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Persisted keys:
                </p>
                <div className="space-y-1">
                  {Object.entries(SETTINGS_STORAGE_KEYS).map(
                    ([label, key]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-muted-foreground capitalize">
                          {label.replace(/([A-Z])/g, " $1").trim()}
                        </span>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                          {key}
                        </code>
                      </div>
                    )
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConnectionIndicator({
  isConnected,
  isConnecting,
  isPendingPairing,
  latencyMs,
}: {
  isConnected: boolean;
  isConnecting: boolean;
  isPendingPairing: boolean;
  latencyMs: number | null;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div
        className={`h-2.5 w-2.5 rounded-full transition-colors ${
          isConnected
            ? "bg-green-500"
            : isPendingPairing
              ? "bg-amber-500 animate-pulse"
              : isConnecting
                ? "bg-yellow-500 animate-pulse"
                : "bg-muted-foreground/40"
        }`}
      />
      <span className="text-xs text-muted-foreground hidden sm:inline">
        {isConnected
          ? `Connected${latencyMs ? ` (${latencyMs}ms)` : ""}`
          : isPendingPairing
            ? "Pending pairing"
            : isConnecting
              ? "Connecting..."
              : "Disconnected"}
      </span>
    </div>
  );
}

function GatewayStatus({
  gateway,
}: {
  gateway: ReturnType<typeof useGateway>;
}) {
  if (gateway.isConnected) {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-green-400">
              Connected to OpenClaw Gateway
            </p>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
              {gateway.latencyMs && (
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  {gateway.latencyMs}ms
                </span>
              )}
              <span>
                Auth: Ed25519 device identity
              </span>
              {gateway.scopes.length > 0 && (
                <span>{gateway.scopes.length} scopes granted</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gateway.isPendingPairing) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
        <div className="flex items-start gap-3">
          <KeyRound className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-400">
              Awaiting pairing approval
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Approve this device in the OpenClaw operator panel or another
              paired dashboard.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (gateway.connectionState.wsState === "reconnecting") {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
          <div>
            <p className="font-medium text-amber-400">Reconnecting...</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Check that the gateway is running and the URL is correct
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (gateway.connectionState.wsState === "failed") {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm">
        <div className="flex items-start gap-3">
          <WifiOff className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-400">Connection failed</p>
            <p className="text-xs text-muted-foreground mt-1">
              Could not connect after multiple attempts. Check the URL and click Connect.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (gateway.isConnecting) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Connecting to gateway...</p>
        </div>
      </div>
    );
  }

  if (gateway.error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm">
        <div className="flex items-start gap-3">
          <WifiOff className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-400">Connection failed</p>
            <p className="text-xs text-muted-foreground mt-1">
              {gateway.error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function IdentityRow({
  label,
  value,
  mono,
  copyable,
  copiedField,
  onCopy,
  field,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
  copiedField?: string | null;
  onCopy?: (value: string) => void;
  field?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        {mono ? (
          <code className="text-xs font-mono rounded bg-muted px-1.5 py-0.5 max-w-[200px] truncate">
            {value}
          </code>
        ) : (
          <span className="text-sm">{value}</span>
        )}
        {copyable && onCopy && (
          <button
            type="button"
            onClick={() => onCopy(value)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label={`Copy ${label}`}
          >
            {copiedField === field ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
