# MemAI

An API-first funny image generator. One image service powers:

- a minimal browser UI;
- `POST /v1/images` for any client;
- a signed, asynchronous Slack slash command;
- an MCP tool for Codex, Cursor, and other MCP clients;
- a project-local Cursor `/memai` command.

The MVP uses OpenAI's Image API with `gpt-image-2`. Generation and storage sit behind small interfaces, so video generation and object storage can be added without changing the API consumers.

## Quick start

Requires Node.js 22.19+ and an OpenAI API key with image generation access. This minimum version lets the app use the operating system's trusted certificate store for OpenAI HTTPS requests.

```bash
nvm use
npm install
cp .env.example .env
# Add OPENAI_API_KEY to .env
npm run dev
```

Open [http://localhost:4317](http://localhost:4317) and log in with `BROWSER_USERNAME` and `BROWSER_PASSWORD`. Generated files are written to `data/images/`.

The default delivered image is a 640×640 low-quality JPEG. GPT Image 2 requires at least 655,360 generated pixels, so MemAI requests the smallest valid square (816×816) and downsizes it to the configured `IMAGE_SIZE`. This is faster and lighter than the previous 1024×1024 default. Change `IMAGE_QUALITY`, `IMAGE_SIZE`, or `OPENAI_IMAGE_MODEL` in `.env` when needed.

## API

POST with a JSON body:

```bash
curl http://localhost:4317/v1/images \
  -H "authorization: Bearer $API_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"prompt":"the deploy works, but nobody knows why"}'
```

An authenticated browser session can also generate directly by putting the URL-encoded prompt in the path:

```bash
open 'http://localhost:4317/images/the%20deploy%20works%2C%20but%20nobody%20knows%20why'
```

`GET /images/:prompt` returns the generated JPEG directly, but only with a valid browser login cookie. An optional `quality` query parameter accepts `low`, `medium`, `high`, or `auto`. Responses use `Cache-Control: no-store` because every request creates a new, billable image.

Response:

```json
{
  "id": "cbaf...",
  "url": "http://localhost:4317/generated-images/cbaf....jpg",
  "mimeType": "image/jpeg",
  "prompt": "the deploy works, but nobody knows why",
  "createdAt": "2026-07-13T10:30:00.000Z"
}
```

`POST /v1/images` always requires `Authorization: Bearer <API_TOKEN>` and fails closed when `API_TOKEN` is unset. The web UI uses a separate signed, HttpOnly session cookie obtained through `POST /auth/login`; it never receives or stores the API bearer. Login and generation POSTs require the exact same origin. Netlify additionally rate-limits login and paid generation functions by client IP.

Only `GET /generated-images/:id` remains public. Generated filenames use random UUIDs, and public reads are necessary for Slack to render the completed image. Generation endpoints, direct Netlify Function URLs, and the browser shortcut all enforce their respective authentication.

## Slack slash command

1. Deploy the service to an HTTPS address. Set `PUBLIC_BASE_URL` to that address so Slack can fetch generated images.
2. Create a Slack app and a slash command named `/memai`.
3. Set its Request URL to `https://YOUR_DOMAIN/integrations/slack/commands`.
4. Copy the app's Signing Secret into `SLACK_SIGNING_SECRET`.
5. Optionally copy the workspace ID into `SLACK_TEAM_ID` to reject signed requests from any other workspace.
6. Re-deploy, reinstall the Slack app if Slack asks, and use `/memai the sprint scope arriving on Friday afternoon`.

The handler validates Slack's HMAC signature and five-minute replay window. It acknowledges immediately, generates in the background, then posts through Slack's temporary `response_url`. This is necessary because Slack requires acknowledgment within three seconds while image generation can take much longer.

### `@MemAI` mentions and threads

MemAI can also respond when mentioned in a channel or an existing thread:

```text
@MemAI žltý kôň rieši príliš ťažký štvrtok
```

1. Under **OAuth & Permissions**, add the bot scopes `app_mentions:read` and `chat:write`.
2. Reinstall the Slack app and copy its **Bot User OAuth Token** into `SLACK_BOT_TOKEN`.
3. Under **Event Subscriptions**, enable events and use `https://YOUR_DOMAIN/integrations/slack/events` as the Request URL.
4. Subscribe to the bot event `app_mention` and save the changes.

Top-level mentions receive a top-level bot response. Mentions made inside an existing thread receive the generated image in that same thread. The message names the requesting Slack user.

## Netlify deployment

The repository includes `netlify.toml` and dedicated Netlify Functions. The static UI is served from `public/`; API and browser generation run as synchronous Functions; generated images are persisted in Netlify Blobs; and Slack image generation runs in a Background Function.

Configure these environment variables in Netlify:

```text
OPENAI_API_KEY
API_TOKEN
BROWSER_USERNAME=admin
BROWSER_PASSWORD
SESSION_SECRET
SLACK_SIGNING_SECRET
# Optional single-workspace lock
SLACK_TEAM_ID
# Required for @MemAI app mentions and thread replies
SLACK_BOT_TOKEN
OPENAI_IMAGE_MODEL=gpt-image-2
IMAGE_QUALITY=low
IMAGE_SIZE=640x640
```

`PUBLIC_BASE_URL` is optional on Netlify because the runtime falls back to Netlify's built-in `URL` variable. Set it explicitly when using a custom domain.

The Slack command endpoint is:

```text
https://YOUR_SITE.netlify.app/integrations/slack/commands
```

The synchronous Slack Function verifies the original signature, forwards the exact signed request to the Background Function, and immediately acknowledges Slack. The Background Function verifies the signature again before generating a paid image, stores the result in Netlify Blobs, and posts it through Slack's temporary `response_url`.

The Slack Events endpoint uses the same signature verification and background-processing pattern. It ignores Slack retry deliveries and posts mention results with `chat.postMessage`, preserving `thread_ts` for thread replies.

## Cursor

This repository includes both:

- `.cursor/mcp.json`, which starts the local `create_memai` MCP tool;
- `.cursor/commands/memai.md`, which exposes `/memai` in Cursor chat.

The Cursor MCP config launches Node directly with an absolute path to the `tsx` import hook. Both the loader and server paths are absolute so a user-level Cursor process can start MemAI without inheriting the repository as its working directory. It intentionally does not use `npm run dev:mcp`, because npm and the `tsx` CLI can emit startup output or open an IPC socket before the MCP stdio handshake.

Start the API with `npm run dev`, restart Cursor after opening the project, and use:

```text
/memai the database migration watching everyone roll back
```

The checked-in configuration points to `https://memai-138.netlify.app`. The MCP process loads `MEMAI_API_TOKEN` from the ignored project `.env`, so the bearer never enters `.cursor/mcp.json` or Git. Restart Cursor after changing the file or token.

## Codex

Codex can call the same MCP tool. Register the project server once (replace the path if the repository moves):

```bash
codex mcp add memai \
  --env MEMAI_API_URL=https://memai-138.netlify.app \
  -- npm --prefix /Users/axel/Projects/memai run dev:mcp
```

The server reads `MEMAI_API_TOKEN` from the ignored project `.env`. Begin a new Codex task after changing the registration, then ask it to use `create_memai`.

For Codex CLI builds that support custom prompt commands, an optional slash-command shim is included:

```bash
mkdir -p ~/.codex/prompts
cp integrations/codex/memai.md ~/.codex/prompts/memai.md
```

Invoke it as:

```text
/prompts:memai the bug disappearing when screen sharing starts
```

MCP is the durable integration; the prompt file is only a convenience alias and custom-command availability can differ between Codex surfaces.

## Architecture

```text
Web / Slack / MCP
        │
        ▼
   ImageService
    ├── ImageGenerator ── OpenAI Image API
    └── ImageStore ────── local files (MVP)
```

The first production upgrade should replace `LocalImageStore` with S3/R2-compatible object storage. After that, add a job queue for reliable Slack work and rate limiting per user/workspace. Video can then be introduced as a second generator and asynchronous job type without breaking `POST /v1/images`.

## Verification

```bash
npm run build
npm test
```

The tests cover prompt shaping, the generation/storage boundary, API auth and validation, Slack signature verification, and asynchronous Slack responses.

## License

MemAI is free and open-source software licensed under the [MIT License](LICENSE). You may use, modify, distribute, and commercially use it, subject to the license notice.

## Source guidance

- [OpenAI image generation guide](https://developers.openai.com/api/docs/guides/image-generation)
- [GPT Image 2 model](https://developers.openai.com/api/docs/models/gpt-image-2)
- [Slack slash commands](https://docs.slack.dev/interactivity/implementing-slash-commands/)
- [Slack request verification](https://docs.slack.dev/authentication/verifying-requests-from-slack/)
- [Cursor custom commands](https://docs.cursor.com/en/agent/chat/commands)
