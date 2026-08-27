# Tross Profile OSINT API

Hosted API for the Tross engineering challenge. It accepts a LinkedIn profile URL and returns structured professional-profile JSON using Exa People Search as the primary OSINT provider.

## Hosted API

Production URL:

```text
https://tross-profile-osint.vercel.app
```

## Approach

The challenge asks for a LinkedIn profile API. This implementation avoids credential-backed LinkedIn scraping and instead uses Exa's People Search vertical, which indexes professional profiles and can return structured person entities. The API normalizes the requested LinkedIn URL, queries Exa for that exact profile identity, ranks candidate results, and maps grounded fields into a stable response schema.

The response is intentionally partial when data is unavailable. If Exa does not return an exact LinkedIn URL match, the API returns the top available Exa person result and includes a warning that the result may not be the requested profile.

The API does not return personal emails, phone numbers, private identifiers, or unrelated sensitive enrichment fields.

The browser demo uses invisible reCAPTCHA v2. The API verifies the token server-side when `RECAPTCHA_SECRET_KEY` is configured. Successful profile results are cached in Firestore when `FIREBASE_SERVICE_ACCOUNT` is configured.

## API

### Health

```http
GET /api/health
```

Example:

```bash
curl https://tross-profile-osint.vercel.app/api/health
```

### Fetch Profile

```http
GET /api/profile?url=<linkedin-profile-url>&recaptchaToken=<token>
POST /api/profile
Content-Type: application/json

{ "url": "https://www.linkedin.com/in/example", "recaptchaToken": "<token>" }
```

Example:

```bash
curl "https://tross-profile-osint.vercel.app/api/profile?url=https%3A%2F%2Fwww.linkedin.com%2Fin%2Fexample&recaptchaToken=<token>"
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
  "cache": {
    "hit": false,
    "namespace": "tross-profile-osint/profiles"
  },
  "fetchedAt": "2026-08-27T00:00:00.000Z"
}
```

## Error Codes

- `400 invalid_request`: missing or malformed request body/query.
- `400 invalid_linkedin_url`: URL is not a LinkedIn personal profile URL.
- `403 captcha_required`, `captcha_failed`, or `captcha_hostname_mismatch`: reCAPTCHA verification did not pass.
- `422 profile_not_found`: Exa returned no results at all.
- `429 rate_limited`: too many requests from the same IP.
- `502 provider_not_configured`: `EXA_API_KEY` is not configured.
- `502 provider_error`, `provider_timeout`, or `captcha_provider_error`: upstream verification/search failed.

## Local Setup

Requirements:

- Node.js 20+
- npm
- Vercel CLI
- Exa API key
- Invisible reCAPTCHA v2 site and secret keys

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
RECAPTCHA_SITE_KEY=<your invisible v2 site key>
RECAPTCHA_SECRET_KEY=<your invisible v2 secret key>
FIREBASE_SERVICE_ACCOUNT=<service account json or base64 json>
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
vercel env add RECAPTCHA_SITE_KEY production
vercel env add RECAPTCHA_SECRET_KEY production
vercel env add FIREBASE_SERVICE_ACCOUNT production
vercel deploy --prod
```

Run production smoke checks:

```bash
npm run smoke -- https://tross-profile-osint.vercel.app
```

## Known Limitations

- OSINT coverage varies by profile and Exa's current index.
- Firestore cache returns the first successful structured response for a normalized LinkedIn public identifier until overwritten by a fresh deploy/manual cache change.
- LinkedIn fields like skills, certifications, languages, and education may be absent.
- The API does not use LinkedIn credentials or private LinkedIn APIs.
- Freshness depends on Exa's index and cache behavior.
- Some profile image URLs may expire or be unavailable.
