# ClawBoard

Self-hosted real-time admin dashboard for [OpenClaw](https://github.com/openclaw/openclaw) AI agent framework. Connects to the gateway via WebSocket JSON-RPC with Ed25519 device auth. Features a pixel-art office visualization (PixiJS) where agents appear as animated sprites.

## Tech Stack

- **Framework:** Next.js 15 (App Router), TypeScript, standalone output (Docker-ready)
- **Styling:** Tailwind CSS 4, shadcn/ui components, CSS variables for theming (class-based dark mode)
- **Graphics:** PixiJS 8 (pixel-art office canvas)
- **Charts:** Recharts
- **Crypto:** tweetnacl (Ed25519 device identity)
- **State:** React Context + custom hooks, settings in localStorage
- **Testing:** Vitest

## Commands

```bash
npm run dev          # Dev server (port 3000)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint
npm run test         # Vitest run once
npm run test:watch   # Vitest watch mode
```

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── settings/           # Standalone settings page
│   └── page.tsx            # Home (DashboardLayout)
├── components/
│   ├── ui/                 # shadcn/ui base components
│   ├── layout/             # Dashboard shell, sidebar, topbar
│   ├── office/             # Pixel-art office (PixiJS canvas, sprites)
│   ├── sections/           # Skills, providers, settings sections
│   ├── crud/               # Channels, webhooks, plugins, crons
│   ├── conversations/      # Session list & chat history
│   ├── sub-agents/         # Agent list & detail
│   ├── monitoring/         # Dashboard widgets (health, cost, alerts)
│   ├── providers/          # React context providers (theme, realtime, gateway)
│   └── gateway-guard.tsx   # Connection status guard component
├── hooks/
│   ├── use-settings.ts         # Gateway URL in localStorage
│   ├── use-gateway-monitor.ts  # Gateway WebSocket lifecycle + polling
│   ├── use-gateway-skills.ts   # skills.status / install / update
│   ├── use-gateway-sessions.ts # sessions.list / get + chat.history
│   ├── use-gateway-agents.ts   # agents.list / create / update / delete
│   ├── use-gateway-channels.ts # channels.status
│   ├── use-gateway-crons.ts    # cron.list / add / update / remove / run
│   ├── use-gateway-models.ts   # models.list
│   ├── use-gateway-tools.ts    # tools.catalog
│   └── use-gateway-config.ts   # config.get / set
├── lib/
│   ├── gateway-client.ts   # WebSocket JSON-RPC client
│   ├── gateway-types.ts    # Protocol type definitions
│   ├── device-identity.ts  # Ed25519 keypair management
│   ├── gateway/            # Protocol helpers (frames, correlation)
│   ├── types.ts            # Resource type definitions
│   ├── utils.ts            # cn() utility + helpers
│   └── __tests__/          # Unit tests
```

## Architecture

### Gateway Communication
All communication with OpenClaw uses **WebSocket JSON-RPC** via the gateway protocol. No REST API — OpenClaw doesn't have one. The browser connects directly to the gateway WebSocket.

**Auth flow:** ws.open -> server sends `connect.challenge` event -> client signs `challenge:nonce:deviceId` with Ed25519 -> sends `connect` request -> server responds with `authenticated` / `pending_pairing` / `rejected`.

Key RPC methods: `skills.status`, `agents.list`, `sessions.list`, `channels.status`, `cron.list`, `models.list`, `tools.catalog`, `config.get`, `system.health`.

All data fetching goes through `useGateway()` context -> `sendRequest(method, params)`.

### Settings
Gateway URL stored in browser localStorage (`clawboard_gateway_ws_url`). Managed via `useSettings()` hook with cross-tab sync. No API key — authentication uses Ed25519 device identity.

### Connection Behavior
- No auto-connect on page load — user clicks Connect manually
- Single connection attempt; no reconnect loop on failure
- Auto-reconnect only if a previously authenticated session drops
- Push events for real-time updates after `sessions.subscribe`
- 30-second polling for metrics (cost, token usage, trends)

## Conventions

- `"use client"` on all interactive components
- Path alias: `@/*` -> `./src/*` (always use `@/` imports, no relative paths)
- `cn()` for conditional Tailwind classes (clsx + tailwind-merge)
- Types: `FooFormData` for form payloads, constants as `UPPER_SNAKE_CASE`
- One component per file, PascalCase filenames for components, `use-kebab-case` for hooks
- Named exports preferred; default exports only for page components
- Strict TypeScript, no `any`

## Environment Variables

| Variable | Default | Scope |
|----------|---------|-------|
| `NEXT_PUBLIC_OPENCLAW_GATEWAY_WS_URL` | `ws://localhost:18789` | Client |

## Adding Features

**New gateway section:** Create `use-gateway-foo.ts` hook using `useGateway().sendRequest()` -> create component in `components/` with `<GatewayGuard>` wrapper -> add nav item to `sidebar.tsx` -> add render case to `dashboard-layout.tsx`.
