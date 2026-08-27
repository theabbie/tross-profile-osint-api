# Tross Profile OSINT API

Hosted API for the Tross engineering challenge. It accepts a LinkedIn profile URL and returns structured professional-profile JSON using Exa People Search as the primary OSINT provider.

## Hosted API

Production URL:

```text
https://tross-profile-osint-api.vercel.app
```

## Approach

The challenge asks for a LinkedIn profile API. This implementation avoids credential-backed LinkedIn scraping and instead uses Exa's People Search vertical, which indexes professional profiles and can return structured person entities. The API normalizes the requested LinkedIn URL, queries Exa for that exact profile identity, ranks candidate results, and maps grounded fields into a stable response schema.

The response is intentionally partial when data is unavailable. Missing fields are reported in `warnings` rather than fabricated.

The API does not return personal emails, phone numbers, private identifiers, or unrelated sensitive enrichment fields.

## API

### Health

```http
GET /api/health
```

Example:

```bash
curl https://tross-profile-osint-api.vercel.app/api/health
```

### Fetch Profile

```http
GET /api/profile?url=<linkedin-profile-url>
POST /api/profile
Content-Type: application/json

{ "url": "https://www.linkedin.com/in/example" }
```

Example:

```bash
curl "https://tross-profile-osint-api.vercel.app/api/profile?url=https%3A%2F%2Fwww.linkedin.com%2Fin%2Fexample"
```

Example response:

```json
{
  "inputUrl": "https://www.linkedin.com/in/example",
  "canonicalUrl": "https://www.linkedin.com/in/example",
  "publicIdentifier": "example",
  "profile": {
    "name": "Example Person",
    "headline": "Engineering Leader",
    "location": "San Francisco, California, United States",
    "about": "Grounded excerpt when available.",
    "experience": [
      {
        "title": "VP Engineering",
        "company": "Example AI",
        "location": "San Francisco, California, United States",
        "startDate": "2022-01-01",
        "endDate": null
      }
    ],
    "education": [
      {
        "institution": "Stanford University",
        "degree": "BS Computer Science",
        "startDate": "2010",
        "endDate": "2014"
      }
    ],
    "skills": ["Engineering Leadership"],
    "certifications": [],
    "languages": ["English"],
    "images": {
      "profile": "https://example.com/profile.jpg"
    }
  },
  "sources": [
    {
      "field": "profile.name",
      "url": "https://www.linkedin.com/in/example",
      "title": "Example Person - Engineering Leader",
      "confidence": "high"
    }
  ],
  "warnings": [],
  "provider": "exa",
  "fetchedAt": "2026-08-27T00:00:00.000Z"
}
```

## Error Codes

- `400 invalid_request`: missing or malformed request body/query.
- `400 invalid_linkedin_url`: URL is not a LinkedIn personal profile URL.
- `422 profile_not_found`: Exa returned no usable match for the profile.
- `429 rate_limited`: too many requests from the same IP.
- `502 provider_not_configured`: `EXA_API_KEY` is not configured.
- `502 provider_error` or `provider_timeout`: Exa request failed.

## Local Setup

Requirements:

- Node.js 20+
- npm
- Vercel CLI
- Exa API key

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Set:

```text
EXA_API_KEY=<your key>
```

Run locally:

```bash
npm run dev
```

Validate:

```bash
npm test
npm run lint
npm run typecheck
npm run smoke -- http://localhost:3000
```

## Deployment

Create the Vercel project and configure the secret:

```bash
vercel link
vercel env add EXA_API_KEY production
vercel deploy --prod
```

Run production smoke checks:

```bash
npm run smoke -- https://tross-profile-osint-api.vercel.app
```

## Known Limitations

- OSINT coverage varies by profile and Exa's current index.
- LinkedIn fields like skills, certifications, languages, and education may be absent.
- The API does not use LinkedIn credentials or private LinkedIn APIs.
- Freshness depends on Exa's index and cache behavior.
- Some profile image URLs may expire or be unavailable.
