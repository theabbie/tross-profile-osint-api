import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { ExaApiClient } from "../src/exa.js";
import { allowMethods, HttpError, requestIp, sendError, sendJson } from "../src/http.js";
import { enforceRateLimit } from "../src/rateLimit.js";
import { fetchProfile } from "../src/profileService.js";
import { verifyRecaptchaToken } from "../src/recaptcha.js";

const bodySchema = z.object({
  url: z.string().min(1),
  recaptchaToken: z.string().optional()
});

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  try {
    allowMethods(request, ["GET", "POST"]);
    enforceRateLimit(requestIp(request));

    const { url, recaptchaToken } = extractRequest(request);
    await verifyRecaptchaToken(recaptchaToken, requestIp(request));
    const payload = await fetchProfile(url, new ExaApiClient());
    sendJson(response, 200, payload);
  } catch (error) {
    sendError(response, normalizeError(error));
  }
}

function extractRequest(request: VercelRequest): { url: string; recaptchaToken?: string } {
  if (request.method === "GET") {
    const value = request.query.url;
    if (typeof value !== "string") {
      throw new HttpError(400, "invalid_request", "Provide a LinkedIn profile URL in the url query parameter.");
    }
    return {
      url: value,
      recaptchaToken: queryToken(request) ?? headerToken(request)
    };
  }

  const parsed = bodySchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_request", "POST body must be JSON with a url string.", parsed.error.flatten());
  }
  return {
    url: parsed.data.url,
    recaptchaToken: parsed.data.recaptchaToken ?? headerToken(request)
  };
}

function queryToken(request: VercelRequest): string | undefined {
  const value = request.query.recaptchaToken;
  return typeof value === "string" ? value : undefined;
}

function headerToken(request: VercelRequest): string | undefined {
  const value = request.headers["x-recaptcha-token"];
  return typeof value === "string" ? value : undefined;
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
