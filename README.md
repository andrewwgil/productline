# productline

Paste an artist's portfolio URL to get a branded, made-to-order product line built with the [Arcade API](https://docs.arcade.ai). Built for Shopping 3.0, the AI Commerce Hackathon with Arcade (SF Tech Week, Oct 11 2026).

**Pipeline:** scrape a URL (`/api/scrape`) or upload a folder / `.zip` plus an optional note (`/api/upload`) → the same portfolio shape → Claude taste profile, which returns palette, motifs and voice (`/api/taste`) → Arcade patterns, then print products across fitting categories, then one jewelry piece, plus Fal lifestyle and hero images (`/api/collection`) → branded storefront → Arcade checkout (`/api/checkout`, `/api/order`).

Uploaded images are downscaled when they are large and sent to Claude as base64 image blocks (at most 8). When `ARCADE_API_KEY` is set, the top 3 are uploaded as Arcade references (`references/upload-url`, PUT, `references/create`) and their `referenceIds` are passed to `/api/collection`. JS-rendered sites that come back thin from a plain fetch (for example giveideaslife.com) are scraped again with headless Chromium. Install the browser once with `npx playwright install chromium`.

## Run
```bash
cp .env.example .env.local   # every key is optional; anything unset runs as a mock
npm install
npm run dev                  # http://localhost:3000
```

## Layout
- `lib/arcade/`: typed client. Every request carries a `requestId`, jobs are polled through `jobs/get`, category IDs are looked up at runtime (resolved with `categories/get` before `products/create`), and refine and checkout are wrapped (`dropShip` is set automatically when quantity is 1). Falls back to `mock.ts` when `ARCADE_API_KEY` is unset.
- `lib/scrape.ts`, `lib/scrape-browser.ts`, `lib/images.ts`, `lib/taste.ts`, `lib/fal.ts`, `lib/collection.ts`: the pipeline steps.
- `RESEARCH.md`: API notes, categories, demo ideas and the build plan.

## Verify with a live key
The refine endpoint paths in `client.ts` (`REFINE_PATH`) and the field names on pattern and product images are best guesses from the docs. Check them against `https://docs.arcade.ai/openapi.json`.
