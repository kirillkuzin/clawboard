# ClawBoard

> Self-hosted admin dashboard for [OpenClaw](https://github.com/openclaw/openclaw) AI agent framework — with real-time pixel-art office visualization.

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)
![PixiJS](https://img.shields.io/badge/PixiJS-8-e72264?logo=pixijs)
![License](https://img.shields.io/badge/License-MIT-green)

## Overview

ClawBoard connects directly to the OpenClaw gateway via **WebSocket JSON-RPC** and authenticates using **Ed25519 device identity** — the same protocol the built-in control UI uses. No REST API, no API keys, no proxy layers.

The home page features a **pixel-art office** rendered with PixiJS where agents appear as animated characters in real time.

### Features

- **Gateway-native** — WebSocket JSON-RPC with Ed25519 challenge-response auth
- **Pixel-Art Office** — Real-time PixiJS canvas visualization of agent activity
- **Skills Management** — Install, enable/disable skills via `skills.status` / `skills.install` / `skills.update`
- **Agents** — Browse and inspect agents via `agents.list`
- **Sessions** — View active sessions and chat history via `sessions.list` / `chat.history`
- **Models & Providers** — See available models grouped by provider via `models.list`
- **Channels** — Monitor channel connection status via `channels.status`
- **Cron Jobs** — Full CRUD via `cron.list` / `cron.add` / `cron.update` / `cron.remove`
- **Plugins & Tools** — Browse tool catalog via `tools.catalog`
- **Webhooks** — View hook mappings from config via `config.get`
- **Monitoring Dashboard** — System health, cost tracking, token usage, alerts, trends
- **Device Pairing** — Approve/reject device pairing requests
- **Dark/Light Theme** — Toggle with localStorage persistence
- **Responsive** — Desktop, tablet, and mobile
- **Docker Ready** — Standalone output, one-command deployment

## Architecture

```
Browser ──WebSocket──> OpenClaw Gateway (JSON-RPC)
                       ├── Ed25519 device auth (challenge-response)
                       ├── RPC methods (skills, agents, sessions, ...)
                       └── Push events (health, sessions, alerts, ...)
```

All data flows through a single WebSocket connection. No REST API, no server-side proxy.

### Authentication Flow

1. Browser opens WebSocket to gateway
2. Gateway sends `connect.challenge` event with `{challenge, nonce}`
3. Browser signs `challenge:nonce:deviceId` with Ed25519 secret key
4. Browser sends `connect` request with signature + device identity
5. Gateway responds with `authenticated` (scopes granted) or `pending_pairing`

Device identity (Ed25519 keypair) is auto-generated and stored in `localStorage`. First connection requires operator approval (pairing).

### Data Fetching

All sections use the `useGateway()` React context which provides `sendRequest(method, params)`:

| Section | RPC Methods |
|---------|-------------|
| Skills | `skills.status`, `skills.install`, `skills.update` |
| Agents | `agents.list`, `agents.create`, `agents.update`, `agents.delete` |
| Sessions | `sessions.list`, `sessions.get`, `chat.history`, `chat.send` |
| Models | `models.list` |
| Channels | `channels.status`, `channels.logout` |
| Cron Jobs | `cron.list`, `cron.add`, `cron.update`, `cron.remove`, `cron.run` |
| Tools | `tools.catalog` |
| Config | `config.get`, `config.set` |
| Health | `system.health` |
| Metrics | `metrics.cost`, `metrics.token_usage`, `metrics.trends` |
| Pairing | `pairing.list`, `pairing.approve`, `pairing.reject` |

Real-time updates come via server push events (`sessions.changed`, `health.update`, `cost.update`, etc.) after subscribing with `sessions.subscribe`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 15](https://nextjs.org) (App Router, Turbopack) |
| Language | [TypeScript 5](https://www.typescriptlang.org) (strict) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| Visualization | [PixiJS 8](https://pixijs.com) (HTML5 Canvas) |
| Charts | [Recharts](https://recharts.org) |
| Crypto | [tweetnacl](https://github.com/nicktallant/tweetnacl-js) (Ed25519) |
| Icons | [Lucide](https://lucide.dev) |
| Testing | [Vitest](https://vitest.dev) |
| Deployment | Docker (standalone output) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 18+ (20 recommended)
- A running [OpenClaw](https://github.com/openclaw/openclaw) instance

### Quick Start

```bash
git clone https://github.com/kirillkuzin/clawboard.git
cd clawboard
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), go to **Settings**, enter your OpenClaw gateway WebSocket URL (e.g. `ws://localhost:18789`), and click **Connect**.

On first connection, the device will need to be paired — approve it from the OpenClaw operator panel.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_OPENCLAW_GATEWAY_WS_URL` | `ws://localhost:18789` | Gateway WebSocket URL |

```bash
cp .env.example .env.local
# Edit .env.local with your gateway URL
```

## Docker

```bash
# Docker Compose
docker compose up -d

# Or directly
docker build -t clawboard .
docker run -d -p 3000:3000 clawboard
```

## Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── page.tsx                # Home (DashboardLayout)
│   └── settings/               # Standalone settings page
├── components/
│   ├── office/                 # Pixel-art office (PixiJS canvas, sprites)
│   ├── layout/                 # Dashboard shell, sidebar, topbar
│   ├── sections/               # Skills, providers, settings sections
│   ├── crud/                   # Channels, webhooks, plugins, crons
│   ├── conversations/          # Session list & chat history
│   ├── sub-agents/             # Agent list & detail
│   ├── monitoring/             # Dashboard widgets (health, cost, alerts)
│   ├── providers/              # React contexts (theme, realtime, gateway)
│   ├── gateway-guard.tsx       # Shows connection status when not connected
│   └── ui/                     # shadcn/ui base components
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
└── lib/
    ├── gateway-client.ts       # WebSocket JSON-RPC client
    ├── gateway-types.ts        # Protocol type definitions
    ├── device-identity.ts      # Ed25519 keypair management
    ├── gateway/                # Protocol helpers (frames, correlation)
    ├── types.ts                # Resource type definitions
    ├── utils.ts                # cn() + helpers
    └── __tests__/              # Unit tests (86 tests)
```

## Development

```bash
npm run dev          # Dev server (port 3000, Turbopack)
npm run build        # Production build
npm run start        # Start production server
npm run test         # Run tests (Vitest)
npm run test:watch   # Watch mode
```

## Dashboard Sections

### Pixel Office (Home)
Real-time pixel-art canvas where each agent is a programmatically generated sprite. Agents display animation states: idle, working, spawning, despawning.

### Management
| Section | Mode | Gateway Methods |
|---------|------|----------------|
| Skills | Install / Toggle | `skills.status`, `skills.install`, `skills.update` |
| Models & Providers | Read-only | `models.list` |
| Channels | Read-only + Logout | `channels.status`, `channels.logout` |
| Plugins & Tools | Read-only | `tools.catalog` |
| Webhooks | Read-only (from config) | `config.get` |
| Cron Jobs | Full CRUD + Run | `cron.list`, `cron.add`, `cron.update`, `cron.remove`, `cron.run` |

### Monitoring
| Section | Description |
|---------|-------------|
| Sessions | Browse sessions, view chat history |
| Agents | Browse agents, view details and system prompts |
| Dashboard | System health, cost tracking, token usage, alerts, trends |
| Pairing | Approve/reject device pairing requests |

### Settings
- Gateway URL configuration
- Manual Connect / Disconnect / Reset
- Live connection status with latency
- Device identity info (public key, device ID, pairing status, scopes)
- Theme selector

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT — see [LICENSE](LICENSE) for details.

## Acknowledgments

- [OpenClaw](https://github.com/openclaw/openclaw) — The AI agent framework this dashboard manages
- [shadcn/ui](https://ui.shadcn.com) — Beautiful, accessible UI components
- [PixiJS](https://pixijs.com) — Fast 2D rendering engine powering the pixel office
