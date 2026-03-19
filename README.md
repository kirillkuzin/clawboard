# ClawBoard

> Admin dashboard for [OpenClaw](https://github.com/openclaw/openclaw) AI agent framework — featuring a real-time pixel-art office visualization.

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)
![PixiJS](https://img.shields.io/badge/PixiJS-8-e72264?logo=pixijs)
![License](https://img.shields.io/badge/License-MIT-green)

## Overview

ClawBoard is a comprehensive, self-hosted admin dashboard for managing and monitoring an OpenClaw instance. It connects to your OpenClaw REST API and provides full CRUD management for skills, model providers, channels, webhooks, plugins, and cron jobs — plus read-only monitoring for conversations and sub-agents.

The home page features a **pixel-art office** rendered with PixiJS where sub-agents appear as animated characters in real time. Agents spawn, work, idle, and despawn as your OpenClaw instance processes tasks.

### Key Features

- **Pixel-Art Office** — Real-time canvas visualization of agent activity powered by PixiJS
- **CRUD Management** — Skills, Model Providers, Channels, Webhooks, Plugins, Cron Jobs
- **Live Monitoring** — Conversation history and sub-agent activity via WebSocket/SSE
- **Collapsible Sidebar** — Icon-only by default, expands on hover/click, hamburger on mobile
- **Dark/Light Theme** — Toggle with localStorage persistence
- **Connection Health Check** — Test API connectivity from the Settings page
- **Responsive Design** — Works on desktop, tablet, and mobile
- **Docker Ready** — One-command deployment with `docker compose up`
- **No Database** — All settings stored in browser localStorage

## Screenshots

<!-- Add screenshots here -->

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js](https://nextjs.org) (App Router) |
| Language | [TypeScript](https://www.typescriptlang.org) |
| Styling | [Tailwind CSS](https://tailwindcss.com) |
| Components | [shadcn/ui](https://ui.shadcn.com) |
| Visualization | [PixiJS](https://pixijs.com) (HTML5 Canvas) |
| Theming | [next-themes](https://github.com/pacocoursey/next-themes) |
| Icons | [Lucide](https://lucide.dev) |
| Deployment | Docker / Docker Compose |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 18+ (20 recommended)
- A running [OpenClaw](https://github.com/openclaw/openclaw) instance

### Quick Start

```bash
# Clone the repository
git clone https://github.com/kirillkuzin/clawboard.git
cd clawboard

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), navigate to **Settings**, enter your OpenClaw API URL and API key, and hit **Test Connection**.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCLAW_API_URL` | `http://localhost:8000` | Base URL of your OpenClaw instance |
| `CLAWBOARD_PORT` | `3000` | Port to expose ClawBoard on (Docker only) |

Copy `.env.example` to `.env.local` and adjust as needed:

```bash
cp .env.example .env.local
```

## Docker Deployment

### Using Docker Compose (recommended)

```bash
# With default settings
docker compose up -d

# With custom OpenClaw URL
OPENCLAW_API_URL=https://openclaw.example.com docker compose up -d
```

### Using Docker directly

```bash
docker build -t clawboard .
docker run -d -p 3000:3000 -e OPENCLAW_API_URL=http://your-openclaw:8000 clawboard
```

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API routes
│   │   ├── health/         # Connection health check proxy
│   │   ├── sse/            # SSE relay for real-time events
│   │   ├── proxy/          # Generic API proxy to OpenClaw
│   │   ├── conversations/  # Conversations API proxy
│   │   └── sub-agents/     # Sub-agents API proxy (+ stop action)
│   └── settings/           # Settings page (standalone route)
├── components/
│   ├── office/             # Pixel-art office visualization
│   ├── layout/             # Dashboard shell, sidebar, topbar
│   ├── crud/               # CRUD sections (channels, webhooks, plugins, crons)
│   ├── sections/           # Skills, providers, settings sections
│   ├── conversations/      # Conversation list & detail views
│   ├── sub-agents/         # Sub-agent monitoring components
│   ├── providers/          # React context providers (theme, realtime)
│   └── ui/                 # shadcn/ui base components
├── hooks/                  # Custom React hooks
│   ├── use-settings.ts     # localStorage-backed settings
│   ├── use-websocket.ts    # WebSocket connection management
│   ├── use-sse.ts          # SSE connection management
│   ├── use-realtime.ts     # Unified realtime data hook
│   ├── use-crud.ts         # Generic CRUD operations hook
│   └── use-sidebar.ts      # Sidebar state management
└── lib/
    ├── pixel-office/       # PixiJS sprite generation & management
    ├── types/              # TypeScript type definitions
    ├── api-client.ts       # OpenClaw API client
    └── realtime.ts         # Realtime connection utilities
```

## Dashboard Sections

### Pixel Office (Home)
Real-time pixel-art canvas where each sub-agent is represented as a programmatically generated sprite character. Agents have unique color palettes and display animation states: **idle**, **working/typing**, **spawning**, and **despawning**. Hover over any agent to see a tooltip with its name, current task, and uptime.

### Management (CRUD)
| Section | Description |
|---------|-------------|
| **Skills** | Create, edit, delete, and toggle agent skills |
| **Model Providers** | Manage AI model configurations and API endpoints |
| **Channels** | Configure messaging platform connections (Slack, Telegram, etc.) |
| **Webhooks** | Set up webhook integrations with event filtering |
| **Plugins** | Install, enable/disable, and configure plugins |
| **Cron Jobs** | Schedule and manage recurring tasks |

### Monitoring (Read-Only)
| Section | Description |
|---------|-------------|
| **Conversations** | Browse conversation history across all channels |
| **Sub-Agents** | Monitor active sub-agents with stop/kill capability |

### Settings
- API URL and API Key configuration
- **Test Connection** button with latency reporting
- Dark / Light / System theme toggle
- All settings persist in `localStorage`

## Real-Time Architecture

ClawBoard uses a fallback-based approach for real-time data:

1. **WebSocket** — Attempts direct WebSocket connection to OpenClaw
2. **SSE Relay** — Falls back to Next.js API route that polls OpenClaw and relays events via Server-Sent Events
3. **Polling** — Final fallback with configurable interval

The Next.js API routes at `/api/sse` and `/api/proxy` act as a proxy layer, keeping the OpenClaw API key server-side when possible.

## Development

```bash
# Development server with hot reload
npm run dev

# Type checking
npx tsc --noEmit

# Production build
npm run build

# Start production server
npm start

# Lint
npm run lint
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [OpenClaw](https://github.com/openclaw/openclaw) — The AI agent framework this dashboard manages
- [shadcn/ui](https://ui.shadcn.com) — Beautiful, accessible UI components
- [PixiJS](https://pixijs.com) — Fast 2D rendering engine powering the pixel office
- Built with [Ouroboros](https://github.com/Q00/ouroboros) — Specification-first AI development workflow
