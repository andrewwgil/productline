# productline: Arcade Hackathon Research (Oct 10, 2026)

## Arcade API (https://platform.arcade.ai/v1). Every call is a POST with JSON and `Authorization: Bearer $ARCADE_API_KEY`
- Send `User-Agent: productline/1.0`. Every create call takes a `requestId` (idempotency key).
- Long-running work returns `{jobId, kind: pattern|product|download, status: running|succeeded|failed, result, error}`. Poll `jobs/get {jobId}` every 2-3 s. Generation takes 1-2 minutes.
- **Patterns**: `patterns/create {requestId, prompt(<=1000), referenceIds(<=3), modelId?, colors?, categoryId?}` returns result.patternId. If `categoryId` is passed, the same job also builds the product (result.productId). Print: Arcade picks the options. Jewelry: the design is made for that category, and you must not send modelId, referenceIds, or colors. Also `patterns/get` (image URLs are short-lived, so re-fetch) and `patterns/list`.
- **Refine** (print only): edit (text instruction), edit region (mask), color clusters, recolor, crop, make seamless, extend pattern, extend scene, fix deformities.
- **References**: `references/upload-url` (PUT the file) then `references/create`, then pass up to 3 referenceIds to patterns/create. **This is the key to "your portfolio becomes the brand."**
- **Models**: `models/list` (Arcade Canon curated and artist-trained models).
- **Categories**: `categories/list` returns `{categoryId, name, imageUrl, world: print|jewelry}`. `categories/get {categoryId, selections}` returns the options, with `available` on each value, a complete `selections` object with defaults filled in, and `canManufacture`. Build up a partial request, then pass the *complete returned* selections to products/create.
- **Products**: `products/create {requestId, patternId, categoryId, selections}` returns a job and then result.productId. Jewelry is refused here. `products/get {productId, quantity?}` returns images, maker, and price.
- **Checkout**: `checkouts/create {requestId, lines:[{productId, quantity}], dropShip}` returns checkoutUrl. **quantity 1 requires `dropShip: true`** unless there's a subscription. `orders/get {checkoutId|orderId}` returns 404 until paid. Also orders/list.
- `feedback/send` exists too.

## Categories
IDs and options can only be fetched at runtime with a key. Public sources show the following.
- **print**: scarves (silk), pillows (with piping and tassels), table linens and napkins (cotton or linen, 20x20 and similar), lampshades, bedding, rugs, plus newer home goods and ceramics. Options cover fabric, size, and finishing such as hand-rolled hems.
- **jewelry** (Arcade's original world): rings, earrings, necklaces, pendants, chain belts. Gold and other metals, custom size and texture.
- TODO with a key: dump `categories/list` and `categories/get` into `data/categories.json`.

## Likely demo features
Arcade Canon curated and artist-trained models, reference-image generation, the refine suite (seamless, recolor, extend), jewelry built in one call, guaranteed instant pricing, drop-ship of a single unit, the Shopify app, and "Match My Room." Arcade's own example idea is "portfolio into branded product line," which is what we're building.

## Creative uses (Arcade + Claude + Fal)
1. **Taste DNA**: Claude vision reads the portfolio and returns palette hexes, motifs, and voice. The palette goes in as `colors`, the top 3 portfolio images go in as `referenceIds`, and recolor and color-clusters lock the line to the brand palette.
2. **One prompt, a whole collection**: a single motif turned into seamless repeat patterns, then scarf, pillow, napkins, and lampshade, plus a jewelry piece built from the motif.
3. **Fal media**: a Flux lifestyle scene per product, a Kling or Veo 15-second "brand film" for the storefront hero, and a generated logo and wordmark.
4. Claude writes the product names and copy in the artist's voice. Price comes from products/get, with a margin slider.
5. Stretch: a Chrome extension. Right-click any image and choose "make a product line."

## Build plan (Sun 10 AM to 6 PM PT)
- 10-11: confirm the key, dump categories, smoke-test the full pipeline.
- 11-1: scrape (cheerio, og images, img tags, text), upload references, run the Claude taste profile.
- 1-3: generation fan-out (3 patterns x 4 print categories + 1 jewelry), job-progress UI.
- 3-5: storefront (brand header, Fal hero, product grid, PDPs), one live checkout with dropShip.
- 5-6: rehearse the demo on giveideaslife.com. Keep a cached fallback run.
