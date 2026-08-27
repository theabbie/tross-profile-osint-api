import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendJson } from "../src/http.js";
import { publicRecaptchaSiteKey, recaptchaConfigured } from "../src/recaptcha.js";

export default function handler(_request: VercelRequest, response: VercelResponse): void {
  sendJson(response, 200, {
    recaptcha: {
      required: recaptchaConfigured(),
      siteKey: publicRecaptchaSiteKey()
    }
  });
}
