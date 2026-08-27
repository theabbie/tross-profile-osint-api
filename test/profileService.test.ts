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
      },
      async fetchContents() {
        return { results: [] };
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
      },
      async fetchContents() {
        return { results: [] };
      }
    };

    await expect(fetchProfile("linkedin.com/in/jane-doe", client)).rejects.toThrow("Exa search failed.");
  });

  it("returns cached responses without querying Exa", async () => {
    const client: ExaClient = {
      async searchPeople() {
        throw new Error("Exa should not be called on cache hit.");
      },
      async fetchContents() {
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
      },
      async fetchContents() {
        return { results: [] };
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

  it("enriches and caches exact LinkedIn markdown fetched through Exa contents", async () => {
    let cachedName = "";
    const client: ExaClient = {
      async searchPeople() {
        return {
          results: [
            {
              title: "Wrong Person - Engineer",
              url: "https://www.linkedin.com/in/wrong-person",
              entities: [
                {
                  type: "person",
                  properties: {
                    name: "Wrong Person",
                    headline: "Engineer"
                  }
                }
              ]
            }
          ]
        };
      },
      async fetchContents() {
        return {
          results: [
            {
              title: "Abhishek Choudhary",
              url: "https://www.linkedin.com/in/theabbie",
              text: [
                "# Abhishek Choudhary",
                "MTS @ Athenahealth",
                "Navi Mumbai, Maharashtra, India (IN)",
                "## About",
                "Hi, I am Abhishek",
                "## Experience",
                "### Member of Technical Staff - [athenahealth](https://www.linkedin.com/company/athenahealth) (Current)",
                "Jul 2025 - Present in Pune, Maharashtra, India",
                "## Education",
                "### Bachelor of Engineering - BE, Computer Engineering at [Fr. CRIT](https://www.linkedin.com/school/example)",
                "2019 - 2023 in India",
                "## Licenses & Certifications",
                "### Meta Hackercup 2023 Round 2 by [Meta](https://linkedin.com/company/meta)",
                "account aggregator • api development • spring boot • typescript",
                "English - Full professional proficiency"
              ].join("\n")
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
        cachedName = response.profile.name ?? "";
      }
    };

    const response = await fetchProfile("https://www.linkedin.com/in/theabbie", client, cache);

    expect(response.profile.name).toBe("Abhishek Choudhary");
    expect(response.profile.headline).toBe("MTS @ Athenahealth");
    expect(response.profile.location).toBe("Navi Mumbai, Maharashtra, India");
    expect(response.profile.experience[0]?.company).toBe("athenahealth");
    expect(response.profile.skills).toContain("spring boot");
    expect(response.profile.languages).toContain("English - Full professional proficiency");
    expect(response.warnings.some((warning) => warning.startsWith("No exact Exa People match was found"))).toBe(false);
    expect(cachedName).toBe("Abhishek Choudhary");
  });
});
