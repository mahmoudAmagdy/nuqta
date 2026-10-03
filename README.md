# Nuqta

Arabic OCR extraction: one shared pipeline that turns scanned Arabic documents
into correct, searchable text, with a thin adapter per document type on top.

*Nuqta* (نقطة) is the Arabic word for "dot". A single dot is all that separates
ب from ت from ث, which is a fair summary of why Arabic OCR is hard.

> **Status: in progress, milestone 2 of 8 done.** There is no live demo yet and the
> accuracy numbers do not exist yet. This README describes what is built today;
> the full write-up comes with milestone 8. See [Build status](#build-status).

## What works today

An image of Arabic text goes in. Lines and words come back in reading order,
as real letters, with every stretch of left-to-right text inside a
right-to-left line marked as such, and with a bounding polygon and a
confidence score on every word.

```bash
npm install
npm run ocr -- samples/text/nuqta-page-01.png
```

```text
provider=tesseract stage=reconstructed pages=1 tokens=85
  [0.82] (977,151 527x65) النقطة التى تغيّر المعنى
         rtl: rtl[النقطة التى تغيّر المعنى]
  [0.76] (254,608 1245x45) 67890 5 VY EO وقد يرد في السطر نفسه نص لاتيني SKU-4471-B Jw أو تاريخ مثل
         rtl: ltr[67890 5 VY EO] rtl[وقد يرد في السطر نفسه نص لاتيني] ltr[SKU-4471-B Jw] rtl[أو تاريخ مثل]
  ...
```

The second line under each result shows the directional runs. `SKU-4471-B` is
a left-to-right island inside a right-to-left line, which is what lets a
renderer display it the way it was printed.

The recognition itself is still wrong in instructive ways, and reconstruction
cannot fix what the engine never saw. On this page the self-hosted engine
drops a dot (`التي` becomes `التى`), reads the Arabic-Indic digits `١٢٣٤٥` as
`VY EO`, and reads the word `مثل` as `Jw`. Measuring that per engine is
milestone 8. `--stage ocr` shows the provider's output before reconstruction.

## What reconstruction does

Each of these is a failure mode of naive Arabic OCR, and each has tests built
on a known-bad input in `apps/api/src/reconstruction`.

| Problem | What comes back from an engine | What reconstruction returns |
| --- | --- | --- |
| **Visual character order** | Letters in the order they sit on the page, so every Arabic word is backwards | Logical order. Detected from the glyph shapes themselves: Arabic joining rules only hold in one direction, so no dictionary is needed |
| **Glyph shapes instead of letters** | `ﻋ ﻌ ﻊ ﻉ`, four code points for four shapes of one letter; `ﻻ` as one code point | `ع` every time; `ل` + `ا`. Searchable text, not a picture of text |
| **Word order** | Words listed in whatever order the engine walked them | Reading order, rebuilt from where each word sits on the page |
| **Latin and digits inside Arabic** | One undifferentiated line | Explicit directional runs, so `SKU-4471-B` stays left-to-right |
| **Invisible characters** | `SKU-4471-B` wrapped in U+200E and U+200F, so it matches nothing | Stripped. The original is kept alongside for audit |
| **Stray diacritics** | A damma returned as a token of its own | Put back on the letter it was printed over, using its position |
| **Two numeral systems** | `١٬٢٥٠٫٥٠` and `1,250.50` on the same page | Display keeps what was printed. A separate matching form and a parser give `1250.5` for both |
| **Alef and hamza variants** | `أحمد` and `احمد` fail to match | Display is untouched. The matching form folds them, by a documented rule set |

Two of these are worth spelling out, because they are where a plausible
implementation goes wrong.

**Order of operations changes the word.** `ﻡﻼﺳ` is the word سلام ("peace") in
visual order, with lam-alef as a single ligature glyph. Reverse the glyphs and
then open the ligature, and you get سلام. Open the ligature first and then
reverse, and you get سالم, which is a different, real word: a man's name.
Nothing downstream would flag it.

**A date is not stored the way it is printed.** The sample page's source text
says `2026-10-03`. Inside an Arabic paragraph the Unicode bidi algorithm
displays that as `03-10-2026`, because the hyphens are not treated as part of
the number and the three groups are laid out right to left. Write it with
slashes and it is not reordered. An OCR engine reads what is on the page, so
this project keeps number tokens exactly as printed and marks them as isolated
left-to-right runs, instead of trusting a renderer's implicit algorithm to
flip them back.

Word ordering is the bidi algorithm run backwards, and it is checked against
an independent implementation of the forward algorithm (`bidi-js`): take a
sentence in reading order, ask the reference where each word lands on the
page, hand only those positions to the reconstruction, and require the
original sentence back.

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
├── reconstruction/   Stage 4. Everything Arabic-specific, and the only place it lives.
│   ├── visual-order.ts           Character order inside a word, read off the glyph shapes.
│   ├── unicode.ts                Presentation forms to letters, invisible characters, NFC.
│   ├── token-order.ts            Reading order of words from geometry; directional runs.
│   ├── diacritics.ts             Tashkeel: preserved, re-attached, strippable on request.
│   ├── numerals.ts               Both digit sets; a parser that refuses rather than guesses.
│   ├── folding.ts                The matching form (alef, hamza, yeh, teh marbuta).
│   └── reconstruction.service.ts Composes the above into what an adapter receives.
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
| `npm run ocr -- <image> [--provider <id>] [--stage ocr\|raw] [--out file.json]` | Run one image through intake, the broker and reconstruction |
| `npm test` | Unit tests |
| `npm run test:e2e` | HTTP tests against the assembled app |
| `npm run test:live` | Runs the real Tesseract engine and reconstruction on the sample page |
| `npm run lint` / `npm run typecheck` / `npm run build` | The rest of what CI runs |

The first Tesseract run downloads Arabic and English trained data into
`apps/api/.cache/tessdata`.

## Build status

Each milestone has an exit condition, and the next one does not start until it
is met.

| # | Milestone | State |
| --- | --- | --- |
| 1 | Provider interface and broker | Done for Tesseract. Azure is implemented and tested against a hand-built fixture, not yet against the live service (no credential yet). |
| 2 | Arabic reconstruction core | Done. Transliteration is deferred to the adapters, where the names it applies to are known. |
| 3 | Book adapter | Not started |
| 4 | Synthetic invoice generator | Not started |
| 5 | Invoice adapter | Not started |
| 6 | Demo frontend | Not started |
| 7 | Publish | Not started |
| 8 | Accuracy measurement and README | Not started |

## Known limitations

- Images only. PDF input arrives with the book adapter.
- Reading order assumes a single column. Multi-column layout is out of scope.
- When a provider returns plain letters in visual order (no glyph shapes to
  read the direction from), reconstruction relies on the provider adapter
  declaring it. Neither current provider does this.
- A number sitting between a Latin word and an Arabic one is ambiguous under
  the bidi algorithm itself: two reading orders print identically.
  Reconstruction attaches the number to the Latin word.
- No preprocessing yet (deskew, denoise, orientation).
- No extraction endpoint yet: the HTTP surface is `/api/health`.
- The Azure fixture is written from the documented response schema, not
  recorded from a real call.

## Licence

MIT. See [LICENSE](LICENSE).
