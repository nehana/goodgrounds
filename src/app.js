/* Good Grounds NYC — client app (no dependencies) */
(async function () {
const CFG = window.GG_CONFIG || {};
const PRESET = window.GG_PRESET || {};
const HOODS = window.GG_HOODS || [];
const $ = id => document.getElementById(id);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slug = t => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const BOROS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];
const PAGE = 24;

/* ---------- data ---------- */
let RAW = window.GG_DATA;
if (!RAW) { try { RAW = await (await fetch(CFG.dataUrl || "/shops.json")).json(); } catch (e) { RAW = []; } }
const centroid = (h, b) => HOODS.find(x => x.name === h && (!b || x.boro === b));

const SHOPS = RAW.map((s, i) => {
  const r = { ...s, id: i, tags: s.tags || [], amb: s.amb || [], love: s.love || [], watch: s.watch || [] };
  if (!r.slug) r.slug = slug(`${r.name.replace(/\(.*?\)/, "")} ${r.hood}`);
  if (r.lat == null) { const c = centroid(r.hood, r.boro); if (c) { r.lat = c.lat; r.lon = c.lon; r.approx = true; } }
  if (r.reviewed) { r.work = workScore(r); r.overall = overallScore(r); } else { r.work = null; r.overall = null; }
  return r;
});
function workScore(s) {
  if (s.l === 0) return Math.min(2, s.w || 0);
  const w = s.w ?? 1.5, o = s.o ?? 1, l = s.l ?? 1, b = s.b ?? .5;
  const raw = w * 1.2 + o * 1 + l * 1.5 + s.s * .6 + (3 - s.cr) * .8 + b * .6; // max 13.6
  return Math.round(raw / 13.6 * 100) / 10;
}
function overallScore(s) {
  const space = s.s / 3 * .5 + (3 - s.cr) / 2 * .5, food = (s.f - 1) / 2, value = (3 - s.p) / 2;
  return Math.round(((s.c / 5) * .55 + space * .2 + food * .15 + value * .10) * 100) / 10;
}

/* ---------- criteria: 1 = yes, 0 = no, .5 = unknown ---------- */
const tri = (v, f) => v == null ? .5 : (f(v) ? 1 : 0);
const has = (s, ...t) => t.some(x => s.tags.includes(x));
const R = s => s.reviewed;
const CRIT = {
  wifi:     { t: "Wifi",            f: s => R(s) ? tri(s.w, v => v >= 1) : .5 },
  fastwifi: { t: "Fast wifi",       f: s => R(s) ? tri(s.w, v => v >= 3) : .5 },
  nowifi:   { t: "No wifi (focus)", f: s => R(s) ? tri(s.w, v => v === 0) : .5 },
  outlets:  { t: "Outlets",         f: s => R(s) ? tri(s.o, v => v >= 2) : .5 },
  laptop:   { t: "Laptops welcome", f: s => R(s) ? tri(s.l, v => v === 2) : .5 },
  bathroom: { t: "Bathroom",        f: s => R(s) ? tri(s.b, v => v === 1) : .5 },
  food:     { t: "Real food menu",  f: s => R(s) ? (s.f === 3 ? 1 : 0) : .5 },
  calm:     { t: "Not packed",      f: s => R(s) ? (s.cr <= 2 ? 1 : 0) : .5 },
  quiet:    { t: "Quiet",           f: s => R(s) ? (s.n === 1 ? 1 : 0) : .5 },
  seating:  { t: "Lots of seats",   f: s => R(s) ? (s.s >= 2 ? 1 : 0) : .5 },
  outdoor:  { t: "Outdoor seating", f: s => R(s) ? (has(s, "outdoor") || s.amb.includes("backyard") ? 1 : 0) : .5 },
  late:     { t: "Open late",       f: s => R(s) ? (has(s, "late") ? 1 : 0) : .5 },
  asian:    { t: "Asian drinks",    f: s => has(s, "asian", "matcha", "vietnamese", "tea") ? 1 : (R(s) ? 0 : .3) },
  matcha:   { t: "Matcha",          f: s => has(s, "matcha", "tea") ? 1 : (R(s) ? 0 : .3) },
  specialty:{ t: "Specialty drinks",f: s => has(s, "specialty-drinks", "vietnamese", "asian", "matcha") ? 1 : (R(s) ? 0 : .3) },
  snob:     { t: "Great coffee",    f: s => R(s) ? (s.c >= 4 ? 1 : 0) : .3 },
  value:    { t: "Cheap",           f: s => R(s) ? (s.p === 1 ? 1 : 0) : .5 },
  pricey:   { t: "Splurge-worthy",  f: s => R(s) ? (s.p === 3 ? 1 : 0) : .3 },
  pretty:   { t: "Aesthetic",       f: s => R(s) ? (has(s, "pretty") || s.amb.some(a => ["opulent", "design-forward", "skylit", "floral", "plant-filled"].includes(a)) ? 1 : 0) : .3 },
  cozy:     { t: "Cozy",            f: s => R(s) ? (s.amb.some(a => ["cozy", "rustic", "bookish", "old-world"].includes(a)) ? 1 : 0) : .3 },
  bookish:  { t: "Bookstore café",  f: s => has(s, "bookstore") || s.amb.includes("bookish") ? 1 : 0 },
  historic: { t: "Historic",        f: s => R(s) ? (has(s, "historic") ? 1 : 0) : .3 },
  pastry:   { t: "Great pastries",  f: s => R(s) ? (s.f >= 2 ? 1 : 0) : .5 },
  study:    { t: "Study spot",      f: s => R(s) ? (s.l >= 1 && s.cr <= 2 && s.n <= 2 && s.s >= 1 ? 1 : 0) : .5 },
  date:     { t: "Date spot",       f: s => R(s) ? (has(s, "date") || s.amb.includes("romantic") ? 1 : 0) : .3 },
  hangout:  { t: "Hangout spot",    f: s => R(s) ? (s.s >= 2 && s.l !== 2 || has(s, "community", "people-watching") ? 1 : 0) : .5 },
  meeting:  { t: "Meeting spot",    f: s => R(s) ? ((s.w ?? 0) >= 2 && s.s >= 2 && s.n <= 2 ? 1 : 0) : .5 },
  quick:    { t: "Quick grab",      f: s => R(s) ? (has(s, "quick") || s.s <= 1 ? 1 : 0) : .5 },
  work:     { t: "Work for hours",  f: s => R(s) ? (s.l === 2 && (s.w ?? 0) >= 2 ? 1 : 0) : .5 },
  indie:    { t: "Independent",     f: s => s.chain ? 0 : 1 },
  reviewed: { t: "Reviewed",        f: s => s.reviewed ? 1 : 0 },
  saved:    { t: "Saved",           f: s => favs.has(s.slug) ? 1 : 0 },
};
const NEEDS = [
  ["work", "💻", "Work for hours"], ["study", "📚", "Study spot"], ["date", "💛", "Date spot"], ["hangout", "👯", "Hangout"],
  ["meeting", "🤝", "Meeting"], ["snob", "☕", "Coffee snob"], ["food", "🥐", "Brunch & food"], ["quick", "⚡", "Quick grab"],
  ["asian", "🍵", "Matcha & Asian drinks"], ["outdoor", "🌿", "Outdoor seats"], ["late", "🌙", "Open late"], ["value", "💸", "Cheap & good"],
  ["nowifi", "📵", "No-wifi focus"], ["pretty", "📸", "Aesthetic"]
];
const TOGGLES = [["wifi", "Wifi (any)"], ["fastwifi", "Fast wifi"], ["outlets", "Outlets"], ["laptop", "Laptops welcome"], ["bathroom", "Has a bathroom"], ["food", "Real food menu"], ["calm", "Usually not packed"], ["quiet", "Quiet"], ["outdoor", "Outdoor seating"]];
const GUIDE_TITLES = { work: "Best laptop-friendly coffee shops", study: "Best study cafés", date: "Best coffee date spots", hangout: "Best cafés to hang out", meeting: "Best cafés for meetings", snob: "Best coffee (coffee-snob approved)", food: "Best cafés with real food", quick: "Best grab-and-go coffee", asian: "Best matcha & Asian drinks", outdoor: "Best cafés with outdoor seating", late: "Best late-night cafés", value: "Best cheap coffee", nowifi: "Best no-wifi cafés for focus", pretty: "Prettiest coffee shops" };

/* ---------- natural-language search ---------- */
const LEX = [
  [/\b(asian|vietnamese|viet|taiwanese|japanese|korean|thai|hojicha|ube|boba|bubble tea|milk tea)\b/, "asian"],
  [/\bmatcha\b/, "matcha"], [/\b(specialty|signature|unique|creative|fun) drinks?\b/, "specialty"],
  [/\b(fast|good|great|strong|reliable|solid) (wifi|wi-fi|internet)\b/, "fastwifi"], [/\b(wifi|wi-fi|internet)\b/, "wifi"],
  [/\b(no wifi|without wifi|offline|no internet|unplug)\b/, "nowifi"],
  [/\b(outlets?|plugs?|charg(e|ing)|power)\b/, "outlets"], [/\b(bathroom|restroom|toilet|washroom|loo)\b/, "bathroom"],
  [/\b(laptop|work(ing)? from|remote work|get work done|work for hours|wfh|cowork)\b/, "work"],
  [/\b(study|studying|homework|exam)\b/, "study"], [/\b(quiet|calm|peaceful|silent|focus)\b/, "quiet"],
  [/\b(not (too )?(crowded|busy|packed)|uncrowded|empty|seats? available)\b/, "calm"],
  [/\b(date|romantic|first date)\b/, "date"], [/\b(hang ?out|catch up|friends|chill)\b/, "hangout"], [/\b(meeting|interview|client|coffee chat)\b/, "meeting"],
  [/\b(food|brunch|breakfast|lunch|sandwich|eat)\b/, "food"], [/\b(pastr(y|ies)|croissant|cookie|cake|bun|baked)\b/, "pastry"],
  [/\b(outdoor|outside|patio|backyard|garden|sidewalk)\b/, "outdoor"], [/\b(late|night|evening|after dinner)\b/, "late"],
  [/\b(cheap|affordable|budget|inexpensive)\b/, "value"], [/\b(fancy|splurge|luxur)/, "pricey"],
  [/\b(best coffee|great coffee|good coffee|espresso|pour ?over|third wave|specialty coffee|coffee snob|light roast)\b/, "snob"],
  [/\b(pretty|aesthetic|instagram|cute|beautiful|gorgeous|design)\b/, "pretty"], [/\b(cozy|cosy|warm|homey)\b/, "cozy"],
  [/\b(book|bookstore|books)\b/, "bookish"], [/\b(historic|old school|old-school|classic)\b/, "historic"],
  [/\b(quick|grab|to go|on the way)\b/, "quick"], [/\b(seats|seating|space|roomy|big)\b/, "seating"],
  [/\b(independent|indie|local|no chains?)\b/, "indie"]
];
function parseQuery(q) {
  const t = " " + q.toLowerCase().replace(/[’']/g, "'") + " ";
  const crit = new Set(); let hood = "", boro = "", near = false;
  for (const [re, k] of LEX) if (re.test(t)) crit.add(k);
  if (crit.has("fastwifi")) crit.delete("wifi");
  if (crit.has("nowifi")) { crit.delete("wifi"); crit.delete("fastwifi"); }
  if (crit.has("matcha")) crit.delete("asian");
  if (/\b(near me|nearby|close to me|around me|walking distance)\b/.test(t)) near = true;
  const hoodNames = [...new Set(SHOPS.map(s => s.hood).concat(HOODS.map(h => h.name)))].sort((a, b) => b.length - a.length);
  const alias = { "les": "Lower East Side", "uws": "Upper West Side", "ues": "Upper East Side", "fidi": "Financial District", "lic": "Long Island City", "bk": "", "the village": "Greenwich Village", "hk": "Hell's Kitchen", "bed stuy": "Bed-Stuy", "bedstuy": "Bed-Stuy", "dumbo": "DUMBO", "williamsburg": "Williamsburg", "midtown": "Midtown" };
  for (const h of hoodNames) if (t.includes(" " + h.toLowerCase().replace(/[’']/g, "'")) ) { hood = h; break; }
  if (!hood) for (const [a, h] of Object.entries(alias)) if (h && new RegExp(`\\b${a}\\b`).test(t)) { hood = h; break; }
  if (!hood) for (const b of BOROS) if (t.includes(b.toLowerCase()) || (b === "Brooklyn" && /\bbk\b/.test(t))) { boro = b; break; }
  return { crit: [...crit], hood, boro, near };
}

/* ---------- state ---------- */
let favs = new Set(); try { favs = new Set(JSON.parse(localStorage.getItem("gg-favs") || "[]")); } catch (e) { }
const saveFavs = () => { try { localStorage.setItem("gg-favs", JSON.stringify([...favs])); } catch (e) { } };
const blank = () => ({ q: "", ai: null, boro: "", hood: "", need: "", tog: new Set(), price: 0, amb: "", sort: "best", hideChains: true, onlyReviewed: false, saved: false });
let S = blank(), shown = PAGE, here = null; // here = {lat,lon,label}

/* ---------- filter + rank ---------- */
const miles = (a, b, c, d) => { const r = x => x * Math.PI / 180, dLat = r(c - a), dLon = r(d - b); return 2 * 3958.8 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLon / 2) ** 2)); };
function textMatch(s, q) { const hay = `${s.name} ${s.hood} ${s.boro} ${s.addr || ""} ${s.tags.join(" ")} ${s.amb.join(" ")} ${s.sum || ""} ${s.drink || ""} ${s.love.join(" ")}`.toLowerCase(); return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w)); }
function results() {
  const ai = S.ai; const strict = [...S.tog]; if (S.need) strict.push(S.need); if (S.saved) strict.push("saved"); if (S.onlyReviewed) strict.push("reviewed");
  const soft = ai ? ai.crit : [];
  const hood = S.hood || ai?.hood || "", boro = S.boro || ai?.boro || "";
  let list = SHOPS.filter(s => {
    if (boro && s.boro !== boro) return false;
    if (hood && s.hood !== hood) return false;
    if (S.hideChains && s.chain) return false;
    for (const k of strict) if (CRIT[k].f(s) !== 1) return false;
    if (S.price && (!s.reviewed || s.p !== S.price)) return false;
    if (S.amb && !s.amb.includes(S.amb)) return false;
    if (S.q && !ai && !textMatch(s, S.q)) return false;
    return true;
  });
  if (here) for (const s of list) s._d = s.lat != null ? miles(here.lat, here.lon, s.lat, s.lon) : 99;
  if (soft.length) {
    // "what" criteria (the kind of place/drink) outweigh amenities
    const W = k => ["asian", "matcha", "specialty", "snob", "food", "bookish", "nowifi", "outdoor", "late", "date", "historic"].includes(k) ? 2 : 1;
    for (const s of list) { s._m = soft.map(k => [k, CRIT[k].f(s)]); s._ms = s._m.reduce((a, [k, v]) => a + v * W(k), 0); }
    const top = Math.max(0, ...list.map(s => s._ms));
    let cut = top - 1; while (cut > .5 && list.filter(s => s._ms >= cut).length < 6) cut -= 1;
    list = list.filter(s => s._ms >= Math.max(.5, cut));
  } else for (const s of list) { s._m = null; s._ms = 0; }
  let sort = S.sort; if (sort === "best" && (here && (S.nearSort || ai?.near))) sort = "near";
  if (sort === "best" && ["work", "study", "meeting"].includes(S.need)) sort = "work";
  const rv = (a, b) => (b.reviewed - a.reviewed);
  const cmp = {
    best: (a, b) => rv(a, b) || (b.overall ?? 0) - (a.overall ?? 0) || (a.chain - b.chain) || a.name.localeCompare(b.name),
    coffee: (a, b) => rv(a, b) || (b.c ?? 0) - (a.c ?? 0) || (b.overall ?? 0) - (a.overall ?? 0),
    work: (a, b) => rv(a, b) || (b.work ?? 0) - (a.work ?? 0),
    calm: (a, b) => rv(a, b) || (a.cr ?? 9) - (b.cr ?? 9) || (b.overall ?? 0) - (a.overall ?? 0),
    price: (a, b) => rv(a, b) || (a.p ?? 9) - (b.p ?? 9) || (b.c ?? 0) - (a.c ?? 0),
    near: (a, b) => (a._d ?? 99) - (b._d ?? 99),
    az: (a, b) => a.name.localeCompare(b.name)
  }[sort] || ((a, b) => 0);
  return list.sort((a, b) => (soft.length ? b._ms - a._ms : 0) || cmp(a, b));
}

/* ---------- labels ---------- */
const L = {
  w: { 3: ["g", "Fast wifi"], 2: ["g", "Wifi OK"], 1: ["w", "Slow/spotty wifi"], 0: ["b", "No wifi"], null: ["n", "Wifi ?"] },
  o: { 3: ["g", "Lots of outlets"], 2: ["g", "Some outlets"], 1: ["w", "Few outlets"], 0: ["b", "No outlets"], null: ["n", "Outlets ?"] },
  l: { 2: ["g", "Laptops welcome"], 1: ["w", "Laptops: limited"], 0: ["b", "No laptops"], null: ["n", "Laptops ?"] },
  b: { 1: ["g", "Has bathroom"], 0: ["b", "No bathroom"], null: ["n", "Bathroom ?"] },
  cr: { 1: ["g", "Usually calm"], 2: ["w", "Moderate crowds"], 3: ["b", "Often packed"] },
  f: { 3: ["g", "Full food menu"], 2: ["g", "Good pastries"], 1: ["w", "Minimal food"] },
  n: { 1: "Quiet", 2: "Lively", 3: "Loud" },
  s: { 3: "Lots of seating", 2: "Medium", 1: "Small", 0: "Standing / stools" }
};
const pill = (c, t) => `<span class="pill ${c}">${t}</span>`;
const P = (k, v) => { const x = L[k][v == null ? "null" : v]; return x ? pill(x[0], x[1]) : ""; };
const price = p => p ? `${"$".repeat(p)}<span style="opacity:.3">${"$".repeat(3 - p)}</span>` : "";
const shopHref = s => CFG.staticPages ? `/coffee/${s.slug}/` : `#shop-${s.slug}`;
const vibesOf = s => ["study", "date", "hangout", "meeting", "work", "quick"].filter(k => CRIT[k].f(s) === 1);
const distTxt = s => s._d != null && here ? `<span class="dist">📍 ${s._d < .1 ? "<0.1" : s._d.toFixed(1)} mi${s.approx ? " (approx.)" : ""}</span>` : "";
const gradeTxt = s => s.grade ? `<span class="grade" title="NYC health inspection grade">${s.grade}</span>` : "";

function card(s, i) {
  const m = s._m ? `<div class="match">${s._m.map(([k, v]) => `<span class="${v === 1 ? "" : v === 0 ? "no" : "q"}">${v === 1 ? "✓" : v === 0 ? "✗" : "?"} ${CRIT[k].t}</span>`).join("")}</div>` : "";
  const head = `<div><h3><a href="${shopHref(s)}" onclick="event.preventDefault()">${esc(s.name)}</a></h3><div class="where">${esc(s.hood)}, ${s.boro}${s.addr ? " · " + esc(s.addr) : ""}</div></div>`;
  const fav = `<button class="fav" aria-label="Save ${esc(s.name)}" data-fav="${s.slug}">${favs.has(s.slug) ? "♥" : "♡"}</button>`;
  if (!s.reviewed) return `<article class="card lite" data-shop="${s.slug}" tabindex="0">${head}${m}
    <div class="pills">${s.chain ? pill("n", "Chain") : pill("v", "Independent")}${s.kind === "tea" ? pill("v", "Tea / boba") : ""}${pill("n", "Not reviewed yet")}</div>
    <div class="cardfoot"><span>${gradeTxt(s)} ${distTxt(s)}</span>${fav}</div></article>`;
  return `<article class="card" data-shop="${s.slug}" tabindex="0"><span class="rank">#${i + 1}</span>${head}
    <div class="scores">
      <div class="score"><div class="lbl">Coffee</div><div class="val">${s.c}<small>/5</small></div><div class="bar"><i style="width:${s.c * 20}%"></i></div></div>
      <div class="score"><div class="lbl">Work</div><div class="val">${s.work}<small>/10</small></div><div class="bar"><i style="width:${s.work * 10}%"></i></div></div>
    </div>${m}
    <div class="pills">${P("w", s.w)}${P("o", s.o)}${P("l", s.l)}${P("b", s.b)}${P("cr", s.cr)}</div>
    ${s.drink ? `<div class="drink">🏆 <b>Top order:</b> ${esc(s.drink)}</div>` : ""}
    <p class="summary">${esc(s.sum)}</p>
    <div class="watch"><b>The catch:</b> ${esc(s.watch[0])}</div>
    <div class="pills">${vibesOf(s).slice(0, 3).map(k => pill("v", CRIT[k].t)).join("")}</div>
    <div class="cardfoot"><span class="price">${price(s.p)}</span><span>${gradeTxt(s)} ${distTxt(s)}</span>${fav}</div></article>`;
}
function nlCard() {
  const n = CFG.newsletter || {}; if (!n.enabled) return "";
  const count = n.subscriberCount ? `Join ${Number(n.subscriberCount).toLocaleString()}+ NYC coffee lovers.` : "Be one of the first subscribers.";
  return `<div class="nlcard"><div><h3>The Weekly Grind ☕</h3><p>5 great cafés, 1 new opening, 0 spam. Every Friday. ${count}</p></div>
    <form class="nlform" data-nl><input type="email" required placeholder="you@email.com" aria-label="Email"><button>Subscribe</button><div class="nlmsg" hidden></div></form></div>`;
}

/* ---------- render ---------- */
function title() {
  const where = S.hood || S.ai?.hood || S.boro || S.ai?.boro || "NYC";
  if (S.ai && S.ai.crit.length) return `Best matches in ${where}`;
  if (S.saved) return "Your saved spots";
  return `${GUIDE_TITLES[S.need] || "Best coffee shops"} in ${where}`;
}
function render(keepPage) {
  if (!keepPage) shown = PAGE;
  const list = results();
  $("resTitle").textContent = title();
  const rc = list.filter(s => s.reviewed).length;
  $("resCount").textContent = `${list.length.toLocaleString()} shop${list.length === 1 ? "" : "s"}${list.length !== rc ? ` · ${rc} reviewed` : ""}`;
  const items = list.slice(0, shown).map(card);
  if (items.length > 6) items.splice(6, 0, nlCard());
  $("grid").innerHTML = items.length ? items.join("") : emptyState();
  $("more").hidden = list.length <= shown; $("more").textContent = `Show more (${(list.length - shown).toLocaleString()} left)`;
  document.querySelectorAll("#needs .chip").forEach(c => c.setAttribute("aria-pressed", c.dataset.k === S.need));
  document.querySelectorAll("[data-tog]").forEach(c => c.checked = S.tog.has(c.dataset.tog));
  document.querySelectorAll("#priceSeg button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.p === S.price));
  $("hideChains").checked = S.hideChains; $("onlyReviewed").checked = S.onlyReviewed; $("savedOnly").checked = S.saved;
  $("boroSel").value = S.boro; $("hoodSel").value = S.hood; $("ambSel").value = S.amb; $("sortSel").value = S.sort;
  renderActive(); renderUnderstood();
  const nf = activeList().length; $("mfBtn").textContent = `Filters${nf ? ` (${nf})` : ""}`;
  document.title = `${title()} | ${CFG.siteName || "Good Grounds NYC"}`;
  syncHash();
}
function emptyState() {
  const nb = (S.boro === "Bronx" || S.boro === "Staten Island") && !SHOPS.some(s => s.boro === S.boro);
  return `<div class="empty">${nb ? `We're still mapping ${S.boro}. It's on the roadmap.` : "No shops match all of those filters yet."}<br>
    ${S.tog.size ? `<button class="btn ghost" data-act="dropTog">Remove must-haves</button>` : ""}${S.hood ? `<button class="btn ghost" data-act="dropHood">Search all of ${esc(S.boro || "NYC")}</button>` : ""}<button class="btn primary" data-act="reset">Start over</button></div>`;
}
function activeList() {
  const a = [];
  if (S.ai) a.push(["ai", `“${S.q.length > 30 ? S.q.slice(0, 30) + "…" : S.q}”`]); else if (S.q) a.push(["q", `Search: ${S.q}`]);
  if (S.boro) a.push(["boro", S.boro]); if (S.hood) a.push(["hood", S.hood]);
  if (S.need) a.push(["need", CRIT[S.need].t]); for (const t of S.tog) a.push(["tog:" + t, CRIT[t].t]);
  if (S.price) a.push(["price", "$".repeat(S.price)]); if (S.amb) a.push(["amb", S.amb]);
  if (here) a.push(["near", `Near ${here.label}`]); if (S.saved) a.push(["saved", "Saved"]); if (S.onlyReviewed) a.push(["rev", "Reviewed only"]);
  return a;
}
function renderActive() {
  const a = activeList();
  $("active").innerHTML = a.length ? a.map(([k, t]) => `<button data-rm="${k}" aria-label="Remove ${esc(t)}">${esc(t)} ✕</button>`).join("") + `<button class="clear" data-act="reset">Clear all</button>` : "";
}
function renderUnderstood() {
  const el = $("understood"); const ai = S.ai;
  if (!ai) { el.classList.remove("on"); return; }
  const bits = ai.crit.map(k => pill("g", CRIT[k].t));
  if (ai.hood) bits.push(pill("v", "📍 " + ai.hood)); else if (ai.boro) bits.push(pill("v", "📍 " + ai.boro));
  if (ai.near) bits.push(pill("v", here ? `📍 near ${here.label}` : "📍 near you"));
  el.innerHTML = bits.length ? `<b>${ai.src === "ai" ? "✨ AI understood" : "✨ Understood"}:</b> ${bits.join("")} <span style="color:var(--muted)">· Best matches first. ✓ = confirmed, ? = not verified yet.</span>`
    : `<b>Hmm, I couldn't pick out specific needs there.</b> Try something like “quiet café with outlets and a bathroom in Chelsea”.`;
  el.classList.add("on");
}

/* ---------- drawer ---------- */
function openShop(sl) {
  const s = SHOPS.find(x => x.slug === sl); if (!s) return;
  const q = s.addr ? `${s.name.replace(/\s*\(.*\)/, "")} ${s.addr} New York, NY ${s.zip || ""}` : `${s.name.replace(/\s*\(.*\)/, "")} ${s.hood} New York`;
  const maps = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
  const same = SHOPS.filter(x => x.hood === s.hood && x.id !== s.id && x.reviewed).slice(0, 4);
  const body = !s.reviewed ? `
    <div class="unrev"><b>Not reviewed yet.</b> We know this ${s.kind === "tea" ? "tea shop" : "coffee shop"} exists (it's in NYC's health inspection records), but we haven't summarized its reviews or checked wifi, outlets or bathrooms yet.</div>
    <div class="amen" style="margin-top:14px">
      <div><b>Address</b>${esc(s.addr || "—")}${s.zip ? ", " + s.zip : ""}</div><div><b>Health grade</b>${s.grade ? gradeTxt(s) : "Not yet graded"}</div>
      <div><b>Type</b>${s.chain ? "Chain" : "Independent"}${s.kind === "tea" ? " · Tea / boba" : ""}</div><div><b>Borough</b>${s.boro}</div>
    </div>` : `
    <p class="summary" style="font-size:16px;margin-top:10px">${esc(s.sum)}</p>
    ${s.drink ? `<div class="drink" style="margin-top:14px;font-size:15px">🏆 <b>Top order:</b> ${esc(s.drink)}</div>` : `<div class="drink" style="margin-top:14px;background:var(--na-bg)">🏆 <b>Top order:</b> still collecting votes</div>`}
    <div class="scores" style="margin-top:14px;grid-template-columns:1fr 1fr 1fr">
      <div class="score"><div class="lbl">Overall</div><div class="val">${s.overall}<small>/10</small></div></div>
      <div class="score"><div class="lbl">Coffee</div><div class="val">${s.c}<small>/5</small></div></div>
      <div class="score"><div class="lbl">Work</div><div class="val">${s.work}<small>/10</small></div></div>
    </div>
    <h4>Amenities at a glance</h4>
    <div class="amen">
      <div><b>Wifi</b>${P("w", s.w)}</div><div><b>Outlets</b>${P("o", s.o)}</div>
      <div><b>Laptops</b>${P("l", s.l)}</div><div><b>Bathroom</b>${P("b", s.b)}</div>
      <div><b>Crowds</b>${P("cr", s.cr)}</div><div><b>Food</b>${P("f", s.f)}</div>
      <div><b>Seating</b>${L.s[s.s]}</div><div><b>Noise</b>${L.n[s.n] || "—"}</div>
      <div><b>Price</b><span class="price">${price(s.p)}</span></div><div><b>Health grade</b>${s.grade ? gradeTxt(s) : "—"}</div>
    </div>
    <h4>Ambiance</h4><div class="pills">${s.amb.map(a => pill("n", a)).join("")}</div>
    <h4>Best for</h4><div class="pills">${vibesOf(s).map(k => pill("v", CRIT[k].t)).join("") || '<span class="summary">A solid all-rounder</span>'}</div>
    <h4>What people love</h4><ul class="lovelist">${s.love.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    <h4>Watch out for</h4><ul class="watchlist">${s.watch.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
  $("drawerInner").innerHTML = `
    <button class="close" data-act="close" aria-label="Close">✕</button>
    <div style="color:var(--muted);font-size:14px">${esc(s.hood)} · ${s.boro}${s.addr ? " · " + esc(s.addr) : ""} ${distTxt(s)}</div>
    <h2>${esc(s.name)}</h2>${body}
    <div class="btnrow">
      <a class="btn primary" href="${maps}" target="_blank" rel="noopener">Directions ↗</a>
      <button class="btn ghost" data-copy="${s.slug}">Copy link</button>
      <button class="btn ghost" data-fav="${s.slug}" data-refresh="1">${favs.has(s.slug) ? "♥ Saved" : "♡ Save"}</button>
      ${CFG.staticPages ? `<a class="btn ghost" href="/coffee/${s.slug}/">Full page</a>` : ""}
      ${CFG.reportFormUrl ? `<a class="btn ghost" href="${CFG.reportFormUrl}" target="_blank" rel="noopener">Suggest an edit</a>` : ""}
    </div>
    ${same.length ? `<h4>More in ${esc(s.hood)}</h4><div class="pills">${same.map(x => `<button class="pill n" style="border:0;cursor:pointer" data-open="${x.slug}">${esc(x.name)}</button>`).join("")}</div>` : ""}
    <p class="verif">${s.reviewed ? "Summary based on public reviews and press. Last reviewed: Nov 2026 (beta). “?” means not yet verified." : "Listing from NYC Open Data (DOHMH inspections)."}</p>`;
  $("drawer").classList.add("open"); $("scrim").classList.add("open"); $("drawer").setAttribute("aria-hidden", "false"); $("drawer").scrollTop = 0;
  try { history.replaceState(null, "", "#shop-" + s.slug); } catch (e) { }
}
function closeDrawer() { $("drawer").classList.remove("open"); $("scrim").classList.remove("open"); $("drawer").setAttribute("aria-hidden", "true"); syncHash(); }

/* ---------- near me ---------- */
function setHere(h) { here = h; S.sort = "near"; S.nearSort = true; $("nearBtn").setAttribute("aria-pressed", "true"); $("nearPanel").classList.remove("on"); render(); jump(); }
function nearMe() {
  if (here) { here = null; S.nearSort = false; if (S.sort === "near") S.sort = "best"; $("nearBtn").setAttribute("aria-pressed", "false"); render(); return; }
  const fallback = msg => { $("nearMsg").textContent = msg; $("nearPanel").classList.add("on"); };
  if (!navigator.geolocation) return fallback("Location isn't available here. Where are you?");
  $("nearBtn").textContent = "📍 Locating…";
  navigator.geolocation.getCurrentPosition(p => { $("nearBtn").textContent = "📍 Near me"; setHere({ lat: p.coords.latitude, lon: p.coords.longitude, label: "you" }); },
    () => { $("nearBtn").textContent = "📍 Near me"; fallback("Couldn't get your location (it's blocked in some previews). Pick where you are:"); }, { timeout: 8000 });
}

/* ---------- AI search ---------- */
let aiSeq = 0;
async function runSearch(q) {
  S.q = q.trim(); S.ai = null;
  if (S.q) {
    const p = parseQuery(S.q);
    const looksNatural = p.crit.length || p.near || p.hood || p.boro || S.q.split(/\s+/).length >= 4;
    if (looksNatural) { S.ai = { ...p, src: "local" }; if (p.near && !here) nearMe(); }
  }
  render();
  if (CFG.aiEndpoint && S.q.split(/\s+/).length >= 4) {
    const my = ++aiSeq;
    try {
      const r = await fetch(CFG.aiEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: S.q, hoods: [...new Set(SHOPS.map(s => s.hood))] }) });
      if (!r.ok) return; const j = await r.json(); if (my !== aiSeq) return;
      const crit = (j.criteria || []).filter(k => CRIT[k]);
      S.ai = { crit, hood: j.neighborhood || "", boro: BOROS.includes(j.borough) ? j.borough : "", near: !!j.near, src: "ai" };
      if (S.ai.near && !here) nearMe(); render();
    } catch (e) { /* local parse already showing */ }
  }
}

/* ---------- hash routing (#hood-x, #need-x, #need-x-in-hood, #shop-x) ---------- */
let lock = false;
function syncHash() {
  if (lock || $("drawer").classList.contains("open")) return;
  let h = ""; if (S.hood && S.need) h = `need-${S.need}-in-${slug(S.hood)}`; else if (S.hood) h = `hood-${slug(S.hood)}`; else if (S.need) h = `need-${S.need}`; else if (S.boro) h = `boro-${slug(S.boro)}`;
  try { if (("#" + h) !== location.hash && !(h === "" && !location.hash)) history.replaceState(null, "", h ? "#" + h : location.pathname); } catch (e) { }
}
function readHash() {
  const h = location.hash.slice(1); if (!h) return false;
  const hoodBy = x => [...new Set(SHOPS.map(s => s.hood))].find(n => slug(n) === x);
  let m; lock = true;
  if ((m = h.match(/^need-([a-z]+)-in-(.+)$/)) && CRIT[m[1]]) { S.need = m[1]; S.hood = hoodBy(m[2]) || ""; }
  else if ((m = h.match(/^need-([a-z]+)$/)) && CRIT[m[1]]) S.need = m[1];
  else if ((m = h.match(/^hood-(.+)$/))) S.hood = hoodBy(m[1]) || "";
  else if ((m = h.match(/^boro-(.+)$/))) S.boro = BOROS.find(b => slug(b) === m[1]) || "";
  else if ((m = h.match(/^shop-(.+)$/))) setTimeout(() => openShop(m[1]), 60);
  if (S.hood) S.boro = SHOPS.find(s => s.hood === S.hood)?.boro || "";
  lock = false; return true;
}

/* ---------- static sections ---------- */
function renderBrowse() {
  $("hoods").innerHTML = BOROS.map(b => {
    const hs = [...new Set(SHOPS.filter(s => s.boro === b).map(s => s.hood))].sort();
    return `<div class="boro"><h3>${b}</h3>${hs.length ? hs.map(h => { const n = SHOPS.filter(s => s.hood === h && !(S.hideChains && s.chain)).length; return `<a href="${CFG.staticPages ? `/neighborhoods/${slug(h)}/` : `#hood-${slug(h)}`}" data-hood="${esc(h)}">${esc(h)}<span>${n}</span></a>`; }).join("") : `<div class="soon">Mapping now. Coming soon.</div>`}</div>`;
  }).join("");
  const G = [["work", ""], ["snob", ""], ["study", ""], ["date", ""], ["asian", ""], ["work", "Williamsburg"], ["work", "Chelsea"], ["nowifi", ""], ["food", ""], ["pretty", ""], ["snob", "Lower East Side"], ["outdoor", ""], ["value", ""], ["hangout", ""], ["meeting", ""], ["late", ""]];
  $("guideList").innerHTML = G.map(([n, h]) => {
    const c = SHOPS.filter(s => CRIT[n].f(s) === 1 && (!h || s.hood === h)).length; if (c < 2) return "";
    const href = CFG.staticPages ? `/best/${n}${h ? "-" + slug(h) : ""}/` : `#need-${n}${h ? "-in-" + slug(h) : ""}`;
    return `<a class="guide" href="${href}" data-guide="${n}|${esc(h)}"><b>${GUIDE_TITLES[n]} in ${h || "NYC"}</b><span>${c} shops</span></a>`;
  }).join("");
}
const FAQ = [
  ["What are the best coffee shops in NYC to work from?", () => `Top laptop-friendly picks: ${SHOPS.filter(s => CRIT.work.f(s) === 1).sort((a, b) => b.work - a.work).slice(0, 5).map(s => `${s.name} (${s.hood})`).join(", ")}. Tap “Work for hours” to see every one.`],
  ["Which NYC coffee shops have the best coffee?", () => `The ones reviewers rave about most: ${SHOPS.filter(s => s.c === 5).map(s => s.name).join(", ")}. Expect lines and few seats at most of them.`],
  ["Which NYC coffee shops have bathrooms?", () => `Confirmed so far: ${SHOPS.filter(s => s.b === 1).map(s => s.name).join(", ")}. Use the “Has a bathroom” filter. A “?” means we haven't confirmed it yet.`],
  ["Where can I get matcha or Asian-style coffee drinks in NYC?", () => `Try ${SHOPS.filter(s => s.reviewed && CRIT.asian.f(s) === 1).map(s => s.name).join(", ")}, or tap “Matcha & Asian drinks”.`],
  ["Are there NYC cafés without wifi for focused work?", () => `Yes. ${SHOPS.filter(s => CRIT.nowifi.f(s) === 1 && s.s >= 2).map(s => s.name).join(", ")} are popular with people who want to go offline.`],
  ["How is this information kept up to date?", () => `Shop listings sync from NYC's public health inspection records, so closed places drop off. Reviewed shops are re-checked regularly, and anything we haven't confirmed shows a “?”.`]
];
function renderFAQ() { $("faqList").innerHTML = FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${esc(a())}</p></details>`).join(""); }

/* ---------- controls / events ---------- */
function fillHoods() { const hs = [...new Set(SHOPS.filter(s => !S.boro || s.boro === S.boro).map(s => s.hood))].sort(); $("hoodSel").innerHTML = `<option value="">All neighborhoods</option>` + hs.map(h => `<option>${esc(h)}</option>`).join(""); $("hoodSel").value = S.hood; }
function jump() { const r = $("results").getBoundingClientRect(); if (r.top > innerHeight * .6 || r.top < -200) $("results").scrollIntoView({ behavior: "smooth" }); }
function toast(t) { const el = $("toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 1800); }
function toggleFav(sl) { favs.has(sl) ? favs.delete(sl) : favs.add(sl); saveFavs(); toast(favs.has(sl) ? "Saved ♥" : "Removed"); }
function resetAll() { S = blank(); here = null; $("q").value = ""; $("nearBtn").setAttribute("aria-pressed", "false"); fillHoods(); render(); }

function init() {
  $("boroSel").innerHTML = `<option value="">All boroughs</option>` + BOROS.map(b => `<option>${b}</option>`).join("");
  const ambs = [...new Set(SHOPS.flatMap(s => s.amb))].sort();
  $("ambSel").innerHTML = `<option value="">Any vibe</option>` + ambs.map(a => `<option>${a}</option>`).join("");
  $("needs").innerHTML = NEEDS.map(([k, e, t]) => `<button class="chip" data-k="${k}" aria-pressed="false">${e} ${t}</button>`).join("");
  $("togList").innerHTML = TOGGLES.map(([k, t]) => `<label class="toggle">${t}<input type="checkbox" data-tog="${k}"></label>`).join("");
  $("nearHood").innerHTML = `<option value="">Choose a neighborhood…</option>` + BOROS.map(b => `<optgroup label="${b}">${HOODS.filter(h => h.boro === b).map(h => `<option value="${esc(h.name)}|${b}">${esc(h.name)}</option>`).join("")}</optgroup>`).join("");
  const total = SHOPS.length, rev = SHOPS.filter(s => s.reviewed).length;
  $("betaCount").innerHTML = total > rev ? `<b>${total.toLocaleString()}</b> NYC coffee & tea shops, <b>${rev}</b> fully reviewed so far.` : `<b>${rev}</b> hand-reviewed shops.`;

  // presets from static pages
  if (PRESET.hood) { S.hood = PRESET.hood; S.boro = SHOPS.find(s => s.hood === PRESET.hood)?.boro || ""; }
  if (PRESET.need) S.need = PRESET.need; if (PRESET.boro) S.boro = PRESET.boro;
  readHash(); fillHoods();

  let deb; $("q").addEventListener("input", e => { clearTimeout(deb); deb = setTimeout(() => runSearch(e.target.value), 250); });
  $("q").addEventListener("keydown", e => { if (e.key === "Enter") { clearTimeout(deb); runSearch(e.target.value); jump(); } });
  $("askBtn").onclick = () => { runSearch($("q").value); jump(); };
  $("nearBtn").onclick = nearMe;
  $("nearHood").onchange = e => { if (!e.target.value) return; const [n, b] = e.target.value.split("|"); const c = centroid(n, b); setHere({ lat: c.lat, lon: c.lon, label: n }); };
  $("boroSel").onchange = e => { S.boro = e.target.value; S.hood = ""; fillHoods(); render(); };
  $("hoodSel").onchange = e => { S.hood = e.target.value; if (S.hood) S.boro = SHOPS.find(s => s.hood === S.hood).boro; render(); };
  $("ambSel").onchange = e => { S.amb = e.target.value; render(); };
  $("sortSel").onchange = e => { S.sort = e.target.value; if (S.sort === "near" && !here) nearMe(); render(); };
  $("hideChains").onchange = e => { S.hideChains = e.target.checked; render(); renderBrowse(); };
  $("onlyReviewed").onchange = e => { S.onlyReviewed = e.target.checked; render(); };
  $("savedOnly").onchange = e => { S.saved = e.target.checked; render(); };
  $("more").onclick = () => { shown += PAGE; render(true); };
  $("mfBtn").onclick = () => { $("filters").classList.add("open"); $("scrim").classList.add("open"); };
  $("mfNear").onclick = nearMe;

  document.addEventListener("click", e => {
    const t = e.target;
    const chip = t.closest("#needs .chip"); if (chip) { S.need = S.need === chip.dataset.k ? "" : chip.dataset.k; render(); jump(); return; }
    const pb = t.closest("#priceSeg button"); if (pb) { S.price = S.price === +pb.dataset.p ? 0 : +pb.dataset.p; render(); return; }
    const ex = t.closest("[data-example]"); if (ex) { $("q").value = ex.dataset.example; runSearch(ex.dataset.example); jump(); return; }
    const fv = t.closest("[data-fav]"); if (fv) { e.stopPropagation(); toggleFav(fv.dataset.fav); if (fv.dataset.refresh) openShop(fv.dataset.fav); else fv.textContent = favs.has(fv.dataset.fav) ? "♥" : "♡"; if (S.saved) render(true); return; }
    const cp = t.closest("[data-copy]"); if (cp) { const u = CFG.staticPages ? location.origin + "/coffee/" + cp.dataset.copy + "/" : location.href.split("#")[0] + "#shop-" + cp.dataset.copy; try { navigator.clipboard.writeText(u).then(() => toast("Link copied"), () => toast("Copy blocked: use the address bar")); } catch (er) { toast("Copy blocked"); } return; }
    const op = t.closest("[data-open]"); if (op) { openShop(op.dataset.open); return; }
    const rm = t.closest("[data-rm]"); if (rm) { const k = rm.dataset.rm; if (k === "ai" || k === "q") { S.q = ""; S.ai = null; $("q").value = ""; } else if (k === "boro") { S.boro = ""; S.hood = ""; fillHoods(); } else if (k === "hood") S.hood = ""; else if (k === "need") S.need = ""; else if (k.startsWith("tog:")) S.tog.delete(k.slice(4)); else if (k === "price") S.price = 0; else if (k === "amb") S.amb = ""; else if (k === "near") { here = null; S.nearSort = false; if (S.sort === "near") S.sort = "best"; $("nearBtn").setAttribute("aria-pressed", "false"); } else if (k === "saved") S.saved = false; else if (k === "rev") S.onlyReviewed = false; render(); return; }
    const act = t.closest("[data-act]"); if (act) { const a = act.dataset.act; if (a === "reset") resetAll(); if (a === "close") closeDrawer(); if (a === "dropTog") { S.tog.clear(); render(); } if (a === "dropHood") { S.hood = ""; render(); } if (a === "sheet") { $("filters").classList.remove("open"); $("scrim").classList.remove("open"); } return; }
    if (!CFG.staticPages) {
      const hl = t.closest("[data-hood]"); if (hl) { e.preventDefault(); const h = hl.dataset.hood; S = { ...blank(), hood: h, boro: SHOPS.find(s => s.hood === h).boro }; fillHoods(); render(); $("results").scrollIntoView({ behavior: "smooth" }); return; }
      const gl = t.closest("[data-guide]"); if (gl) { e.preventDefault(); const [n, h] = gl.dataset.guide.split("|"); S = { ...blank(), need: n, hood: h, boro: h ? SHOPS.find(s => s.hood === h).boro : "" }; fillHoods(); render(); $("results").scrollIntoView({ behavior: "smooth" }); return; }
    }
    const c = t.closest(".card[data-shop]"); if (c && !t.closest("button") ) { openShop(c.dataset.shop); return; }
  });
  document.addEventListener("change", e => { const tg = e.target.closest("[data-tog]"); if (tg) { tg.checked ? S.tog.add(tg.dataset.tog) : S.tog.delete(tg.dataset.tog); render(); } });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeDrawer(); $("filters").classList.remove("open"); } if (e.key === "Enter" && e.target.matches(".card[data-shop]")) openShop(e.target.dataset.shop); });
  $("scrim").onclick = () => { closeDrawer(); $("filters").classList.remove("open"); };
  document.addEventListener("submit", async e => {
    const f = e.target.closest("[data-nl]"); if (!f) return; e.preventDefault();
    const email = f.querySelector("input").value, msg = f.querySelector(".nlmsg"); msg.hidden = false;
    if (!CFG.subscribeEndpoint) { msg.textContent = "Thanks! (Signups go live once the site is deployed with a newsletter provider.)"; return; }
    msg.textContent = "Subscribing…";
    try { const r = await fetch(CFG.subscribeEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }); msg.textContent = r.ok ? "You're in! See you Friday ☕" : r.status === 501 ? "Thanks! Signups open very soon." : "Hmm, that didn't work. Try again?"; } catch (er) { msg.textContent = "Network error. Try again?"; }
  });
  addEventListener("hashchange", () => { if (/^#(hood|need|boro|shop)-/.test(location.hash)) { const keep = S; S = blank(); S.hideChains = keep.hideChains; readHash(); fillHoods(); render(); } });
  if ("IntersectionObserver" in window) new IntersectionObserver(es => { if (es[0].isIntersecting && !$("more").hidden && shown < 200) { shown += PAGE; render(true); } }, { rootMargin: "400px" }).observe($("more"));

  render(); renderBrowse(); renderFAQ();
}
init();
window.GG = { SHOPS, parseQuery, CRIT };
})();
