#!/usr/bin/env node
/**
 * Static site generator. No dependencies.
 *   node scripts/build.mjs            -> dist/  (deploy this; Vercel does it automatically)
 *   node scripts/build.mjs --preview  -> also writes dist-preview/index.html (single self-contained file)
 *
 * Pages generated (all crawlable, real HTML):
 *   /                                   finder
 *   /neighborhoods/{hood}/              one per neighborhood
 *   /best/{need}/  /best/{need}-{hood}/ guide pages (only when >= 3 shops match)
 *   /coffee/{shop}/                     one per shop (unreviewed shops are noindex until reviewed)
 *   /sitemap.xml  /robots.txt  /shops.json
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PREVIEW = process.argv.includes("--preview");
const read = p => fs.readFile(path.join(ROOT, p), "utf8");
const exists = p => fs.access(path.join(ROOT, p)).then(() => true, () => false);

const cfg = JSON.parse(await read("site.config.json"));
const hoods = JSON.parse(await read("data/neighborhoods.json"));
const css = await read("src/styles.css");
const appJs = await read("src/app.js");
const usingCity = await exists("data/shops.json");
let shops = JSON.parse(await read(usingCity ? "data/shops.json" : "data/curated.json"));

const slug = t => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
for (const s of shops) { s.tags ||= []; s.amb ||= []; s.love ||= []; s.watch ||= []; if (!s.slug) s.slug = slug(`${s.name.replace(/\(.*?\)/, "")} ${s.hood}`); }
const SITE = cfg.siteUrl.replace(/\/$/, "");
const BOROS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

// scoring mirrors src/app.js (kept simple for SSR ordering)
const overall = s => s.reviewed ? ((s.c / 5) * .55 + (s.s / 3 * .5 + (3 - s.cr) / 2 * .5) * .2 + ((s.f - 1) / 2) * .15 + ((3 - s.p) / 2) * .1) * 10 : -1;
const has = (s, ...t) => t.some(x => s.tags.includes(x));
const NEED = {
  work: ["Best laptop-friendly coffee shops", s => s.reviewed && s.l === 2 && (s.w ?? 0) >= 2, "Wifi that works, outlets that exist, and staff who don't mind you staying a while."],
  study: ["Best study cafés", s => s.reviewed && s.l >= 1 && s.cr <= 2 && s.n <= 2 && s.s >= 1, "Calm rooms, real seats, and a noise level you can think in."],
  date: ["Best coffee date spots", s => s.reviewed && (has(s, "date") || s.amb.includes("romantic")), "Charming, intimate cafés for a first (or fiftieth) date."],
  hangout: ["Best cafés to hang out", s => s.reviewed && ((s.s >= 2 && s.l !== 2) || has(s, "community", "people-watching")), "Roomy, social spots for catching up with friends."],
  meeting: ["Best cafés for meetings", s => s.reviewed && (s.w ?? 0) >= 2 && s.s >= 2 && s.n <= 2, "Reliable wifi, a table and a noise level where you can hear each other."],
  snob: ["Best coffee (coffee-snob approved)", s => s.reviewed && s.c >= 4, "The cups people cross boroughs for."],
  food: ["Best cafés with real food", s => s.reviewed && s.f === 3, "Cafés where breakfast and lunch are as good as the coffee."],
  quick: ["Best grab-and-go coffee", s => s.reviewed && (has(s, "quick") || s.s <= 1), "Great coffee, fast, on your way somewhere."],
  asian: ["Best matcha & Asian drinks", s => has(s, "asian", "matcha", "vietnamese", "tea"), "Matcha, Vietnamese coffee, Taiwanese bakeries, boba and more."],
  outdoor: ["Best cafés with outdoor seating", s => s.reviewed && (has(s, "outdoor") || s.amb.includes("backyard")), "Backyards, sidewalk benches and gardens."],
  late: ["Best late-night cafés", s => s.reviewed && has(s, "late"), "Cafés that stay open after dinner."],
  value: ["Best cheap coffee", s => s.reviewed && s.p === 1 && s.c >= 3, "Good coffee that doesn't cost $8."],
  nowifi: ["Best no-wifi cafés for focus", s => s.reviewed && s.w === 0 && s.s >= 2, "Go offline on purpose."],
  pretty: ["Prettiest coffee shops", s => s.reviewed && (has(s, "pretty") || s.amb.some(a => ["opulent", "design-forward", "skylit", "floral", "plant-filled"].includes(a))), "The most beautiful cafés in the city."]
};
const rank = list => [...list].sort((a, b) => overall(b) - overall(a) || (a.chain ? 1 : 0) - (b.chain ? 1 : 0) || a.name.localeCompare(b.name));
const visible = s => !s.chain;

const sitemap = [];
async function write(rel, html, { index = true, priority = 0.6 } = {}) {
  const file = path.join(DIST, rel, rel.endsWith(".html") || rel.includes(".") ? "" : "index.html");
  await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, html);
  if (index) sitemap.push({ loc: `${SITE}/${rel.replace(/index\.html$/, "")}`.replace(/\/+$/, "/"), priority });
}

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;
const LOGO = `<svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="16" rx="9" ry="13" transform="rotate(30 16 16)" fill="#3b2418"/><path d="M11 6c5 6 5 14 10 20" stroke="#c8792f" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
function head({ title, desc, canonical, noindex, jsonld, inlineCss }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
${canonical ? `<link rel="canonical" href="${canonical}">` : ""}${noindex ? `<meta name="robots" content="noindex,follow">` : `<meta name="robots" content="index,follow,max-image-preview:large">`}
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website">${canonical ? `<meta property="og:url" content="${canonical}">` : ""}
<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#f7f1e8">
${FONTS}${inlineCss ? `<style>${css}</style>` : `<link rel="stylesheet" href="/styles.css">`}
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}</head>`;
}
const topbar = home => `<header class="top"><div class="wrap"><a class="logo" href="${home}">${LOGO} Good Grounds</a>
<nav class="links"><a href="${home}#browse">Neighborhoods</a><a href="${home}#guides">Guides</a><a href="${home}#faq">FAQ</a><a class="cta" href="${home}#newsletter">Get the newsletter</a></nav></div></header>`;
const ssrCard = s => `<article class="card"><h3><a href="/coffee/${s.slug}/">${esc(s.name)}</a></h3><div class="where">${esc(s.hood)}, ${s.boro}${s.addr ? " · " + esc(s.addr) : ""}</div>${s.reviewed ? `<p class="summary">${esc(s.sum)}</p>${s.drink ? `<div class="drink">Top order: ${esc(s.drink)}</div>` : ""}<div class="watch"><b>The catch:</b> ${esc(s.watch[0])}</div>` : ""}</article>`;
const itemList = (name, list) => ({ "@type": "ItemList", name, itemListElement: list.slice(0, 50).map((s, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/coffee/${s.slug}/`, name: s.name })) });

function appPage({ h1, lede, preset = {}, list, title, desc, canonical, jsonld, noindex, inline }) {
  const cfgClient = { siteName: cfg.siteName, newsletter: cfg.newsletter, reportFormUrl: cfg.reportFormUrl || "", staticPages: !inline, dataUrl: "/shops.json", aiEndpoint: inline ? "" : "/api/ask", subscribeEndpoint: inline ? "" : "/api/subscribe" };
  const ssr = rank(list.filter(visible)).slice(0, 24).map(ssrCard).join("");
  const home = inline ? "#" : "/";
  return `${head({ title, desc, canonical, noindex, jsonld, inlineCss: inline })}<body>
${topbar(home)}
<main class="wrap">
  <section class="hero">
    <h1>${h1}</h1>
    <p class="lede">${lede}</p>
    <div class="searchbox" role="search">
      <div class="searchrow"><span class="ico" aria-hidden="true">✨</span>
        <input id="q" type="search" autocomplete="off" placeholder="Ask anything: “quiet café with matcha, outlets and a bathroom near me”" aria-label="Search or ask for a coffee shop">
        <button class="btn-near" id="nearBtn" aria-pressed="false">📍 Near me</button><button class="btn-ask" id="askBtn">Search</button></div>
      <div class="examples">Try:
        <button data-example="Asian drinks with good wifi, outlets and a bathroom">Asian drinks + wifi + bathroom</button>
        <button data-example="quiet place to study in Brooklyn">quiet study spot in Brooklyn</button>
        <button data-example="cute date spot in the West Village">date spot, West Village</button>
        <button data-example="best espresso near me">best espresso near me</button></div>
    </div>
    <div class="understood" id="understood" aria-live="polite"></div>
    <div class="nearpanel" id="nearPanel"><span id="nearMsg"></span><select id="nearHood" aria-label="Your neighborhood"></select></div>
    <div class="needs" id="needs" aria-label="What do you need?"></div>
    <div class="beta"><span id="betaCount"></span> Amenities come from public reviews and press, and a “?” means we haven't confirmed it yet.</div>
  </section>

  <div class="layout" id="results">
    <aside class="filters" id="filters" aria-label="Filters">
      <div class="fgroup"><h4>Where</h4><select id="boroSel" aria-label="Borough"></select><div style="height:8px"></div><select id="hoodSel" aria-label="Neighborhood"></select></div>
      <div class="fgroup"><h4>Must have</h4><div id="togList"></div></div>
      <div class="fgroup"><h4>Price</h4><div class="seg" id="priceSeg"><button data-p="1" aria-pressed="false">$</button><button data-p="2" aria-pressed="false">$$</button><button data-p="3" aria-pressed="false">$$$</button></div></div>
      <div class="fgroup"><h4>Ambiance</h4><select id="ambSel" aria-label="Ambiance"></select></div>
      <div class="fgroup"><h4>Show</h4>
        <label class="toggle">Hide big chains<input type="checkbox" id="hideChains" checked></label>
        <label class="toggle">Reviewed shops only<input type="checkbox" id="onlyReviewed"></label>
        <label class="toggle">My saved spots ♥<input type="checkbox" id="savedOnly"></label></div>
      <div class="fgroup"><h4>Sort by</h4><select id="sortSel"><option value="best">Best overall</option><option value="coffee">Coffee quality</option><option value="work">Work-friendliness</option><option value="calm">Least crowded</option><option value="price">Cheapest</option><option value="near">Closest to me</option><option value="az">A → Z</option></select></div>
      <button class="reset" data-act="reset">Reset all filters</button>
      <button class="sheetdone" data-act="sheet">Show results</button>
    </aside>
    <div>
      <div class="mfilters"><button id="mfBtn">Filters</button><button id="mfNear">📍 Near me</button></div>
      <div class="resbar"><h2 id="resTitle">${h1.replace(/<[^>]+>/g, "")}</h2><span class="count" id="resCount"></span></div>
      <div class="active" id="active"></div>
      <div class="grid" id="grid">${ssr}</div>
      <button class="more" id="more" hidden>Show more</button>
    </div>
  </div>

  <section class="block" id="newsletter"><h2>The Weekly Grind</h2><p class="sub">Every Friday: 5 great cafés, 1 new opening, and the week's best seat in the city. ${cfg.newsletter?.subscriberCount ? `Join ${Number(cfg.newsletter.subscriberCount).toLocaleString()}+ NYC coffee lovers.` : "Free, and one email a week."}</p>
    <form class="nlform" data-nl style="max-width:520px"><input type="email" required placeholder="you@email.com" aria-label="Email" style="border:1px solid var(--line)"><button>Subscribe</button><div class="nlmsg" hidden style="color:var(--muted)"></div></form></section>
  <section class="block" id="browse"><h2>Browse by neighborhood</h2><p class="sub">Every neighborhood in all five boroughs.</p><div class="hoods" id="hoods"></div></section>
  <section class="block" id="guides"><h2>Guides</h2><p class="sub">What New Yorkers actually search for.</p><div class="guides" id="guideList"></div></section>
  <section class="block" id="faq"><h2>FAQ</h2><p class="sub">Quick answers.</p><div id="faqList"></div></section>
  <section class="block" id="method"><h2>How we score</h2><p class="sub">Transparent beats authoritative.</p>
    <details><summary>Coffee score (1–5)</summary><p>How reviewers and press describe the coffee: sourcing, roasting, consistency and espresso. A 5 means people travel across boroughs for it.</p></details>
    <details><summary>Work score (0–10)</summary><p>Wifi, outlets, laptop policy, bathroom, seating and how crowded it gets. Great wifi with no seats still scores low.</p></details>
    <details><summary>Overall (0–10)</summary><p>55% coffee, 20% space and comfort, 15% food, 10% value. Work-friendliness isn't part of the overall score, so laptop-free espresso bars aren't penalized.</p></details>
    <details><summary>Where the data comes from</summary><p>The shop list comes from NYC's public health inspection records (NYC Open Data), which also give us each shop's health grade. Reviews are summarized from public reviews and press, and amenities show “?” until confirmed.</p></details>
  </section>
</main>
<footer><div class="wrap">${esc(cfg.siteName)} · Not affiliated with any shop. Shops open and close constantly, so check before you trek.</div></footer>
<div class="scrim" id="scrim"></div><aside class="drawer" id="drawer" aria-hidden="true"><div class="inner" id="drawerInner"></div></aside><div class="toast" id="toast"></div>
<script>window.GG_CONFIG=${JSON.stringify(cfgClient)};window.GG_PRESET=${JSON.stringify(preset)};window.GG_HOODS=${JSON.stringify(hoods)};${inline ? `window.GG_DATA=${JSON.stringify(shops).replace(/</g, "\\u003c")};` : ""}</script>
${inline ? `<script>${appJs}</script>` : `<script src="/app.js" defer></script>`}
</body></html>`;
}

function shopPage(s) {
  const same = rank(shops.filter(x => x.hood === s.hood && x.slug !== s.slug && visible(x))).slice(0, 8);
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "CafeOrCoffeeShop", name: s.name, url: `${SITE}/coffee/${s.slug}/`, address: { "@type": "PostalAddress", streetAddress: s.addr || undefined, addressLocality: s.boro === "Manhattan" ? "New York" : s.boro, addressRegion: "NY", postalCode: s.zip || undefined, addressCountry: "US" },
      geo: s.lat && !s.approx ? { "@type": "GeoCoordinates", latitude: s.lat, longitude: s.lon } : undefined, priceRange: s.p ? "$".repeat(s.p) : undefined, servesCuisine: "Coffee",
      amenityFeature: s.reviewed ? [["Free Wi-Fi", s.w], ["Power outlets", s.o], ["Restroom", s.b]].filter(([, v]) => v != null).map(([n, v]) => ({ "@type": "LocationFeatureSpecification", name: n, value: v > 0 })) : undefined },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "NYC Coffee", item: `${SITE}/` }, { "@type": "ListItem", position: 2, name: s.hood, item: `${SITE}/neighborhoods/${slug(s.hood)}/` }, { "@type": "ListItem", position: 3, name: s.name }] }] };
  const yn = (v, a, b, c = "Not confirmed yet") => v == null ? c : v ? a : b;
  const W = { 3: "Fast", 2: "OK", 1: "Slow / spotty", 0: "None" }, O = { 3: "Plenty", 2: "Some", 1: "A few", 0: "None" }, Lp = { 2: "Welcome", 1: "Limited", 0: "Not allowed" };
  const desc = s.reviewed ? `${s.name} in ${s.hood}: ${s.sum} Wifi: ${W[s.w] ?? "?"}. Outlets: ${O[s.o] ?? "?"}. Bathroom: ${yn(s.b, "yes", "no", "?")}.` : `${s.name}, a ${s.kind === "tea" ? "tea shop" : "coffee shop"} at ${s.addr || s.hood}, ${s.boro}. Wifi, outlets and reviews coming soon.`;
  return `${head({ title: `${s.name} (${s.hood}): Wifi, Outlets, Reviews & What to Order | Good Grounds NYC`, desc, canonical: `${SITE}/coffee/${s.slug}/`, noindex: !s.reviewed, jsonld: ld })}<body>${topbar("/")}
<main class="wrap detail">
  <div class="crumbs"><a href="/">NYC Coffee</a> › <a href="/neighborhoods/${slug(s.hood)}/">${esc(s.hood)}</a> › ${esc(s.name)}</div>
  <h1>${esc(s.name)}</h1>
  <p class="where" style="color:var(--muted)">${esc(s.addr || s.hood)}${s.zip ? ", NY " + s.zip : ""} · ${esc(s.hood)}, ${s.boro}${s.p ? " · " + "$".repeat(s.p) : ""}${s.grade ? ` · Health grade <span class="grade">${s.grade}</span>` : ""}</p>
  ${s.reviewed ? `<p class="summary" style="font-size:18px">${esc(s.sum)}</p>
  ${s.drink ? `<div class="drink" style="font-size:16px">🏆 <b>Top order:</b> ${esc(s.drink)}</div>` : ""}
  <h4>At a glance</h4><div class="amen">
    <div><b>Wifi</b>${W[s.w] ?? "Not confirmed yet"}</div><div><b>Outlets</b>${O[s.o] ?? "Not confirmed yet"}</div>
    <div><b>Laptops</b>${Lp[s.l] ?? "Not confirmed yet"}</div><div><b>Bathroom</b>${yn(s.b, "Yes", "No")}</div>
    <div><b>Crowds</b>${["", "Usually calm", "Moderate", "Often packed"][s.cr]}</div><div><b>Food</b>${["", "Minimal", "Good pastries", "Full menu"][s.f]}</div>
    <div><b>Noise</b>${["", "Quiet", "Lively", "Loud"][s.n] || "—"}</div><div><b>Ambiance</b>${esc(s.amb.join(", "))}</div></div>
  <h4>What people love</h4><ul class="lovelist">${s.love.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
  <h4>Watch out for</h4><ul class="watchlist">${s.watch.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : `<div class="unrev" style="margin-top:16px">We haven't reviewed this shop yet. It's listed from NYC's public health inspection records. Wifi, outlets, bathroom and review summaries are coming.</div>`}
  <div class="btnrow"><a class="btn primary" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name.replace(/\s*\(.*\)/, "")} ${s.addr || s.hood} New York`)}">Directions ↗</a><a class="btn ghost" href="/neighborhoods/${slug(s.hood)}/">All ${esc(s.hood)} coffee shops</a>${cfg.reportFormUrl ? `<a class="btn ghost" href="${cfg.reportFormUrl}" target="_blank" rel="noopener">Suggest an edit</a>` : ""}</div>
  ${same.length ? `<h4>More coffee in ${esc(s.hood)}</h4><div class="pills">${same.map(x => `<a class="pill n" href="/coffee/${x.slug}/">${esc(x.name)}</a>`).join("")}</div>` : ""}
</main><footer><div class="wrap">${esc(cfg.siteName)} · Last reviewed Nov 2026.</div></footer></body></html>`;
}

/* ---------- build ---------- */
await fs.rm(DIST, { recursive: true, force: true }); await fs.mkdir(DIST, { recursive: true });
const tag = cfg.tagline;
const LEDE = `Wifi that works. Outlets that exist. Espresso worth the line. We read the reviews so you don't have to, and <b>we tell you the catch upfront.</b>`;
const faqLd = { "@type": "FAQPage", mainEntity: [
  ["What are the best coffee shops in NYC to work from?", `Top laptop-friendly picks include ${rank(shops.filter(NEED.work[1])).slice(0, 5).map(s => s.name).join(", ")}.`],
  ["Which NYC coffee shops have the best coffee?", `Reviewers rave most about ${shops.filter(s => s.reviewed && s.c === 5).map(s => s.name).join(", ")}.`],
  ["Which NYC coffee shops have bathrooms?", `Confirmed so far: ${shops.filter(s => s.b === 1).map(s => s.name).join(", ")}.`]].map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };

