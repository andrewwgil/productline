# productline

Paste an artist's portfolio URL to get a branded, made-to-order product line built with the [Arcade API](https://docs.arcade.ai). Built for Shopping 3.0, the AI Commerce Hackathon with Arcade (SF Tech Week, Oct 11 2026).

The default path needs only `ARCADE_API_KEY`. Anthropic and Fal stay available, and run only when their keys are set.

**Pipeline:** scrape a URL (`/api/scrape`) or upload a folder / `.zip` plus an optional note (`/api/upload`) → the same portfolio shape → a taste profile (`/api/taste`) → pick a style → Arcade patterns and products (`/api/collection`) → branded storefront → Arcade checkout (`/api/checkout`, `/api/order`).

Taste, by default, is read on the server. Palette colors come from the portfolio images (median-cut on pixels downscaled with sharp, near-white backgrounds dropped). Motifs and voice come from titles, alt text, and the optional note. If `ANTHROPIC_API_KEY` is set, Claude can write that profile instead.

Generation uses Arcade's own pieces. The top 3 images are uploaded as `referenceIds`, the palette is passed as `colors`, and a style picker loads `models/list` (default is no `modelId`, labeled "Your style"). Jewelry is `patterns/create` with `categoryId` only. Product names and copy are templates from the artist's name, motifs, and category. The storefront shows Arcade pattern and product images, re-fetched because those URLs expire. Fal lifestyle shots are added only when `FAL_KEY` is set.

JS-rendered sites that come back thin from a plain fetch (for example giveideaslife.com) are scraped again with headless Chromium. Install the browser once with `npx playwright install chromium`.

## Run
```bash
cp .env.example .env.local   # ARCADE_API_KEY for a live line; leave it unset to mock Arcade
npm install
npm run dev                  # http://localhost:3000
```

## Layout
- `lib/arcade/`: typed client. Every request sends `User-Agent: productline/1.0` and a `requestId`. Jobs are polled through `jobs/get` every 3 seconds. `models/list` feeds the style picker. Category IDs come from the live `categories/list` (apparel and graphic work maps to scarves, pillows, table linens, lampshades, and jewelry), and checkout sets `dropShip: true` whenever a line has quantity 1. Falls back to `mock.ts` when `ARCADE_API_KEY` is unset.
- `lib/palette.ts`, `lib/taste.ts`: image palette and the heuristic taste profile. Claude remains behind `ANTHROPIC_API_KEY`.
- `lib/scrape.ts`, `lib/scrape-browser.ts`, `lib/images.ts`, `lib/fal.ts`, `lib/collection.ts`: the rest of the pipeline.
- `RESEARCH.md`: API notes, categories, demo ideas and the build plan.

## Verify with a live key
The refine endpoint paths in `client.ts` (`REFINE_PATH`) and the field names on pattern and product images are best guesses from the docs. Check them against `https://docs.arcade.ai/openapi.json`.
