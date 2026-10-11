# productline

Paste an artist's portfolio URL to get a branded, made-to-order product line built with the [Arcade API](https://docs.arcade.ai). Built for Shopping 3.0, the AI Commerce Hackathon with Arcade (SF Tech Week, Oct 11 2026).

Needs `ARCADE_API_KEY`. `OPENAI_API_KEY` is recommended: GPT is the creative director that reads the work and tells Arcade what to make.

**Flow**
1. **Intake.** Paste a portfolio URL (`/api/scrape`) or upload up to 10 images or a `.zip` (`/api/upload`). Every image is fetched once, flattened, fit inside 1024px, and re-encoded as JPEG, so later steps never touch the original site. Scraped pages drop icons, tiny images and near-duplicates, then offer up to 24 candidates.
2. **Pick.** For a scraped site, the artist keeps up to 10 images. Uploads skip this step.
3. **Read.** `/api/direct` sends the 10 images (low detail) and the page text to GPT (`OPENAI_MODEL`, default `gpt-5.5`) with a strict JSON schema. It returns the brand, a brief, a 5-color palette checked against the measured pixel palette, motifs, voice, and a plan: 3 print products and 1 jewelry piece, with categories chosen from Arcade's live `categories/list`, an Arcade prompt for each, and which images each print should use as references. Without the key, or if GPT fails, `lib/taste.ts` rules make the plan and the review screen says so.
4. **One screen for the line.** The taste sits on top, and the 4 products sit below in columns. Before building, each column shows Arcade's blank photo of that category (`imageUrl` from `categories/list`; jewelry has none there, so it uses Arcade's jewelry tiles in `public/categories/`), with the images guiding that print fanned in the corner, or the palette for jewelry. "Build the line" turns each column into its loading state and then into the finished product.
5. **Build.** All selected images are uploaded as Arcade references (`references/createUpload` → PUT → `references/create`; this starts during step 3). Each product is one `patterns/create` job with its `categoryId`, so Arcade designs the pattern and builds the product together. Prints send up to 3 references and the palette as `colors`. Jewelry sends only the prompt and `categoryId`; if Arcade rejects the prompt for that category, it retries once with a plain prompt. `/api/make` starts a job and the browser polls `/api/make/status` every 4 seconds. The line is kept in `sessionStorage`, so a reload resumes it.
6. **Buy.** Product cards show Arcade's `unitPrice` and maker. "Buy on Arcade" calls `checkouts/create` (`dropShip: true` for quantity 1) and opens Arcade's hosted checkout.

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
