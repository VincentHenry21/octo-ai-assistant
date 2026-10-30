# OCTO 1.0 GitHub Edition

OCTO is a personal AI assistant for iPhone and iPad, built as a static Progressive Web App.

Tagline: Your intelligence. Your ecosystem. Your assistant.

Original OCTO identity only. No Marvel branding, characters, voices, logos, or proprietary designs.

## Architecture

iPhone/iPad Safari, Add to Home Screen PWA
- Octo Frontend: React, TypeScript, Vite, Tailwind CSS, Framer Motion
- Octo Backend: Cloudflare Worker (free plan), added as an upgrade on top of this edition. See backend/README.md for setup. GitHub Pages alone is static hosting and cannot provide a private backend, so the Worker is the backend, not Pages.
- Gemini API: Worker backend preferred when validated, client-side Bring Your Own Key (BYOK) direct REST API as fallback
- Database: local-first IndexedDB on this device
- External integrations: Calendar, Tasks, Search, Other APIs are future integrations only. They are not connected in this build, and the app does not claim otherwise.

## Cloudflare backend upgrade, additive

The GitHub Edition frontend is unchanged. A Cloudflare Worker backend was added on top of it, with full setup instructions in backend/README.md. The Worker holds the permanent Gemini secret server-side only, proxies Chat, mints short-lived Gemini Live ephemeral tokens when Gemini can issue them (v1alpha authTokens, uses 1, messages expire in 30 minutes, new sessions within 60 seconds, locked to a Live model and TEXT modality), and provides still-image Vision analysis through the Worker. The frontend keeps BYOK as a fallback, adds a Backend Connection setting in Control Center with a Validate button, prefers the Worker when validated, and falls back to BYOK with a clear label when the Worker fails. Live Vision is a section in Chat with explicit camera start and stop, a visible camera indicator, permission and unsupported states, and still-image analysis labeled as such, never presented as a Live connection when it is not one. Full Live WebSocket voice and video streaming is not implemented in this slice. Backend code is complete and untested against a live Worker, deployment awaits the user's Cloudflare setup, and no live Worker deploy or live Gemini test is claimed.

## What works in this slice

- Navigation: Home, Chat, Workspace, Memory, Control Center (Settings). iPhone bottom tab bar with safe-area insets, iPad and desktop sidebar split view, keyboard-aware chat composer.
- OctoCore: 6 real states (IDLE, LISTENING, THINKING, RESPONDING, EXECUTING, ERROR) tied to app state, with accessible status labels, Framer Motion animations, and reduced-motion support.
- Chat: multi-turn conversations stored in IndexedDB, new, delete, copy, regenerate, markdown rendering, code blocks, streaming Gemini responses, voice push-to-talk and continuous conversation with explicit activation only, and a tool runner for the action engine.
- Intelligence modes: GENERAL, BUSINESS, ACADEMIC, AGENT, with Auto selection from your message and manual selection in Chat and Settings.
- Workspace: Tasks, Notes, Projects with create, read, update, delete, search, and empty states. OCTO starts empty. No seeded tasks, conversations, or stats.
- Memory: save (with explicit confirmation), search, retrieve, edit, delete, clear, export, and import. Conversations are never auto-saved as permanent facts. Only relevant memory snippets, never the whole database, are sent to Gemini with a prompt.
- Action engine: create_task, list_tasks, update_task, complete_task, create_note, search_notes, create_project, list_projects, search_memory, save_memory, calculator, get_current_date, generate_daily_plan. Arguments are validated, results are structured, destructive UI actions need confirmation, save_memory needs confirmation, and no arbitrary code from a model is executed. generate_daily_plan composes a plan from your real tasks and projects only.
- Voice: Web Speech push-to-talk and continuous conversation, speech-to-text, text-to-speech with interrupt and stop, microphone permission handling, and honest unsupported and permission-denied states. No background listening.
- Encryption: Web Crypto AES-GCM for memories and for encrypted export/import, with a password-derived key. The encryption passphrase is kept in memory only and is never stored in browser storage. If you forget it, encrypted data cannot be recovered.
- PWA: manifest, original icons, service worker for the offline application shell only. Gemini requests and responses are never cached by the service worker. Offline AI responses are not available, because no offline model exists in this build.

