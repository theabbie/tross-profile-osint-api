import { describe, expect, it } from "vitest";
import { chooseBestResult, mapExaToProfileResponse } from "../src/profileMapper.js";
import type { ExaSearchResponse } from "../src/exa.js";

const exaFixture: ExaSearchResponse = {
  results: [
    {
      title: "Wrong Person - Engineer",
      url: "https://www.linkedin.com/in/wrong-person",
      entities: [
        {
          type: "person",
          properties: {
            name: "Wrong Person"
          }
        }
      ]
    },
    {
      title: "Jane Doe - VP Engineering",
      url: "https://www.linkedin.com/in/jane-doe",
      image: "https://example.com/jane.jpg",
      highlights: ["Jane Doe leads platform engineering teams and has worked on developer infrastructure."],
      entities: [
        {
          id: "person_123",
          type: "person",
          version: 1,
          properties: {
            name: "Jane Doe",
            headline: "VP Engineering",
            location: "San Francisco, California, United States",
            workHistory: [
              {
                title: "VP Engineering",
                location: "San Francisco, California, United States",
                dates: { from: "2022-01-01", to: null },
                company: { id: "company_123", name: "Example AI" }
              }
            ],
            educationHistory: [
              {
                degree: "BS Computer Science",
                dates: { from: "2010", to: "2014" },
                institution: { id: null, name: "Stanford University" }
              }
            ],
            skills: ["Engineering Leadership", "Platform Engineering"],
            languages: ["English"]
          }
        }
      ]
    }
  ],
  output: {
    grounding: [
      {
        field: "profile.name",
        confidence: "high",
        citations: [{ url: "https://www.linkedin.com/in/jane-doe", title: "Jane Doe - VP Engineering" }]
      }
    ]
  }
};

describe("chooseBestResult", () => {
  it("prefers exact LinkedIn URL matches", () => {
    const match = chooseBestResult(
      exaFixture.results ?? [],
      "https://www.linkedin.com/in/jane-doe",
      "jane-doe"
    );

    expect(match?.reason).toBe("exact_url");
    expect(match?.result.url).toBe("https://www.linkedin.com/in/jane-doe");
  });
});

describe("mapExaToProfileResponse", () => {
  it("maps structured person entity data into the public response schema", () => {
    const response = mapExaToProfileResponse({
      inputUrl: "linkedin.com/in/jane-doe",
      canonicalUrl: "https://www.linkedin.com/in/jane-doe",
      publicIdentifier: "jane-doe",
      exa: exaFixture,
      fetchedAt: "2026-08-27T00:00:00.000Z"
    });

    expect(response.provider).toBe("exa");
    expect(response.profile.name).toBe("Jane Doe");
    expect(response.profile.headline).toBe("VP Engineering");
    expect(response.profile.location).toBe("San Francisco, California, United States");
    expect(response.profile.experience).toEqual([
      {
        title: "VP Engineering",
        company: "Example AI",
        location: "San Francisco, California, United States",
        startDate: "2022-01-01",
        endDate: null
      }
    ]);
    expect(response.profile.education[0]?.institution).toBe("Stanford University");
    expect(response.profile.skills).toContain("Engineering Leadership");
    expect(response.profile.images.profile).toBe("https://example.com/jane.jpg");
    expect(response.cache).toEqual({
      hit: false,
      namespace: "tross-profile-osint/profiles"
    });
    expect(response.sources.some((source) => source.field === "profile.name")).toBe(true);
    expect(response.warnings).toEqual([]);
  });

  it("returns partial data with warnings for unstructured matches", () => {
    const response = mapExaToProfileResponse({
      inputUrl: "linkedin.com/in/jane-doe",
      canonicalUrl: "https://www.linkedin.com/in/jane-doe",
      publicIdentifier: "jane-doe",
      exa: {
        results: [
          {
            title: "Jane Doe - Staff Engineer",
            url: "https://www.linkedin.com/in/jane-doe",
            highlights: ["Jane Doe is a staff engineer focused on search infrastructure and data systems."]
          }
        ]
      },
      fetchedAt: "2026-08-27T00:00:00.000Z"
    });

    expect(response.profile.name).toBe("Jane Doe");
    expect(response.profile.headline).toBe("Staff Engineer");
    expect(response.profile.about).toContain("search infrastructure");
    expect(response.warnings).toContain(
      "Matched Exa result did not include structured person entity metadata; response uses result metadata and highlights only."
    );
    expect(response.warnings).toContain("Missing location; Exa did not return a grounded value.");
  });

  it("throws 422 when no result matches the requested profile", () => {
    expect(() =>
      mapExaToProfileResponse({
        inputUrl: "linkedin.com/in/jane-doe",
        canonicalUrl: "https://www.linkedin.com/in/jane-doe",
        publicIdentifier: "jane-doe",
        exa: {
          results: [
            {
              title: "Someone Else - Engineer",
              url: "https://www.linkedin.com/in/someone-else"
            }
          ]
        }
      })
    ).toThrow("No usable Exa People result matched");
  });
});
