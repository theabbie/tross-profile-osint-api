import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendJson } from "../src/http.js";

export default function handler(_request: VercelRequest, response: VercelResponse): void {
  sendJson(response, 200, {
    ok: true,
    service: "tross-profile-osint-api",
    providerConfigured: Boolean(process.env.EXA_API_KEY),
    timestamp: new Date().toISOString()
  });
}
