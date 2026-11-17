#!/usr/bin/env node
/**
 * Pulls every active coffee & tea shop in NYC from NYC Open Data
 * (DOHMH Restaurant Inspection Results, dataset 43nn-pn8j), dedupes it,
 * assigns neighborhoods, flags chains, and merges in our hand-reviewed listings.
 *
 * Usage:
 *   node scripts/ingest.mjs                 # all 5 boroughs, Coffee/Tea only
 *   node scripts/ingest.mjs --boro=Manhattan
 *   node scripts/ingest.mjs --include-bakeries   # also pulls "Bakery Products/Desserts"
 *
 * Optional env: SOCRATA_APP_TOKEN (free, raises rate limits)
 * Output: data/shops.json  +  data/ingest-report.json
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const ACTIVE_MONTHS = Number(args.months || 24); // drop places not inspected in this window (likely closed)

const cfg = JSON.parse(await fs.readFile(path.join(ROOT, "site.config.json"), "utf8"));
const curated = JSON.parse(await fs.readFile(path.join(ROOT, "data/curated.json"), "utf8"));
const hoods = JSON.parse(await fs.readFile(path.join(ROOT, "data/neighborhoods.json"), "utf8"));

const cuisines = ["Coffee/Tea"]; if (args["include-bakeries"]) cuisines.push("Bakery Products/Desserts");
const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - ACTIVE_MONTHS);
const cutoffStr = cutoff.toISOString().slice(0, 10) + "T00:00:00.000";

const BASE = "https://data.cityofnewyork.us/resource/43nn-pn8j.json";
const where = [`cuisine_description in(${cuisines.map(c => `'${c}'`).join(",")})`,
  `(inspection_date >= '${cutoffStr}' OR inspection_date = '1900-01-01T00:00:00.000')`];
if (args.boro) where.push(`boro='${args.boro}'`);

async function fetchAll() {
  const rows = []; const limit = 50000;
  for (let offset = 0; ; offset += limit) {
    const q = new URLSearchParams({
      $select: "camis,dba,boro,building,street,zipcode,phone,latitude,longitude,inspection_date,grade,grade_date,cuisine_description",
      $where: where.join(" AND "), $order: "camis", $limit: String(limit), $offset: String(offset)
    });
    const res = await fetch(`${BASE}?${q}`, { headers: process.env.SOCRATA_APP_TOKEN ? { "X-App-Token": process.env.SOCRATA_APP_TOKEN } : {} });
    if (!res.ok) throw new Error(`NYC Open Data ${res.status}: ${await res.text()}`);
    const page = await res.json(); rows.push(...page);
    console.log(`  fetched ${rows.length} inspection rows…`);
    if (page.length < limit) break;
  }
  return rows;
}

const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set("coffee cafe caffe co company roasters roasting roastery nyc ny new york inc llc corp the espresso bar shop house and of".split(" "));
const keyTokens = s => norm(s.replace(/\(.*?\)/g, "")).split(" ").filter(t => t && !STOP.has(t));
const titleCase = s => s.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\b(Nyc|Ny|Llc|Inc)\b/g, m => m.toUpperCase()).replace(/'S\b/g, "'s");
const miles = (a, b, c, d) => { const R = 3958.8, r = x => x * Math.PI / 180; const dLat = r(c - a), dLon = r(d - b); return 2 * R * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLon / 2) ** 2)); };
const nearestHood = (lat, lon, boro) => { let best = null, bd = 1e9; for (const h of hoods) { if (boro && h.boro !== boro) continue; const d = miles(lat, lon, h.lat, h.lon); if (d < bd) { bd = d; best = h; } } return best; };
const slugify = t => norm(t).replace(/ and /g, "-").replace(/\s+/g, "-");
const isChain = n => cfg.chains.some(c => norm(n).includes(norm(c)));
const isTea = n => /\b(tea|boba|bubble|matcha|chai)\b/i.test(n) && !/coffee/i.test(n);

console.log("Pulling NYC Open Data (DOHMH inspections)…");
const rows = await fetchAll();

// collapse to one record per business (camis)
const byId = new Map();
for (const r of rows) {
  let b = byId.get(r.camis);
  if (!b) { b = { camis: r.camis, dba: r.dba, boro: r.boro, building: r.building, street: r.street, zip: r.zipcode, phone: r.phone, lat: +r.latitude || null, lon: +r.longitude || null, last: r.inspection_date, grade: null, gradeDate: null }; byId.set(r.camis, b); }
  if (r.inspection_date > b.last) b.last = r.inspection_date;
  if (r.grade && ["A", "B", "C"].includes(r.grade) && (!b.gradeDate || r.grade_date > b.gradeDate)) { b.grade = r.grade; b.gradeDate = r.grade_date; }
}
const BOROS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];
let biz = [...byId.values()].filter(b => BOROS.includes(b.boro) && b.dba);

// assign neighborhood by nearest centroid within the borough
for (const b of biz) {
  if (b.lat && b.lon && Math.abs(b.lat) > 1) { b.hood = nearestHood(b.lat, b.lon, b.boro)?.name; }
  else { b.lat = b.lon = null; b.hood = null; }
}

// merge curated reviews
const report = { fetchedRows: rows.length, businesses: biz.length, matched: [], unmatchedCurated: [] };
const used = new Set();
const out = [];
for (const c of curated) {
  const kt = keyTokens(c.name); const center = hoods.find(h => h.name === c.hood && h.boro === c.boro);
  let best = null, bd = 1e9;
  for (const b of biz) {
    if (used.has(b.camis) || b.boro !== c.boro) continue;
    const bt = new Set(keyTokens(b.dba)); if (!kt.length || !kt.every(t => bt.has(t))) continue;
    const d = b.lat && center ? miles(b.lat, b.lon, center.lat, center.lon) : 5;
    if (d < bd) { bd = d; best = b; }
  }
  if (best && bd < 1.5) {
    used.add(best.camis); report.matched.push(`${c.name} ⇢ ${best.dba} (${best.building} ${best.street})`);
    out.push({ ...c, addr: `${best.building} ${titleCase(best.street)}`.trim(), zip: best.zip, phone: best.phone || null, lat: best.lat ?? center?.lat, lon: best.lon ?? center?.lon, approx: !best.lat, grade: best.grade, chain: false, kind: "coffee", camis: best.camis, reviewed: true });
  } else {
    report.unmatchedCurated.push(c.name);
    out.push({ ...c, lat: center?.lat, lon: center?.lon, approx: true, chain: false, kind: "coffee", reviewed: true });
  }
}
for (const b of biz) {
  if (used.has(b.camis)) continue;
  const name = titleCase(b.dba);
  out.push({ name, hood: b.hood || `${b.boro} (other)`, boro: b.boro, addr: `${b.building || ""} ${titleCase(b.street || "")}`.trim(), zip: b.zip, phone: b.phone || null, lat: b.lat, lon: b.lon, approx: !b.lat, grade: b.grade, chain: isChain(b.dba), kind: isTea(b.dba) ? "tea" : "coffee", camis: b.camis, reviewed: false, tags: isTea(b.dba) ? ["asian", "tea"] : [] });
}

// unique slugs
const seen = new Map();
for (const s of out) { let sl = slugify(`${s.name.replace(/\(.*?\)/, "")} ${s.hood}`); const n = (seen.get(sl) || 0) + 1; seen.set(sl, n); s.slug = n > 1 ? `${sl}-${n}` : sl; }

report.total = out.length; report.reviewed = out.filter(s => s.reviewed).length; report.chains = out.filter(s => s.chain).length;
report.byBoro = Object.fromEntries(BOROS.map(b => [b, out.filter(s => s.boro === b).length]));
report.generatedAt = new Date().toISOString();
await fs.writeFile(path.join(ROOT, "data/shops.json"), JSON.stringify(out));
await fs.writeFile(path.join(ROOT, "data/ingest-report.json"), JSON.stringify(report, null, 2));
console.log(`\n✓ ${out.length} shops (${report.reviewed} reviewed, ${report.chains} chains)`, report.byBoro);
if (report.unmatchedCurated.length) console.log("  Curated shops not found in city data (kept with approximate location):", report.unmatchedCurated.join(", "));
