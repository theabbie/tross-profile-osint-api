import { describe, expect, it } from "vitest";
import { parseLinkedInProfileUrl } from "../src/linkedin.js";

describe("parseLinkedInProfileUrl", () => {
  it("canonicalizes LinkedIn /in URLs", () => {
    expect(parseLinkedInProfileUrl("linkedin.com/in/jane-doe/?trk=public_profile").canonicalUrl).toBe(
      "https://www.linkedin.com/in/jane-doe"
    );
  });

  it("rejects non-LinkedIn hosts", () => {
    expect(() => parseLinkedInProfileUrl("https://example.com/in/jane-doe")).toThrow(
      "URL must point to linkedin.com."
    );
  });

  it("rejects LinkedIn non-profile URLs", () => {
    expect(() => parseLinkedInProfileUrl("https://www.linkedin.com/company/tross")).toThrow(
      "URL must be a LinkedIn personal profile"
    );
  });

  it("rejects malformed identifiers", () => {
    expect(() => parseLinkedInProfileUrl("https://www.linkedin.com/in/-bad")).toThrow(
      "LinkedIn public profile identifier is invalid."
    );
  });
});
