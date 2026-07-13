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

Open [http://localhost:4317](http://localhost:4317). Generated files are written to `data/images/`.

The default delivered image is a 640×640 low-quality JPEG. GPT Image 2 requires at least 655,360 generated pixels, so MemAI requests the smallest valid square (816×816) and downsizes it to the configured `IMAGE_SIZE`. This is faster and lighter than the previous 1024×1024 default. Change `IMAGE_QUALITY`, `IMAGE_SIZE`, or `OPENAI_IMAGE_MODEL` in `.env` when needed.

## API

POST with a JSON body:

```bash
curl http://localhost:4317/v1/images \
  -H 'content-type: application/json' \
  -d '{"prompt":"the deploy works, but nobody knows why"}'
```

To generate directly from a browser, put the URL-encoded prompt in the path:

```bash
open 'http://localhost:4317/images/the%20deploy%20works%2C%20but%20nobody%20knows%20why'
```

`GET /images/:prompt` returns the generated JPEG directly, so it can also be used as an `<img src="...">`. An optional `quality` query parameter accepts `low`, `medium`, `high`, or `auto`. Responses use `Cache-Control: no-store` because every request creates a new, billable image.

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

Set `API_TOKEN` to require `Authorization: Bearer <token>` on this route. Leave it empty for the zero-configuration browser demo; a public deployment should add identity-aware auth and rate limiting before exposing generation to untrusted users.

## Slack slash command

1. Deploy the service to an HTTPS address. Set `PUBLIC_BASE_URL` to that address so Slack can fetch generated images.
2. Create a Slack app and a slash command named `/memai`.
3. Set its Request URL to `https://YOUR_DOMAIN/integrations/slack/commands`.
4. Copy the app's Signing Secret into `SLACK_SIGNING_SECRET`.
5. Use `/memai the sprint scope arriving on Friday afternoon`.

The handler validates Slack's HMAC signature and five-minute replay window. It acknowledges immediately, generates in the background, then posts through Slack's temporary `response_url`. This is necessary because Slack requires acknowledgment within three seconds while image generation can take much longer.

## Cursor

This repository includes both:

- `.cursor/mcp.json`, which starts the local `create_memai` MCP tool;
- `.cursor/commands/memai.md`, which exposes `/memai` in Cursor chat.

The Cursor MCP config launches Node directly with an absolute path to the `tsx` import hook. Both the loader and server paths are absolute so a user-level Cursor process can start MemAI without inheriting the repository as its working directory. It intentionally does not use `npm run dev:mcp`, because npm and the `tsx` CLI can emit startup output or open an IPC socket before the MCP stdio handshake.

Start the API with `npm run dev`, restart Cursor after opening the project, and use:

```text
/memai the database migration watching everyone roll back
```

For a deployed API, change `MEMAI_API_URL` in `.cursor/mcp.json`. If `API_TOKEN` is enabled, add `MEMAI_API_TOKEN` to the MCP server environment.

## Codex

Codex can call the same MCP tool. Register the project server once (replace the path if the repository moves):

```bash
codex mcp add memai \
  --env MEMAI_API_URL=http://localhost:4317 \
  -- npm --prefix /Users/axel/Projects/ai-giphy run dev:mcp
```

Then start the API with `npm run dev`, begin a new Codex task, and ask it to use `create_memai`.

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

## Source guidance

- [OpenAI image generation guide](https://developers.openai.com/api/docs/guides/image-generation)
- [GPT Image 2 model](https://developers.openai.com/api/docs/models/gpt-image-2)
- [Slack slash commands](https://docs.slack.dev/interactivity/implementing-slash-commands/)
- [Slack request verification](https://docs.slack.dev/authentication/verifying-requests-from-slack/)
- [Cursor custom commands](https://docs.cursor.com/en/agent/chat/commands)
