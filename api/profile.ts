import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { ExaApiClient } from "../src/exa.js";
import { allowMethods, HttpError, requestIp, sendError, sendJson } from "../src/http.js";
import { enforceRateLimit } from "../src/rateLimit.js";
import { fetchProfile } from "../src/profileService.js";

const bodySchema = z.object({
  url: z.string().min(1)
});

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  try {
    allowMethods(request, ["GET", "POST"]);
    enforceRateLimit(requestIp(request));

    const url = extractUrl(request);
    const payload = await fetchProfile(url, new ExaApiClient());
    sendJson(response, 200, payload);
  } catch (error) {
    sendError(response, normalizeError(error));
  }
}

function extractUrl(request: VercelRequest): string {
  if (request.method === "GET") {
    const value = request.query.url;
    if (typeof value !== "string") {
      throw new HttpError(400, "invalid_request", "Provide a LinkedIn profile URL in the url query parameter.");
    }
    return value;
  }

  const parsed = bodySchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_request", "POST body must be JSON with a url string.", parsed.error.flatten());
  }
  return parsed.data.url;
}

function normalizeError(error: unknown): unknown {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof Error && /LinkedIn|URL|identifier/.test(error.message)) {
    return new HttpError(400, "invalid_linkedin_url", error.message);
  }

  return error;
}
