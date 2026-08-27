import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyRecaptchaToken } from "../src/recaptcha.js";

describe("verifyRecaptchaToken", () => {
  const originalSecret = process.env.RECAPTCHA_SECRET_KEY;

  afterEach(() => {
    process.env.RECAPTCHA_SECRET_KEY = originalSecret;
    vi.unstubAllGlobals();
  });

  it("does nothing when reCAPTCHA is not configured", async () => {
    delete process.env.RECAPTCHA_SECRET_KEY;
    await expect(verifyRecaptchaToken(undefined)).resolves.toBeUndefined();
  });

  it("rejects missing tokens when configured", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret";
    await expect(verifyRecaptchaToken(undefined)).rejects.toThrow("reCAPTCHA verification is required.");
  });

  it("accepts successful verification", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          success: true,
          hostname: "tross-profile-osint.vercel.app"
        })
      }))
    );

    await expect(verifyRecaptchaToken("token", "127.0.0.1")).resolves.toBeUndefined();
  });

  it("rejects failed verification", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          success: false,
          "error-codes": ["invalid-input-response"]
        })
      }))
    );

    await expect(verifyRecaptchaToken("bad-token")).rejects.toThrow("reCAPTCHA verification failed.");
  });

  it("does not enforce a local hostname allowlist after Google accepts the token", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          success: true,
          hostname: "unexpected-host.example"
        })
      }))
    );

    await expect(verifyRecaptchaToken("token")).resolves.toBeUndefined();
  });
});
