# productline

Paste an artist's portfolio URL to get a branded, made-to-order product line built with the [Arcade API](https://docs.arcade.ai). Built for Shopping 3.0, the AI Commerce Hackathon with Arcade (SF Tech Week, Oct 11 2026).

Needs `ARCADE_API_KEY`. `OPENAI_API_KEY` is recommended: GPT is the creative director that reads the work and tells Arcade what to make.

**Flow**
1. **Intake.** Paste a portfolio URL (`/api/scrape`) or upload up to 10 images or a `.zip` (`/api/upload`). Every image is fetched once, flattened, fit inside 1024px, and re-encoded as JPEG, so later steps never touch the original site. Scraped pages drop icons, tiny images and near-duplicates, then offer up to 24 candidates.
2. **Pick.** For a scraped site, the artist keeps up to 10 images. Uploads skip this step.
3. **Read.** `/api/direct` sends the 10 images (low detail) and the page text to GPT (`OPENAI_MODEL`, default `gpt-5.5`) with a strict JSON schema. It returns the brand, a brief, a 5-color palette checked against the measured pixel palette, motifs, voice, and a plan: 3 print products and 1 jewelry piece, with categories chosen from Arcade's live `categories/list`, an Arcade prompt for each, and which images each print should use as references. Without the key, or if GPT fails, `lib/taste.ts` rules make the plan and the review screen says so.
4. **One screen for the line.** The taste sits on top, and the 4 products sit below in columns. Before building, each column shows Arcade's blank photo of that category (`imageUrl` from `categories/list`; jewelry has none there, so it uses Arcade's jewelry tiles in `public/categories/`), with the images guiding that print fanned in the corner, or the palette for jewelry. "Build the line" turns each column into its loading state and then into the finished product.
5. **Build.** All selected images are uploaded as Arcade references (`references/createUpload` → PUT → `references/create`; this starts during step 3). Each product is one `patterns/create` job with its `categoryId`, so Arcade designs the pattern and builds the product together. Prints send up to 3 references and the palette as `colors`. Jewelry sends only the prompt and `categoryId`; if Arcade rejects the prompt for that category, it retries once with a plain prompt. `/api/make` starts a job and the browser polls `/api/make/status` every 4 seconds. The line is kept in `sessionStorage`, so a reload resumes it.
6. **Product page.** Clicking a finished product opens it at `#<item key>` (the browser back button returns to the line). It shows Arcade's images plus the flat print, the specs parsed from the product description's "- Label: Value" lines, the line's palette as Color, quantity, the maker's volume discount, Product Details, Dimensions, care for the chosen fabric only, and a made-to-order note linking Arcade's shipping and return policies. "Edit in Arcade" links to arcade.ai, since API products have no Arcade page. "Buy Now" calls `checkouts/create` with the quantity (`dropShip: true` for quantity 1) and opens Arcade's hosted checkout in a new tab.

Limits live in `lib/limits.ts`.

## Run
```bash
cp .env.example .env.local   # ARCADE_API_KEY and OPENAI_API_KEY
npm install
npx playwright install chromium   # once, for JS-rendered portfolio sites
npm run dev                  # http://localhost:3000
```

## Layout
- `lib/arcade/`: typed client matching `https://docs.arcade.ai/openapi.json`. Sends `User-Agent: productline/1.0` and a `requestId` on every create, and retries 409, 429 and 5xx with the same body. Falls back to `mock.ts` when `ARCADE_API_KEY` is unset.
- `lib/director.ts`, `lib/openai.ts`: the GPT plan and the rules fallback.
- `lib/line.ts`: starts a product job and turns a finished job into a product card.
- `lib/scrape.ts`, `lib/scrape-browser.ts`, `lib/images.ts`, `lib/palette.ts`, `lib/taste.ts`: intake, image normalization, pixel palette, and the rules read.
- `RESEARCH.md`: API notes, categories, demo ideas and the build plan.

The scraper blocks literal private and loopback hosts. It does not resolve DNS, so it is not a full SSRF guard for a public deployment.

## Share to Arcade

See something you love — a fabric, a hoodie, a screenshot — and ask what it would feel like as a real product. The photo is a **style reference** (color, texture, mood). Arcade designs an original and returns a priced product in your Arcade account.

The landing page links here. `/share` is the maker. `/shared` is the gallery.

