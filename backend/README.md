# OCTO Backend, Cloudflare Worker (Free plan)

This backend is additive. It does not replace the OCTO GitHub Edition frontend, IndexedDB storage, or BYOK fallback. The Worker holds the permanent Gemini secret server-side only. The frontend never sees that secret. It uses only a short-lived Live token when one can be issued, or still-image analysis through the Worker when Live token minting is unavailable.

## What the Worker does

- `GET /health`: status and whether a Gemini secret is configured, boolean only, never the key.
- `POST /api/chat`: validates messages and model, then streams Gemini responses back to OCTO. The permanent key is used server-side only.
- `POST /api/live-token`: mints a Gemini Live ephemeral token, uses 1, messages expire in 30 minutes, new sessions must start within 60 seconds, locked to a Live model and TEXT response modality. If Gemini cannot issue a token for this key or model, the Worker returns available false and OCTO uses still-image analysis, labeled as such. Full Live WebSocket voice and video streaming is not implemented in this slice.
- `POST /api/vision`: still-image analysis through the Worker, objects, OCR text, and scene description. The image is sent to Gemini for that one analysis and is not stored or logged by the Worker.
- `GET /api/usage`: counts only, requests, chat requests, Live tokens, vision requests, and errors. No prompts, images, keys, or user content are logged.
- Auth and CORS: Origin is checked against ALLOWED_ORIGIN (default https://vincenthenry21.github.io, plus localhost for development). An optional OCTO_APP_TOKEN Worker secret, when set, must be sent as the X-Octo-App-Token header. When no app token is set, the Worker still enforces Origin, request validation, and rate limiting. That is a personal-use gate, not a full user authentication system.
- Rate limits, per client: Chat 20 requests per minute, Vision 20 per minute, Live tokens 10 per hour, Health and Usage 60 per minute. Over the limit, the Worker returns HTTP 429 with a retry message. These limits are per Worker isolate in this code, so also add a Cloudflare rate limiting rule in the Dashboard for a hard global cap if you want one.

## Files

- `backend/worker/index.ts`: routing, validation, CORS, error handling, usage counts.
- `backend/worker/gemini.ts`: Gemini REST calls, Live ephemeral token creation (v1alpha authTokens), still-image analysis.
- `backend/worker/auth.ts`: Origin allowlist, CORS headers, optional app token check.
- `backend/worker/rateLimit.ts`: per-client token bucket limits.
- `backend/worker/types.ts`: Worker environment, request shapes, model allowlist.
- `wrangler.toml` at the repo root: Worker name octo-ai-assistant, main backend/worker/index.ts.

## Setup, iPhone and iPad only, Safari, no computer needed

You need a free Cloudflare account, the OCTO GitHub repository, and a Gemini API key you can copy from Google AI Studio in Safari. Do not paste any key into chat, GitHub, or OCTO. Keys go only into Cloudflare Worker Secrets and, for BYOK fallback, into OCTO Settings on the device.

### Step 1. Create a free Cloudflare account

1. Open Safari, go to dash.cloudflare.com.
2. Tap Sign Up, enter an email address, create a password, and confirm the email Cloudflare sends you.
3. If you already have a Cloudflare account, sign in instead. Do not create a second account.

### Step 2. Connect the Worker to GitHub with Workers Builds

1. In the Cloudflare Dashboard, tap Workers and Pages, then Create, then Worker, then Import a repository, or Workers Builds, depending on the Dashboard wording on your screen.
2. Connect your GitHub account if asked, and allow Cloudflare to access the octo-ai-assistant repository.
3. Select the octo-ai-assistant repository and the main branch.
4. Set the Worker to use the wrangler.toml file at the repo root. Leave the build command as Cloudflare suggests for a Worker using wrangler.toml. Do not set a Vite build command here, that build is for the GitHub Pages frontend, not for this Worker.
5. Tap Deploy. The first deploy can take a minute or two. Wait for the success message before moving on.

### Step 3. Add the Gemini secret

1. In the Dashboard, open your Worker, then Settings, then Variables.
2. Tap Add variable, name it exactly GEMINI_API_KEY.
3. Paste your Gemini API key into the value field.
4. Turn on Encrypt, so the value is stored as a secret and is never shown again.
5. Tap Save, then tap Deploy again if the Dashboard asks you to redeploy for the secret to take effect.
6. Optional, same screen: add OCTO_APP_TOKEN with a long random value you invent, with Encrypt on. If you set it, you must enter the same value in OCTO Settings on your phone or iPad each session. If you skip it, the Worker still enforces Origin, validation, and rate limits.

### Step 4. Copy the Worker URL

1. On the Worker overview page, copy the Worker URL. It looks like https://octo-ai-assistant.your-subdomain.workers.dev.
2. Keep that URL. You paste it into OCTO, not into chat.

### Step 5. Connect OCTO to the Worker

1. Open OCTO on your phone or iPad, from its GitHub Pages link.
2. Go to Control Center, then Backend Connection.
3. Paste the Worker URL into the Worker URL field.
4. If you set OCTO_APP_TOKEN in Step 3, type it into the App token field. It is kept in app memory only, even if you remember the Worker URL.
5. If you want OCTO to remember the Worker URL on this device, tick Remember Worker URL on this device. It is off by default.
6. Tap Validate Worker. You should see Worker connected, plus whether the Gemini secret is configured.
7. If it says Worker connected but the Gemini secret is not configured, go back to Step 3 and check the secret name and Encrypt setting, then Validate again.
8. Send a test chat message. When the Worker is validated, Chat prefers the Worker. If the Worker fails and you have a BYOK key entered, Chat shows a clear notice that it is falling back to BYOK for that message.
9. Open Chat, then Live Vision, tap Start camera, then Analyze this frame. The result is labeled Still image analysis, and is not presented as a Live connection.

### Step 6. Automatic deployment from now on

Pushing to the main branch of the GitHub repository triggers a Workers Builds deploy automatically, and a GitHub Pages deploy for the frontend. You do not need a computer or a terminal for either. If a deploy fails, check the Workers Builds logs in the Dashboard, fix the issue in the repository, and push again.

## Troubleshooting, browser-only steps

### Secret not set

Symptom: Validate Worker says the Gemini secret is not configured, or Chat shows a missing secret error.
Fix: In the Worker, Settings, Variables, check that the variable name is exactly GEMINI_API_KEY, that Encrypt is on, and that you redeployed after saving. A variable with a typo in the name is treated as not set.

### CORS origin mismatch

Symptom: Validate Worker fails in Safari, or Chat says the Worker cannot be reached, while the Worker URL opens fine on its own.
Fix: Open OCTO from its GitHub Pages origin, not from a file or a different host. In wrangler.toml, ALLOWED_ORIGIN must match the Pages origin https://vincenthenry21.github.io. If you change the Pages host, update ALLOWED_ORIGIN in the repository and redeploy the Worker.

### Rate limit

Symptom: Chat or Vision returns a too many requests message.
Fix: Wait until the retry time shown, then try again. Limits are Chat 20 per minute, Vision 20 per minute, Live tokens 10 per hour. Sending many messages in a row, or tapping Analyze repeatedly, can hit the limit.

### Live token failure

Symptom: Live Vision says the Live token is not available.
Fix: This is expected when Gemini cannot issue a token for the key or model, and it is not a setup error on your side. Use still-image analysis, which is labeled as such. Check that the Worker secret is a valid Gemini key, and that Validate Worker shows the secret as configured. If a fresh key still cannot issue tokens, still-image mode is the supported path in this slice.

### Worker not connected

Symptom: Validate Worker says it could not reach the Worker.
Fix: Check the Worker URL for typos, check that the Worker deploy succeeded in the Dashboard, check your connection, and try Validate again. If the Worker was just deployed, wait a minute and retry.

### App token rejected

Symptom: Chat or Vision says an app token is required.
Fix: Type the exact OCTO_APP_TOKEN value into OCTO Settings, in app memory only, and Validate again. If you do not want an app token, remove it from Worker Variables and redeploy.

## Monitoring

Use Cloudflare Dashboard analytics for the Worker for traffic and errors, and GET /api/usage from the Worker for counts only. Neither surface logs prompts, images, keys, or user content.

## Status

Backend code is complete and untested against a live Worker. No Cloudflare account or secret was available in this build, so no live Worker deploy, no live Gemini test, and no live Live token test is claimed. Deployment awaits your Cloudflare setup in the steps above.
