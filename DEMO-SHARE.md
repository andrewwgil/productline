# Share to My Arcade

You are looking at an Instagram post. You tap Share, then My Arcade. You are done. A surprise priced product shows up in your Arcade account.

The post’s picture is only a style reference. The product is an original. You do not type a prompt, and you do not pick a category.

## Before you start

- Production: [https://productline.vercel.app/share](https://productline.vercel.app/share)
- Local: `npm run dev`, then [http://localhost:3000/share](http://localhost:3000/share)
- No `ARCADE_API_KEY` is fine. The mock walks the same steps and returns a price, including the surprise line. With a key, the product lands in that Arcade account.
- Phone, Android: install the page first so the share sheet has somewhere to go. Open `/share`, use the install banner, or Chrome’s menu → Install app. The app is named **My Arcade**.
- iPhone: Safari → Share → Add to Home Screen. iOS will not hand an Instagram post to the PWA from the share sheet. Paste the post link in the app and tap **Save to My Arcade**. A native share extension would take the share in one tap, and it is described in the README. It is not in this repo.

## The demo

1. **The post.** On the phone, open an Instagram post (an X post, a Pinterest pin, or any page with a picture works the same way).
2. **Share it.** Tap Share, then **My Arcade**. You should see a small confirmation: “Saved to My Arcade. Your surprise is being made.” You can leave.
3. **What happened.** The share was accepted with no prompt and no category. The server pulled the post’s main image (`og:image`, or `twitter:image`, or the largest picture on the page). It picked a category from the live list — print or jewelry — skipping the last three surprises, leaning toward a category that suits the picture’s shape and colors. The prompt it wrote starts “An original [category] inspired by the colors, texture and mood of this reference”.
4. **The surprise.** Open **My Arcade** (`/shared`), newest first. The card reads like “Your surprise: a silk scarf, $185”, with the product and **Open in Arcade**. The button opens Arcade Studio, because the API does not return a product page URL. If you left `/share?saved=…` open, the same reveal appears there.

A jewelry surprise is designed with `patterns/create` and that category only. The reference is not uploaded. Its colors and mood are in the prompt.

## If you want to steer it

On `/share`, or in the extension under **Customize**, a prompt or a category is optional. With neither, you get a surprise. With a category and no prompt, that category is used and the prompt is written for you. With a prompt and no category, the category is the one your words name.

## The extension

Load `extension/` unpacked. There is no Arcade key in it.

- Right-click an image, a page, or a link → **Save to My Arcade**.
- Click the toolbar button. It saves the tab’s main image, or a capture of the tab.
- The badge counts jobs still running.
- The desktop notification names the surprise and the price. Click it to open `/shared`.
- **Customize…** is where a prompt and a category live, if you want them.

## If you only have a laptop

1. `npm run dev`
2. Open `/share`, drop any jpeg or paste a page link, tap **Save to My Arcade**. Leave the prompt empty.
3. Open `/shared` and read the surprise on the card.
