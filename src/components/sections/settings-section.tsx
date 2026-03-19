"use client";

import { useState, useCallback } from "react";
import { useSettings } from "@/hooks/use-settings";
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
import { Eye, EyeOff, Save, RotateCcw, CheckCircle, XCircle, Loader2, Zap, Database } from "lucide-react";
import { SETTINGS_STORAGE_KEYS } from "@/hooks/use-settings";
import { ThemeSelector } from "@/components/theme-toggle";

type ConnectionStatus = "idle" | "testing" | "success" | "error";

interface ConnectionResult {
  status: ConnectionStatus;
  message: string;
  latencyMs?: number;
  endpoint?: string;
  serverInfo?: Record<string, unknown>;
}

export function SettingsSection() {
  const { apiKey, apiUrl, setApiKey, setApiUrl, clearSettings, isLoaded, defaultApiUrl } =
    useSettings();

  const [showApiKey, setShowApiKey] = useState(false);
  const [connectionResult, setConnectionResult] = useState<ConnectionResult>({
    status: "idle",
    message: "",
  });
  const [saved, setSaved] = useState(false);
  const [showServerInfo, setShowServerInfo] = useState(false);

  const handleTestConnection = useCallback(async () => {
    if (!apiUrl) {
      setConnectionResult({
        status: "error",
        message: "API URL is required",
      });
      return;
    }

    try {
      new URL(apiUrl);
    } catch {
      setConnectionResult({
        status: "error",
        message: "Invalid URL format. Please enter a valid URL (e.g., http://localhost:8000).",
      });
      return;
    }

    setConnectionResult({
      status: "testing",
      message: "Testing connection...",
    });
    setShowServerInfo(false);

    const clientStartTime = performance.now();

    try {
      const response = await fetch("/api/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiUrl, apiKey }),
      });

      const clientLatencyMs = Math.round(performance.now() - clientStartTime);
      const data = await response.json();

      if (data.ok) {
        setConnectionResult({
          status: "success",
          message: data.message || "Connected successfully",
          latencyMs: data.latencyMs ?? clientLatencyMs,
          endpoint: data.endpoint,
          serverInfo: data.serverInfo,
        });
      } else {
        setConnectionResult({
          status: "error",
          message: data.error || "Connection failed",
          latencyMs: data.latencyMs ?? clientLatencyMs,
        });
      }
    } catch {
      const clientLatencyMs = Math.round(performance.now() - clientStartTime);
      setConnectionResult({
        status: "error",
        message: "Could not reach the dashboard server. Is it running?",
        latencyMs: clientLatencyMs,
      });
    }
  }, [apiUrl, apiKey]);

  const handleSave = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, []);

  const handleReset = useCallback(() => {
    clearSettings();
    setConnectionResult({ status: "idle", message: "" });
    setShowServerInfo(false);
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
          {/* Connection Settings Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>API Connection</CardTitle>
                  <CardDescription>
                    Enter your OpenClaw API credentials to connect the dashboard.
                    Settings are stored locally in your browser.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div
                    className={`h-2.5 w-2.5 rounded-full transition-colors ${
                      connectionResult.status === "success"
                        ? "bg-green-500"
                        : connectionResult.status === "error"
                        ? "bg-red-500"
                        : connectionResult.status === "testing"
                        ? "bg-yellow-500 animate-pulse"
                        : "bg-muted-foreground/40"
                    }`}
                  />
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {connectionResult.status === "success"
                      ? "Connected"
                      : connectionResult.status === "error"
                      ? "Failed"
                      : connectionResult.status === "testing"
                      ? "Testing..."
                      : "Not tested"}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* API URL Field */}
              <div className="space-y-2">
                <Label htmlFor="api-url">API URL</Label>
                <Input
                  id="api-url"
                  type="text"
                  placeholder={defaultApiUrl}
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  autoComplete="url"
                />
                <p className="text-xs text-muted-foreground">
                  The base URL of your OpenClaw instance (e.g.{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    http://localhost:8000
                  </code>
                  ). Can also be set via the{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    OPENCLAW_API_URL
                  </code>{" "}
                  environment variable.
                </p>
              </div>

              {/* API Key Field */}
              <div className="space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <div className="relative">
                  <Input
                    id="api-key"
                    type={showApiKey ? "text" : "password"}
                    placeholder="Enter your API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoComplete="off"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your OpenClaw API key for authentication. Stored securely in
                  browser localStorage.
                </p>
              </div>

              {/* Connection Test Result */}
              {connectionResult.status !== "idle" && (
                <div
                  className={`rounded-lg border p-4 text-sm transition-all ${
                    connectionResult.status === "success"
                      ? "border-green-500/30 bg-green-500/10"
                      : connectionResult.status === "error"
                      ? "border-red-500/30 bg-red-500/10"
                      : "border-border bg-muted"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 mt-0.5">
                      {connectionResult.status === "testing" && (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      )}
                      {connectionResult.status === "success" && (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}
                      {connectionResult.status === "error" && (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-medium ${
                          connectionResult.status === "success"
                            ? "text-green-400"
                            : connectionResult.status === "error"
                            ? "text-red-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {connectionResult.message}
                      </p>

                      {connectionResult.latencyMs !== undefined && (
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            {connectionResult.latencyMs}ms
                          </span>
                          {connectionResult.endpoint && (
                            <span>
                              via <code className="rounded bg-muted px-1 py-0.5">{connectionResult.endpoint}</code>
                            </span>
                          )}
                        </div>
                      )}

                      {connectionResult.serverInfo &&
                        Object.keys(connectionResult.serverInfo).length > 0 && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => setShowServerInfo(!showServerInfo)}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                            >
                              {showServerInfo ? "Hide" : "Show"} server details
                            </button>
                            {showServerInfo && (
                              <pre className="mt-2 rounded-md bg-background/50 p-3 text-xs overflow-x-auto text-muted-foreground border border-border">
                                {JSON.stringify(connectionResult.serverInfo, null, 2)}
                              </pre>
                            )}
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-3 sm:flex-row sm:justify-between">
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={connectionResult.status === "testing"}
                  className="flex-1 sm:flex-none"
                >
                  {connectionResult.status === "testing" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Test Connection
                </Button>
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="flex-1 sm:flex-none"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset
                </Button>
              </div>
              <Button
                onClick={handleSave}
                className="w-full sm:w-auto"
              >
                {saved ? (
                  <CheckCircle className="mr-2 h-4 w-4" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {saved ? "Saved!" : "Save Settings"}
              </Button>
            </CardFooter>
          </Card>

          {/* Appearance Card */}
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Theme preference is saved in localStorage and persists across sessions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>Theme</Label>
                <ThemeSelector />
              </div>
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
                All settings are persisted in your browser&apos;s localStorage.
                No data is sent to any external server beyond your configured
                OpenClaw instance. Clearing your browser data will reset these
                settings. Changes sync automatically across open tabs.
              </p>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Persisted keys:</p>
                <div className="space-y-1">
                  {Object.entries(SETTINGS_STORAGE_KEYS).map(([label, key]) => (
                    <div key={key} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground capitalize">{label.replace(/([A-Z])/g, " $1").trim()}</span>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">{key}</code>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
