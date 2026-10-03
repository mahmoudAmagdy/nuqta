# Nuqta

Arabic OCR extraction: one shared pipeline that turns scanned Arabic documents
into correct, searchable text, with a thin adapter per document type on top.

*Nuqta* (نقطة) is the Arabic word for "dot". A single dot is all that separates
ب from ت from ث, which is a fair summary of why Arabic OCR is hard.

> **Status: in progress, milestone 1 of 8.** There is no live demo yet and the
> accuracy numbers do not exist yet. This README describes what is built today;
> the full write-up comes with milestone 8. See [Build status](#build-status).

## What works today

An image of Arabic text goes in, and lines and words come back with a bounding
polygon and a confidence score each, in one internal shape regardless of which
OCR engine produced them.

```bash
npm install
npm run ocr -- samples/text/nuqta-page-01.png
```

```text
provider=tesseract page=0 1654x966px lines=8 tokens=85
  [0.82] (977,151 527x65) النقطة التى تغيّر المعنى
  [0.89] (167,374 1336x50) في عدد النقاط ومواضعها. لذلك يخطئ القارئ الآلي حين تضيع نقطة في مسح رديء؛ فتصبح «بيت»
  ...
```

That output is raw, and it is wrong in instructive ways. On this page the
self-hosted engine drops a dot (`التي` becomes `التى`), reads the Arabic comma
`،` as a semicolon `؛`, turns the Arabic-Indic digits `١٢٣٤٥` into Latin noise,
and wraps the Latin run `SKU-4471-B` in invisible directional marks. Fixing
what can be fixed after the fact is milestone 2. Measuring the rest, per
engine, is milestone 8.

## Architecture so far

```text
apps/api/src
├── intake/     Stage 1. Validates the upload by its own header, normalises to PNG pages.
├── ocr/        Stage 3. The provider boundary.
│   ├── ocr.types.ts              The internal shape. Nothing downstream sees a provider payload.
│   ├── ocr-provider.ts           The interface an engine implements.
│   ├── provider-broker.service.ts  The only way out of the service to an OCR engine.
│   ├── credentials/              The only place a key lives.
│   └── providers/
│       ├── tesseract/            Self-hosted, no key, no per-page cost.
│       └── azure/                Azure Document Intelligence, prebuilt-read.
├── health/     GET /api/health
└── cli/        The `npm run ocr` runner.
```

Adding an engine means implementing `OcrProvider` and registering it in
`OcrModule`. Nothing else changes.

### Credential brokering

The browser never talks to an OCR provider and never holds a key. Every call
leaves through `ProviderBroker`, and the design makes that hard to get wrong
rather than relying on care:

- **One holder.** `CredentialStore` is provided inside the OCR module and not
  exported, so nothing outside the module can inject it. Keys sit in a private
  field, which keeps them out of `JSON.stringify` and `util.inspect`.
- **Providers do not read the environment.** The broker hands a provider its
  credential for one call.
- **Errors are replaced, not forwarded.** If a provider fails, the client gets
  a fixed message. The upstream detail goes to the server log with the key
  redacted. An upstream error that echoes the key cannot reach a response.
- **Raw payloads are scrubbed** before they leave the broker.
- **The key only goes where the operator pointed it.** Azure answers a
  submission with a URL to poll. The provider refuses that URL unless it is on
  the configured endpoint's origin, and the endpoint must be https.
- **Health reports presence as a boolean.** No key, prefix, or length.

Each of those is a test in `apps/api/src/ocr` or `apps/api/test`.

## Test data policy

Synthetic and public-domain material only. No client documents, no scraped
documents, no identity documents. Passports and ID cards are out of scope
permanently: a public demo that invites uploads of identity documents is a
privacy liability. Provenance for every sample is recorded in
[samples/README.md](samples/README.md).

## Running it

Requires Node 22 or newer.

```bash
npm install
cp .env.example .env        # optional; the defaults run Tesseract with no key
npm run start:api           # http://localhost:3000/api/health
```

| Command | What it does |
| --- | --- |
| `npm run ocr -- <image> [--provider <id>] [--raw] [--out file.json]` | Run one image through intake and the broker |
| `npm test` | Unit tests |
| `npm run test:e2e` | HTTP tests against the assembled app |
| `npm run test:live` | Runs the real Tesseract engine on the sample page |
| `npm run lint` / `npm run typecheck` / `npm run build` | The rest of what CI runs |

The first Tesseract run downloads Arabic and English trained data into
`apps/api/.cache/tessdata`.

## Build status

Each milestone has an exit condition, and the next one does not start until it
is met.

| # | Milestone | State |
| --- | --- | --- |
| 1 | Provider interface and broker | Done for Tesseract. Azure is implemented and tested against a hand-built fixture, not yet against the live service (no credential yet). |
| 2 | Arabic reconstruction core | Not started |
| 3 | Book adapter | Not started |
| 4 | Synthetic invoice generator | Not started |
| 5 | Invoice adapter | Not started |
| 6 | Demo frontend | Not started |
| 7 | Publish | Not started |
| 8 | Accuracy measurement and README | Not started |

## Known limitations

- Images only. PDF input arrives with the book adapter.
- No preprocessing yet (deskew, denoise, orientation).
- No extraction endpoint yet: the HTTP surface is `/api/health`.
- The Azure fixture is written from the documented response schema, not
  recorded from a real call.

## Licence

MIT. See [LICENSE](LICENSE).
