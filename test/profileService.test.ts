import { describe, expect, it } from "vitest";
import { HttpError } from "../src/http.js";
import { fetchProfile } from "../src/profileService.js";
import type { ExaClient } from "../src/exa.js";

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
});
