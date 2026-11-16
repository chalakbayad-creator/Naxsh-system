import { userForToken } from "./auth";
import type { Ctx, Env } from "./env";
import { getCredits } from "./kie";
import { listJobs } from "./log";
import { withSavedKeys } from "./setup";
import html from "./dashboard.html";

/**
 * /dashboard/<token>      → the page
 * /api/dashboard/<token>  → its data
 * Admins see every user plus the live Kie balance; others see only their own jobs.
 */
export async function handleDashboard(req: Request, baseEnv: Env, url: URL): Promise<Response> {
  const parts = url.pathname.split("/").filter(Boolean);
  const isApi = parts[0] === "api";
  const token = isApi ? parts[2] : parts[1];
  const user = userForToken(baseEnv, token);
  if (!user) {
    await new Promise((r) => setTimeout(r, 400));
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isApi) {
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
        "x-robots-tag": "noindex",
        "content-security-policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'",
      },
    });
  }

  const env = await withSavedKeys(baseEnv);
  const jobs = await listJobs(env, user.admin ? undefined : user.name);
  let balance: number | null = null;
  if (user.admin) {
    const ctx = { env, user, origin: url.origin, waitUntil: () => {} } as Ctx;
    balance = await getCredits(ctx);
  }
  const users = (env.ACCESS_TOKENS ?? "")
    .split(",")
    .map((e) => e.split(":")[0].trim())
    .filter(Boolean);
  return Response.json(
    {
      me: { name: user.name, admin: user.admin },
      users: user.admin ? users : [user.name],
      balance,
      credits_per_usd: Number(env.CREDITS_PER_USD ?? "200"),
      generated: new Date().toISOString(),
      jobs,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
