import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { tokenFromRequest, userForToken } from "./auth";
import type { Ctx, Env } from "./env";
import { buildServer } from "./server";
import { kvBucket } from "./kvstore";
import { handleSetup, withSavedKeys } from "./setup";
import { handleFile, handleUpload } from "./storage";

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export default {
  async fetch(req: Request, baseEnv: Env, ectx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    let env: Env = baseEnv.FILES ? baseEnv : { ...baseEnv, FILES: kvBucket(baseEnv.STORE!) };
    const p = url.pathname;

    if (p === "/" || p === "/health") {
      return new Response("naxsh-media-mcp ok", { headers: SECURITY_HEADERS });
    }
    if (p.startsWith("/f/")) return handleFile(req, env, url);
    if (p.startsWith("/u/")) return handleUpload(req, env, url);
    if (p.startsWith("/setup/")) return handleSetup(req, env, url);

    if (p === "/mcp" || p.startsWith("/mcp/")) {
      const user = userForToken(env, tokenFromRequest(req, url));
      if (!user) {
        // Small delay makes token guessing slower.
        await new Promise((r) => setTimeout(r, 400));
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json", ...SECURITY_HEADERS },
        });
      }
      env = await withSavedKeys(env);
      const ctx: Ctx = { env, user, origin: url.origin, waitUntil: (pr) => ectx.waitUntil(pr) };
      const server = buildServer(ctx);
      // Stateless: a fresh server + transport per request. All state lives in R2.
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      const res = await transport.handleRequest(req);
      ectx.waitUntil(transport.close().catch(() => {}));
      return res;
    }

    return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
  },
} satisfies ExportedHandler<Env>;
