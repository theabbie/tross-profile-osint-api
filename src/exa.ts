import { HttpError } from "./http.js";

export type ExaEntity = {
  id?: string;
  type?: string;
  version?: number;
  properties?: Record<string, unknown>;
};

export type ExaResult = {
  id?: string;
  title?: string;
  url?: string;
  image?: string;
  favicon?: string;
  highlights?: string[];
  highlightScores?: number[];
  entities?: ExaEntity[];
};

export type ExaSearchResponse = {
  requestId?: string;
  results?: ExaResult[];
  output?: {
    grounding?: Array<{
      field?: string;
      confidence?: "low" | "medium" | "high";
      citations?: Array<{ url?: string; title?: string }>;
    }>;
  };
};

export type ExaClient = {
  searchPeople(query: string): Promise<ExaSearchResponse>;
};

export class ExaApiClient implements ExaClient {
  constructor(
    private readonly apiKey = process.env.EXA_API_KEY,
    private readonly endpoint = "https://api.exa.ai/search"
  ) {}

  async searchPeople(query: string): Promise<ExaSearchResponse> {
    if (!this.apiKey) {
      throw new HttpError(502, "provider_not_configured", "EXA_API_KEY is not configured.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          query,
          category: "people",
          type: "auto",
          numResults: 5,
          contents: {
            highlights: true
          }
        })
      });

      const payload = await parseJson(response);
      if (!response.ok) {
        throw new HttpError(502, "provider_error", "Exa search failed.", {
          status: response.status,
          body: payload
        });
      }

      return payload as ExaSearchResponse;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new HttpError(502, "provider_timeout", "Exa search timed out.");
      }
      throw new HttpError(502, "provider_error", "Exa search failed.");
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function buildPeopleQuery(publicIdentifier: string, canonicalUrl: string): string {
  return [
    `LinkedIn profile ${canonicalUrl}`,
    `professional profile for LinkedIn public identifier ${publicIdentifier}`,
    "return the exact person profile if indexed"
  ].join(". ");
}
