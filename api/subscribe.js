// Vercel serverless function: newsletter signup.
// Set BUTTONDOWN_API_KEY (buttondown.com) — or swap the fetch below for Beehiiv / ConvertKit / Mailchimp.
// Without a key it returns 501 and the form says signups open soon.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const email = String(req.body?.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Invalid email" });
  if (!process.env.BUTTONDOWN_API_KEY) return res.status(501).json({ error: "Newsletter not configured" });
  // Check Buttondown's current API docs; field names have changed between versions.
  const r = await fetch("https://api.buttondown.email/v1/subscribers", {
    method: "POST",
    headers: { Authorization: `Token ${process.env.BUTTONDOWN_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ email_address: email, tags: ["website"] })
  });
  return res.status(r.ok || r.status === 409 ? 200 : 502).json({ ok: r.ok });
}
