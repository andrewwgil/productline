# Share to Arcade — 30-second demo

You see a fabric you love. A minute later there is a priced pillow in your Arcade account. The photo is only a style reference. The pillow is an original.

## Before you start

- Production: [https://productline.vercel.app/share](https://productline.vercel.app/share)
- Local: `npm run dev`, then [http://localhost:3000/share](http://localhost:3000/share)
- No `ARCADE_API_KEY` is fine. The mock walks the same steps and returns a price. With a key, the product lands in that Arcade account.
- Phone: install the page first so sharing from Photos has somewhere to go. Android: the install banner, or Chrome’s menu → Install app. iPhone: Safari → Share → Add to Home Screen. iOS will not hand a photo to the PWA from the share sheet; pick the photo inside the app. A native share extension would, and it is described in the README. It is not in this repo.

## The 30 seconds

1. **0:00 — the fabric.** On the phone, open a photo of a cloth, a hoodie, or a screenshot with a color you like.
2. **0:05 — share it.** Android: Share → Share to Arcade. The service worker catches the image and opens `/share`. iPhone, or a desktop: open `/share` and drop or paste the photo. You should see the picture, and the line “Inspired by your share.”
3. **0:12 — the ask.** Leave “What would this look like as a pillow?” or tap **Pillow**. Category can stay on “Match my prompt.” That resolves to Decorative Pillows.
4. **0:15 — Make it.** Tap **Make it**. The page returns immediately and shows Reference, then Design, then Product. Copy stays on the inspiration side: “Designing an original, inspired by your share.”
5. **0:15–1:30 — wait.** Live Arcade usually takes one to two minutes. The mock is a few seconds. You can leave `/share?id=…` open; polling resumes the same share.
6. **The pillow.** A product photo, a price, and **Open in Arcade**. Under it, your photo sits small, with “Inspired by your share.” The button opens Arcade Studio, because the API does not return a product page URL. The gallery at `/shared` shows the source, the prompt, the product, the price, and the link.

## What you are proving

- The shared image never becomes the product. It is uploaded as an Arcade reference and the prompt tells the model to take color, texture, and mood only.
- The price is Arcade’s price from `products/get`, not a number we invented (except in the mock, which uses the mock category’s price).
- The extension does the same thing with no API key inside it: right-click an image → **Make it with Arcade**, or capture the tab.

## If you only have a laptop

1. `npm run dev`
2. Open `/share`, drop any jpeg, tap **Make it**.
3. Open `/shared` and confirm the card.
4. Load `extension/` unpacked, set Backend to `http://localhost:3000`, and right-click an image.
