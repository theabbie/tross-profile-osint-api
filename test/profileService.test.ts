import { describe, expect, it } from "vitest";
import { HttpError } from "../src/http.js";
import { fetchProfile } from "../src/profileService.js";
import type { ExaClient } from "../src/exa.js";
import type { ProfileCache } from "../src/cache.js";

describe("fetchProfile", () => {
  it("queries Exa with the canonical profile identity", async () => {
    let query = "";
    const client: ExaClient = {
      async searchPeople(value) {
        query = value;
        return {
          results: [
            {
              title: "Jane Doe - Engineer",
              url: "https://www.linkedin.com/in/jane-doe",
              entities: [
                {
                  type: "person",
                  properties: {
                    name: "Jane Doe",
                    headline: "Engineer"
                  }
                }
              ]
            }
          ]
        };
      }
    };

    const response = await fetchProfile("linkedin.com/in/jane-doe?trk=foo", client);

    expect(query).toContain("https://www.linkedin.com/in/jane-doe");
    expect(response.canonicalUrl).toBe("https://www.linkedin.com/in/jane-doe");
    expect(response.profile.name).toBe("Jane Doe");
  });

  it("surfaces provider failures", async () => {
    const client: ExaClient = {
      async searchPeople() {
        throw new HttpError(502, "provider_error", "Exa search failed.");
      }
    };

    await expect(fetchProfile("linkedin.com/in/jane-doe", client)).rejects.toThrow("Exa search failed.");
  });

  it("returns cached responses without querying Exa", async () => {
    const client: ExaClient = {
      async searchPeople() {
        throw new Error("Exa should not be called on cache hit.");
      }
    };
    const cache: ProfileCache = {
      async get() {
        return {
          inputUrl: "old-input",
          canonicalUrl: "https://www.linkedin.com/in/jane-doe",
          publicIdentifier: "jane-doe",
          profile: {
            name: "Jane Doe",
            experience: [],
            education: [],
            skills: [],
            certifications: [],
            languages: [],
            images: {}
          },
          sources: [],
          warnings: [],
          provider: "exa",
          cache: {
            hit: false,
            namespace: "tross-profile-osint/profiles"
          },
          fetchedAt: "2026-08-27T00:00:00.000Z"
        };
      },
      async set() {
        throw new Error("Cache set should not be called on cache hit.");
      }
    };

    const response = await fetchProfile("linkedin.com/in/jane-doe", client, cache);

    expect(response.inputUrl).toBe("linkedin.com/in/jane-doe");
    expect(response.cache.hit).toBe(true);
    expect(response.profile.name).toBe("Jane Doe");
  });

  it("stores fresh Exa responses in cache", async () => {
    let setCalled = false;
    const client: ExaClient = {
      async searchPeople() {
        return {
          results: [
            {
              title: "Jane Doe - Engineer",
              url: "https://www.linkedin.com/in/jane-doe",
              entities: [
                {
                  type: "person",
                  properties: {
                    name: "Jane Doe",
                    headline: "Engineer"
                  }
                }
              ]
            }
          ]
        };
      }
    };
    const cache: ProfileCache = {
      async get() {
        return null;
      },
      async set(_publicIdentifier, response) {
        setCalled = true;
        expect(response.cache.hit).toBe(false);
      }
    };

    const response = await fetchProfile("linkedin.com/in/jane-doe", client, cache);

    expect(setCalled).toBe(true);
    expect(response.cache.hit).toBe(false);
  });
});
