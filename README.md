# Good Grounds NYC ☕

The best coffee shops in NYC, sorted by what you actually need, and we tell you the catch upfront.

No framework, no database server, no dependencies. Plain Node scripts generate a fast static site (best for SEO), and Vercel hosts it for free.

---

## 1. Put it on GitHub (5 minutes)

1. Unzip `goodgrounds-nyc.zip`, then open a terminal in the `goodgrounds` folder.
2. Go to https://github.com/new and create an **empty** repo called `goodgrounds-nyc` (don't add a README).
3. Run:

```bash
git init
git add .
git commit -m "Good Grounds NYC v1"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/goodgrounds-nyc.git
git push -u origin main
```

## 2. Deploy on Vercel (3 minutes)

1. Go to https://vercel.com/new and import the `goodgrounds-nyc` repo.
2. Leave every setting at its default. `vercel.json` already tells Vercel to run `node scripts/build.mjs` and serve `dist/`.
3. Click **Deploy**. Every future `git push` redeploys automatically.
4. **Custom domain:** in Vercel go to Project → Settings → Domains, add your domain, and follow the DNS instructions. Then update `siteUrl` in `site.config.json` so canonical tags and the sitemap use it.

## 3. Load every coffee shop in NYC (do this once, then it runs weekly)

The repo ships with 54 hand-reviewed shops. To add every licensed coffee and tea shop in the city from NYC Open Data:

```bash
npm run ingest            # all 5 boroughs (~2,200 coffee/tea shops as of Nov 2026)
npm run ingest:manhattan  # Manhattan only (~1,100)
node scripts/ingest.mjs --include-bakeries   # also bakeries/dessert cafés (more shops, lower signal)
git add data && git commit -m "Load NYC shops" && git push
```

- The data comes from the **DOHMH Restaurant Inspection Results** dataset (`43nn-pn8j`): name, address, coordinates and **health grade** for every licensed shop.
- Places with no inspection in 24 months are dropped as probably closed.
- Chains (Starbucks, Dunkin, Blank Street…) are flagged and hidden by default. Edit the list in `site.config.json`.
- Your hand-reviewed shops are matched to their city record automatically. Check `data/ingest-report.json` for any that didn't match.
- Optional: a free app token from https://data.cityofnewyork.us/profile/edit/developer_settings, saved as the `SOCRATA_APP_TOKEN` repo secret.
- `.github/workflows/refresh-data.yml` re-pulls the data **every Monday** and commits it, which redeploys the site.

> **Why not 5,000?** NYC has about 2,200 licensed coffee/tea businesses. Reaching 5,000 means counting bakeries, delis and bodegas that happen to sell coffee, which makes the directory worse. Better plan: 100% coverage of real coffee shops, then go deep on reviews.

## 4. Turn on the optional features (environment variables in Vercel → Settings → Environment Variables)

| Feature | Variable | Without it |
|---|---|---|
| ✨ AI search (Claude reads requests like "Asian drinks with good wifi, outlets and a bathroom") | `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`, default `claude-haiku-5-5`) | The built-in keyword parser handles it, and it works well already |
| 📬 Newsletter signups | `BUTTONDOWN_API_KEY` (or edit `api/subscribe.js` for Beehiiv / ConvertKit / Mailchimp) | The form says "signups open very soon" |
| "Join 2,000+ coffee lovers" | `newsletter.subscriberCount` in `site.config.json` | Shows "Be one of the first" |
| "Suggest an edit" button | `reportFormUrl` in `site.config.json` (a Tally or Google Form link) | Button hidden |

Only set `subscriberCount` to your real list size. A made-up number is misleading to users, can break consumer-protection rules (e.g. the FTC's rules on fake social proof), and is easy for journalists and competitors to check.

## 5. Add or edit reviews

Edit `data/curated.json`. Each shop:

```jsonc
{
  "name": "Devoción", "hood": "Williamsburg", "boro": "Brooklyn",
  "c": 5,            // coffee 1-5
  "w": 2,            // wifi: 3 fast, 2 ok, 1 slow, 0 none, null = unverified
  "o": 1,            // outlets: 3 plenty, 2 some, 1 few, 0 none, null
  "l": 2,            // laptops: 2 welcome, 1 limited, 0 not allowed, null
  "b": 1,            // bathroom: 1 yes, 0 no, null = unverified
  "s": 3,            // seating: 3 large … 0 standing only
  "cr": 3,           // crowds: 1 calm, 2 moderate, 3 often packed
  "n": 3,            // noise: 1 quiet, 2 lively, 3 loud
  "f": 2,            // food: 3 full menu, 2 pastries, 1 minimal
  "p": 2,            // price 1-3
  "drink": "…",      // top order (null = "collecting votes")
  "amb": ["skylit", "plant-filled"],
  "tags": ["pretty", "asian", "outdoor", "late", "date", "quick", …],
  "sum": "One-sentence summary", "love": ["…"], "watch": ["The first item is 'the catch' on the card", "…"]
}
```

Then run `npm run ingest` (or just `npm run build` if you haven't ingested) and push.

## What gets built (SEO)

| URL | What | Indexed? |
|---|---|---|
| `/` | Finder + FAQ schema + ItemList | ✅ |
| `/neighborhoods/{hood}/` | Every neighborhood, pre-filtered | ✅ if 3+ shops |
| `/best/{need}/` | 14 guides: laptop-friendly, study, date, matcha… | ✅ if 3+ shops |
| `/best/{need}-{hood}/` | Long-tail combos ("laptop-friendly cafés in Williamsburg") | ✅ if 3+ shops |
| `/coffee/{shop}/` | One page per shop with CafeOrCoffeeShop schema | ✅ reviewed / 🚫 noindex until reviewed (avoids thin-content penalties) |
| `/sitemap.xml`, `/robots.txt` | Auto-generated | |

After deploying, add the site to **Google Search Console** and submit `/sitemap.xml`.

## Local preview

```bash
npm run dev          # builds and serves dist/ at http://localhost:3000
npm run preview      # also writes dist-preview/index.html: one self-contained file
```

## Project layout

```
api/ask.js              AI search (Claude) → structured filters
api/subscribe.js        newsletter signup proxy
data/curated.json       hand-reviewed shops (edit me)
data/neighborhoods.json neighborhood centroids (5 boroughs, ~130 areas)
data/shops.json         generated by `npm run ingest`
scripts/ingest.mjs      NYC Open Data → shops.json
scripts/build.mjs       static site generator → dist/
src/app.js, styles.css  the finder UI
site.config.json        site name, URL, chains list, newsletter settings
```

## Do I need a database?

Not for v1. The data is a few MB of JSON, the site is static, and GitHub keeps the history. Add Postgres (Supabase or Neon) when you add **user accounts, check-ins ("wifi speed test: 40 Mbps"), or votes for top drinks**. That user-generated data is the long-term moat.