## Gemini Bring Your Own Key, read this first

- Enter your own Gemini key in Settings, validate the connection, choose a model, and disconnect to clear the key.
- The key is kept in application memory only. It is never hardcoded, never committed, never stored in LocalStorage or IndexedDB by default, never logged, and never sent to analytics.
- Warning: a browser key can be inspected in the browser, so it is not equivalent to a server-side secret. In Google AI Studio, restrict the key to the Gemini API and set usage limits.
- If the key is missing or invalid, OCTO shows an honest error with recovery instructions, including the exact Gemini error where available, for example: API key not valid. Please pass a valid API key. It never invents a Gemini response.
- A valid key entered in OCTO Settings is still required for live AI. The same invalid-key problem that blocks other Gemini apps will surface here as that honest error.

## Setup

```bash
npm install
npm run dev
```

Production build and type check:

```bash
npm run typecheck
npm run build
npm run preview
```

Automated checks:

```bash
node scripts/check.mjs
```

The check script is a CI helper in this repo. It is not part of the app bundle.

## Deployment, GitHub Pages

1. Create a GitHub repository named octo-ai-assistant. This build does not create a repo for you.
2. Push this folder to that repo, on the main branch.
3. In the repo, Settings, Pages, set Build and deployment to GitHub Actions.
4. The included .github/workflows/deploy.yml builds with Node 22 and deploys ./dist to Pages. The Vite base is /octo-ai-assistant/ in GitHub Actions and / locally.
5. The deploy workflow is the full-product deployment target for this static edition. The .nojekyll file in public/ is for Pages compatibility of any static preview only.

No live Pages URL is claimed until the repo exists, Pages is enabled, and the deployed build is verified.

## File list

- .github/workflows/deploy.yml, test.yml
- public/icons/, sounds/, manifest.json, sw.js, .nojekyll
- src/components/OctoCore/, Chat/, Voice/, Dashboard/, Navigation/, Shared/
- src/pages/Home.tsx, Chat.tsx, Workspace.tsx, Memory.tsx, Settings.tsx
- src/services/gemini.ts, memory.ts, encryption.ts, voice.ts, actionEngine.ts
- src/database/indexedDB.ts, conversations.ts, memories.ts, tasks.ts, projects.ts
  - Note: the notes repository lives in src/database/tasks.ts alongside tasks, and projects live in src/database/projects.ts via the project repository in tasks.ts. The file names in the database folder are indexedDB, conversations, memories, tasks, projects.
- src/hooks/, types/, config/, styles/, App.tsx, main.tsx
- index.html, package.json, vite.config.ts, tsconfig.json, postcss.config.js, .gitignore, .env.example, README.md, LICENSE
- scripts/check.mjs (CI check helper, not app code)
- backend/worker/index.ts, gemini.ts, auth.ts, rateLimit.ts, types.ts (Cloudflare Worker, free plan)
- backend/README.md (iPhone and iPad Safari setup, Workers Builds, troubleshooting)
- wrangler.toml (Worker name octo-ai-assistant, main backend/worker/index.ts)
- src/vite-env.d.ts (Vite client types, fixes a pre-existing typecheck failure)
- src/components/Voice/LiveVision.tsx (camera, still-image analysis, Live token status, all labeled)

## Known limitations

- No cloud account, no sync, and no Supabase connection in this edition. Separate devices have separate IndexedDB databases unless you transfer an exported backup.
- No server backend in the Pages-only edition, so there is no server-side secret storage, no server rate limiting, and no server-side tool persistence. Tool actions run locally in the browser after validation. With the Cloudflare Worker upgrade, the Worker adds server-side secret storage, validation, rate limiting, and usage counts, but tool actions still run locally in the browser.
- Voice recognition quality and continuous conversation support depend on the browser. Safari support is more limited than Chrome, and the app falls back to push-to-talk and text.
- Service worker caching covers the app shell and static assets only, never Gemini traffic or private responses.
- Layouts were reviewed in code at phone and iPad widths. No real device screenshot is claimed in this build.
- LICENSE is MIT, copyright 2026 Thit Sar, and can be swapped if you prefer another license.
