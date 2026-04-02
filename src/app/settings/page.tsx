"use client";

import { useState, useCallback } from "react";
import { useSettings, SETTINGS_STORAGE_KEYS } from "@/hooks/use-settings";
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
  Save,
  RotateCcw,
  CheckCircle,
  Loader2,
  Database,
  Wifi,
} from "lucide-react";
import { ThemeSelector } from "@/components/theme-toggle";

export default function SettingsPage() {
  const {
    gatewayUrl,
    setGatewayUrl,
    clearSettings,
    isLoaded,
    defaultGatewayUrl,
  } = useSettings();

  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(() => {
    setGatewayUrl(gatewayUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [gatewayUrl, setGatewayUrl]);

  const handleReset = useCallback(() => {
    clearSettings();
  }, [clearSettings]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="mt-2 text-muted-foreground">
            Configure your OpenClaw gateway connection
          </p>
        </div>

        <div className="space-y-6">
          {/* Gateway Connection Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-muted-foreground" />
                <div>
                  <CardTitle>Gateway Connection</CardTitle>
                  <CardDescription>
                    All communication uses WebSocket JSON-RPC with Ed25519
                    device authentication. No API key needed.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  )
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3 sm:flex-row sm:justify-between">
              <Button
                variant="outline"
                onClick={handleReset}
                className="flex-1 sm:flex-none"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
              <Button onClick={handleSave} className="w-full sm:w-auto">
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
                Theme preference persists across sessions.
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
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                All settings are stored in browser localStorage. No data is
                sent beyond your configured OpenClaw gateway.
              </p>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
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