await write("", appPage({ h1: `The <em>best</em> coffee shops in NYC, sorted by what you actually need.`, lede: LEDE, list: shops,
  title: "Best Coffee Shops in NYC (2026): Wifi, Outlets & Honest Reviews | Good Grounds", desc: `Find the best coffee shops in NYC by neighborhood or need, across ${shops.length.toLocaleString()} shops in all 5 boroughs: laptop-friendly cafés with fast wifi, outlets and bathrooms, study spots, date spots and great espresso.`,
  canonical: `${SITE}/`, jsonld: { "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", name: cfg.siteName, url: `${SITE}/` }, faqLd, itemList("Best coffee shops in NYC", rank(shops))] } }), { priority: 1 });

const hoodNames = [...new Set(shops.map(s => s.hood))];
for (const h of hoodNames) {
  const list = shops.filter(s => s.hood === h); const b = list[0].boro; const rev = list.filter(s => s.reviewed).length;
  await write(`neighborhoods/${slug(h)}/`, appPage({ h1: `The best coffee shops in <em>${esc(h)}</em>`, lede: `${list.filter(visible).length} coffee & tea shops in ${esc(h)}, ${b}, with wifi, outlets, bathrooms and crowd levels called out. ${LEDE.split(". ").slice(-1)[0]}`, preset: { hood: h }, list,
    title: `Best Coffee Shops in ${h}, ${b} (2026): Wifi, Outlets & Reviews`, desc: `The best coffee shops in ${h}: ${rank(list).slice(0, 3).map(s => s.name).join(", ")} and more. Wifi, outlets, bathrooms, crowds and what to order.`,
    canonical: `${SITE}/neighborhoods/${slug(h)}/`, noindex: list.filter(visible).length < 3, jsonld: { "@context": "https://schema.org", ...itemList(`Best coffee shops in ${h}`, rank(list)) } }), { index: list.filter(visible).length >= 3, priority: .8 });
}
for (const [k, [t, fn, blurb]] of Object.entries(NEED)) {
  const all = shops.filter(fn);
  if (all.length >= 3) await write(`best/${k}/`, appPage({ h1: `${t} in <em>NYC</em>`, lede: `${blurb} ${LEDE.split(". ").slice(-1)[0]}`, preset: { need: k }, list: all, title: `${t} in NYC (2026) | Good Grounds`, desc: `${t} in New York City: ${rank(all).slice(0, 3).map(s => s.name).join(", ")} and more. ${blurb}`, canonical: `${SITE}/best/${k}/`, jsonld: { "@context": "https://schema.org", ...itemList(`${t} in NYC`, rank(all)) } }), { priority: .9 });
  for (const h of hoodNames) {
    const list = all.filter(s => s.hood === h); if (list.length < 3) continue;
    await write(`best/${k}-${slug(h)}/`, appPage({ h1: `${t} in <em>${esc(h)}</em>`, lede: blurb, preset: { need: k, hood: h }, list, title: `${t} in ${h} (2026) | Good Grounds`, desc: `${t} in ${h}: ${rank(list).map(s => s.name).slice(0, 4).join(", ")}.`, canonical: `${SITE}/best/${k}-${slug(h)}/`, jsonld: { "@context": "https://schema.org", ...itemList(`${t} in ${h}`, rank(list)) } }), { priority: .7 });
  }
}
for (const s of shops) await write(`coffee/${s.slug}/`, shopPage(s), { index: s.reviewed, priority: .6 });

await fs.writeFile(path.join(DIST, "styles.css"), css);
await fs.writeFile(path.join(DIST, "app.js"), appJs);
await fs.writeFile(path.join(DIST, "shops.json"), JSON.stringify(shops));
await fs.writeFile(path.join(DIST, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
const today = new Date().toISOString().slice(0, 10);
await fs.writeFile(path.join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map(u => `<url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`).join("\n")}\n</urlset>\n`);

if (PREVIEW) {
  const out = path.join(ROOT, "dist-preview"); await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, "index.html"), appPage({ h1: `The <em>best</em> coffee shops in NYC, sorted by what you actually need.`, lede: LEDE, list: shops, title: "Good Grounds NYC — The Best Coffee Shops in NYC, by Neighborhood & Need", desc: "Find the best coffee shops in NYC by neighborhood or need.", inline: true }));
}
const pages = sitemap.length;
console.log(`✓ Built ${shops.length} shops (${usingCity ? "city data + reviews" : "curated only: run `npm run ingest` for every NYC shop"}) → ${pages} indexable pages in dist/${PREVIEW ? " + dist-preview/index.html" : ""}`);
