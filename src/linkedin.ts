export type LinkedInProfileUrl = {
  inputUrl: string;
  canonicalUrl: string;
  publicIdentifier: string;
};

const LINKEDIN_HOSTS = new Set(["linkedin.com", "www.linkedin.com"]);
const RESERVED_IDENTIFIERS = new Set([
  "feed",
  "jobs",
  "company",
  "school",
  "learning",
  "sales",
  "groups",
  "pulse"
]);

export function parseLinkedInProfileUrl(input: string): LinkedInProfileUrl {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("LinkedIn profile URL is required.");
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error("Invalid URL.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!LINKEDIN_HOSTS.has(hostname)) {
    throw new Error("URL must point to linkedin.com.");
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments[0] !== "in" || !segments[1]) {
    throw new Error("URL must be a LinkedIn personal profile in /in/<identifier> format.");
  }

  const publicIdentifier = decodeURIComponent(segments[1]).trim();
  if (!isValidPublicIdentifier(publicIdentifier)) {
    throw new Error("LinkedIn public profile identifier is invalid.");
  }

  return {
    inputUrl: input,
    canonicalUrl: `https://www.linkedin.com/in/${encodeURIComponent(publicIdentifier)}`,
    publicIdentifier
  };
}

export function canonicalizeProfileUrl(input: string): string | null {
  try {
    return parseLinkedInProfileUrl(input).canonicalUrl.toLowerCase();
  } catch {
    return null;
  }
}

export function publicIdentifierFromUrl(input: string): string | null {
  try {
    return parseLinkedInProfileUrl(input).publicIdentifier.toLowerCase();
  } catch {
    return null;
  }
}

function isValidPublicIdentifier(identifier: string): boolean {
  if (identifier.length < 3 || identifier.length > 100) {
    return false;
  }

  if (RESERVED_IDENTIFIERS.has(identifier.toLowerCase())) {
    return false;
  }

  return /^[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9]$/.test(identifier);
}
