# ClawBoard

Self-hosted real-time admin dashboard for [OpenClaw](https://github.com/openclaw/openclaw) AI agent framework. Provides CRUD management for skills, providers, channels, webhooks, plugins, cron jobs, and real-time monitoring of conversations and sub-agents. Features a pixel-art office visualization (PixiJS) where sub-agents appear as animated sprites.

## Tech Stack

- **Framework:** Next.js 15 (App Router), TypeScript, standalone output (Docker-ready)
- **Styling:** Tailwind CSS 4, shadcn/ui components, CSS variables for theming (class-based dark mode)
- **Graphics:** PixiJS 8 (pixel-art office canvas)
- **Charts:** Recharts
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
│   ├── api/                # API routes (proxy, SSE relay, health)
│   │   └── proxy/[...path] # Proxies requests to OpenClaw API
│   ├── settings/           # Settings page
│   └── page.tsx            # Home (DashboardLayout)
├── components/
│   ├── ui/                 # shadcn/ui base components
│   ├── layout/             # Dashboard shell, sidebar, topbar
│   ├── office/             # Pixel-art office (PixiJS canvas, sprites)
│   ├── sections/           # Skills, providers, settings sections
│   ├── crud/               # Channels, webhooks, plugins, crons CRUD
│   ├── conversations/      # Conversation monitoring
│   ├── sub-agents/         # Sub-agent monitoring
│   ├── monitoring/         # Advanced monitoring panels
│   └── providers/          # React context providers (theme, realtime)
├── hooks/                  # Custom hooks (use-crud, use-settings, use-realtime, etc.)
├── lib/
│   ├── types.ts            # All OpenClaw resource types & constants
│   ├── api-client.ts       # Connection config, proxy fetch wrapper
│   ├── utils.ts            # cn() utility
│   ├── gateway/            # Gateway connection utilities
│   └── __tests__/          # Unit tests
```

## Architecture

### Gateway Communication
All communication with OpenClaw uses **WebSocket JSON-RPC** via the gateway protocol. No REST API — OpenClaw doesn't have one. The browser connects directly to the gateway WebSocket and authenticates via **Ed25519 device identity** (challenge-response signing).

Key RPC methods: `skills.status`, `agents.list`, `sessions.list`, `channels.status`, `cron.list`, `models.list`, `tools.catalog`, `config.get`, `system.health`.

All data fetching goes through `useGateway()` context → `sendRequest(method, params)`.

### Settings
Gateway URL stored in browser localStorage (`clawboard_gateway_ws_url`). Managed via `useSettings()` hook with cross-tab sync. No API key needed — authentication uses Ed25519 device identity.

### Real-Time Data
Fallback chain: WebSocket (primary) -> SSE (`/api/sse`) -> Polling. Managed by `useRealtime()` hook.

### Generic CRUD Pattern
All resource sections use `useCrud<T>({ basePath })` which returns `{ items, loading, error, fetchItems, createItem, updateItem, deleteItem }`. Handles response normalization from various API shapes.

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
| `OPENCLAW_API_URL` | `http://localhost:8000` | Server |
| `NEXT_PUBLIC_OPENCLAW_API_URL` | same | Client |
| `NEXT_PUBLIC_OPENCLAW_GATEWAY_WS_URL` | `ws://localhost:8080/ws` | Client |

## Adding Features

**New CRUD section:** Add type to `lib/types.ts` -> create component in `components/crud/` using `useCrud()` -> add nav item to `sidebar.tsx` -> add render case to `dashboard-layout.tsx`.

**New API route:** Create `src/app/api/[feature]/route.ts` with typed `GET`/`POST` handlers returning `NextResponse`.
