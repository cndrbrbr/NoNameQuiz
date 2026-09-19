# NoNameQuiz KI-Proxy

Minimal, stateless Node/Express proxy in front of a self-hosted,
OpenAI-compatible Mistral endpoint (`mistral.cndrbrbr.de`). Implements F8
(`/api/generate-questions`) from [../features.md](../features.md); see
[../architecture.md](../architecture.md#ki-komponente-fragengenerierung--tipps)
for the full rationale. `/api/generate-review-questions` (F9) and
`/api/teaching-tips` (F10) are separate, not-yet-built steps.

It stores nothing — every request is answered directly from the model's
response. The only persistence in the app remains IndexedDB in the browser.

## Setup

```bash
cd server
npm install
cp .env.example .env   # adjust if your Mistral endpoint/model differs
npm start
```

Runs on `http://localhost:3000` by default (`PORT` in `.env`).

## Endpoint

`POST /api/generate-questions`

Request body:

```json
{
  "topic": "Bruchrechnung, Klasse 7",
  "subject": "Mathematik",
  "count": 5,
  "materials": [
    { "filename": "arbeitsblatt.md", "mimeType": "text/markdown", "content": "..." },
    { "filename": "skript.pdf", "mimeType": "application/pdf", "content": "<base64>" }
  ]
}
```

`materials` is optional. Text materials (`text/plain`, `text/markdown`) are
sent as plain text in `content`; PDFs are sent base64-encoded in `content`
and converted to text server-side via `pdf-parse` before being added to the
prompt.

Response: a question set in the app's [upload
format](../architecture.md#format-für-den-fragen-upload-json):

```json
{
  "title": "Mathematik – Bruchrechnung, Klasse 7",
  "subject": "Mathematik",
  "questions": [
    {
      "text": "Was ist 1/2 + 1/4?",
      "options": { "A": "1/6", "B": "3/4", "C": "2/6", "D": "1/4" },
      "correctAnswer": "B"
    }
  ]
}
```

On failure (model unreachable, or its response isn't valid JSON matching the
expected shape), responds `502` with `{ "error": "..." }`.

## Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port the proxy listens on |
| `MISTRAL_BASE_URL` | `https://mistral.cndrbrbr.de/v1` | Base URL of the OpenAI-compatible endpoint |
| `MISTRAL_MODEL` | `mistral` | Model name passed to `/chat/completions` |
| `ALLOWED_ORIGIN` | `*` | CORS origin allowed to call this proxy from the browser |

No auth is configured — `mistral.cndrbrbr.de` doesn't require any today. If
that changes, add the header in `lib/mistralClient.js` (a comment marks
where).

## Deploying alongside the app

The app (`../index.html` etc.) is static and can be hosted anywhere; it
calls this proxy over HTTP, so point `AiService`'s `PROXY_BASE_URL` (top of
`../ai-service.js`) at wherever this server ends up running, and set
`ALLOWED_ORIGIN` here to match the app's origin.
