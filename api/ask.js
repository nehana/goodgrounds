// Vercel serverless function: turns a natural-language request into structured filters.
// Needs env var ANTHROPIC_API_KEY. Without it, returns 501 and the site uses its built-in parser.
const CRITERIA = ["wifi","fastwifi","nowifi","outlets","laptop","bathroom","food","calm","quiet","seating","outdoor","late","asian","matcha","specialty","snob","value","pricey","pretty","cozy","bookish","historic","pastry","study","date","hangout","meeting","quick","work","indie"];
const BOROS = ["Manhattan","Brooklyn","Queens","Bronx","Staten Island"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(501).json({ error: "AI search not configured" });
  const { q = "", hoods = [] } = req.body || {};
  if (!q || q.length > 300) return res.status(400).json({ error: "Bad query" });

  const system = `You convert a request for an NYC coffee shop into JSON filters. Reply with ONLY a JSON object:
{"criteria": string[], "neighborhood": string|null, "borough": string|null, "near": boolean}
- criteria: choose only from ${JSON.stringify(CRITERIA)}. "asian" = matcha, Vietnamese, Taiwanese, Japanese, Korean or boba drinks. "work" = laptop-friendly with wifi. "snob" = excellent coffee.
- neighborhood: exactly one of ${JSON.stringify(hoods.slice(0, 400))} or null.
- borough: one of ${JSON.stringify(BOROS)} or null.
- near: true if they want something near them.`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5", max_tokens: 200, system, messages: [{ role: "user", content: q }] })
    });
    if (!r.ok) return res.status(502).json({ error: "Upstream error" });
    const j = await r.json();
    const text = (j.content || []).map(c => c.text || "").join("");
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    res.setHeader("Cache-Control", "s-maxage=86400");
    return res.status(200).json({
      criteria: (parsed.criteria || []).filter(c => CRITERIA.includes(c)),
      neighborhood: hoods.includes(parsed.neighborhood) ? parsed.neighborhood : null,
      borough: BOROS.includes(parsed.borough) ? parsed.borough : null,
      near: !!parsed.near
    });
  } catch (e) { return res.status(500).json({ error: "Parse failed" }); }
}
