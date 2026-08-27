import { HttpError } from "./http.js";

type RecaptchaVerifyResponse = {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
};

export function recaptchaConfigured(): boolean {
  return Boolean(process.env.RECAPTCHA_SECRET_KEY?.trim());
}

export function publicRecaptchaSiteKey(): string | null {
  return process.env.RECAPTCHA_SITE_KEY?.trim() ?? null;
}

export async function verifyRecaptchaToken(token: string | undefined, remoteIp?: string): Promise<void> {
  const secret = process.env.RECAPTCHA_SECRET_KEY?.trim();
  if (!secret) {
    return;
  }

  if (!token) {
    throw new HttpError(403, "captcha_required", "reCAPTCHA verification is required.");
  }

  const form = new URLSearchParams({
    secret,
    response: token
  });

  if (remoteIp && remoteIp !== "unknown") {
    form.set("remoteip", remoteIp);
  }

  let payload: RecaptchaVerifyResponse;
  try {
    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: form
    });
    payload = (await response.json()) as RecaptchaVerifyResponse;
  } catch {
    throw new HttpError(502, "captcha_provider_error", "Could not verify reCAPTCHA token.");
  }

  if (!payload.success) {
    throw new HttpError(403, "captcha_failed", "reCAPTCHA verification failed.", {
      codes: payload["error-codes"] ?? []
    });
  }

}