**Pipeline.** `POST /api/share` takes a multipart image or JSON `{ imageUrl, prompt, categoryId? }`. It shrinks the image with sharp, stores a share, and returns a `shareId` immediately (`202`). Generation takes one to two minutes, so the work is a state machine (`uploading` → `designing` → `building` → `ready`, or `failed`) advanced by `GET /api/share/[id]`. The browser polls. The server also keeps polling for about half a minute after the POST, then the next GET resumes the same share.

1. `references/createUpload`, PUT the bytes, `references/create`.
2. `patterns/create` with that `referenceIds` and a prompt that tells Arcade to borrow the mood, not copy the picture. No `categoryId` on this call.
3. Poll `jobs/get`.
4. Pick a print category: the one you sent, or a keyword match against live `categories/list`, or Decorative Pillows.
5. `categories/get` with `selections: {}`, then `products/create` with the complete selections it returned (and a center crop when the pattern’s aspect ratio doesn’t match the size).
6. Poll the product job, then `products/get` for the image and price.

`products/get` does not include a product page URL. **Open in Arcade** goes to [Arcade Studio](https://studio.arcade.ai), where the account’s products live. If a response ever includes an `https://arcade.ai` product URL, that is used instead.

`GET /api/categories` proxies `categories/list` so the extension and the page can show a picker. The Arcade key stays on the server. Sends `User-Agent: productline/1.0`. A `409` retries the same `requestId` (and, for a consumed `references/createUpload`, uploads once more under a new id). A `412` stops and shows Arcade’s message. A `429` waits for `Retry-After`. Chrome extension origins (`chrome-extension://`) are allowed by CORS. If `SHARE_TOKEN` is set, those routes require `X-Share-Token`.

Shares are stored in Vercel KV / Upstash when `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) are set, otherwise as JSON in Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, otherwise in memory. The in-memory store is called out in the UI: it disappears when the process restarts. Without `ARCADE_API_KEY`, `lib/arcade/mock.ts` runs the same steps and returns a priced mock product.

### Chrome extension

Unpacked install:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. **Load unpacked** and choose the `extension` folder in this repo.
4. The default server is `https://productline.vercel.app`. Open the popup, then **Backend**, to point it at a local `http://localhost:3000` or to set `X-Share-Token`. There is no Arcade key in the extension.

Right-click any image and choose **Make it with Arcade**. In the popup: **Capture tab**, **Drag a region**, paste, or drop a photo. Chips fill a pillow, scarf, napkins, or placemat prompt. Progress sits on screen for the minute or two Arcade needs, then the card shows the product, the price, and **Open in Arcade**.

### Install the PWA

`/share` registers `public/sw.js` and ships `public/manifest.json` with a `share_target` (POST multipart, `image/*`, action `/api/share-target`).

- **Android (Chrome).** Open `/share`, tap **Install** when the banner appears (or the browser menu → Install app). Then share a photo from another app and choose Share to Arcade.
- **iOS (Safari).** Open `/share`, tap Share, then **Add to Home Screen**. iOS does not deliver web share targets to installed PWAs the way Android does, so the home-screen app is for opening `/share` and picking a photo. A native share extension is sketched below and is not part of this repo.

The service worker intercepts the share POST and hands the file to `/share`. If the worker is not active yet, `/api/share-target` stores the image and redirects to `/share?pending=…`.

### Native iOS share extension (not built)

A shipping iOS app would add a Share Extension target (`NSExtensionActivationRule` with `NSExtensionActivationSupportsImageWithMaxCount` of 1). The extension writes the image into an app group, and the main app — or the extension itself — POSTs it to `/api/share` with the prompt the person typed in the extension UI. Opening the installed PWA via a universal link (`https://productline.vercel.app/share`) is the lighter version of the same handoff. That target is out of scope here.

### 30-second demo

Full script: [DEMO-SHARE.md](DEMO-SHARE.md).

1. On a phone, install the PWA (or open `/share`).
2. Find a fabric photo. Share it, or pick it from the page.
3. Leave the prompt as “What would this look like as a pillow?” and tap **Make it**.
4. Wait through Reference, Design, and Product. A priced pillow appears, with **Open in Arcade**.

### Env

```
ARCADE_API_KEY=        # unset = mock Arcade, which still walks the whole share flow
SHARE_TOKEN=           # optional; clients send it as X-Share-Token
KV_REST_API_URL=       # or UPSTASH_REDIS_REST_URL
KV_REST_API_TOKEN=     # or UPSTASH_REDIS_REST_TOKEN
BLOB_READ_WRITE_TOKEN= # used only when KV is unset
MOCK_JOB_DELAY_MS=600
```
