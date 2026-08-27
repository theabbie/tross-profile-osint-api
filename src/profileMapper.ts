import { canonicalizeProfileUrl, publicIdentifierFromUrl } from "./linkedin.js";
import type { ExaResult, ExaSearchResponse } from "./exa.js";
import type {
  Confidence,
  Profile,
  ProfileEducation,
  ProfileExperience,
  ProfileResponse,
  Source
} from "./types.js";
import { HttpError } from "./http.js";

type Match = {
  result: ExaResult;
  score: number;
  reason: string;
};

type PersonProperties = Record<string, unknown>;

const EMPTY_PROFILE: Profile = {
  experience: [],
  education: [],
  skills: [],
  certifications: [],
  languages: [],
  images: {}
};

export function mapExaToProfileResponse(args: {
  inputUrl: string;
  canonicalUrl: string;
  publicIdentifier: string;
  exa: ExaSearchResponse;
  fetchedAt?: string;
}): ProfileResponse {
  const match = chooseBestResult(args.exa.results ?? [], args.canonicalUrl, args.publicIdentifier);
  if (!match) {
    throw new HttpError(422, "profile_not_found", "No usable Exa People result matched the LinkedIn profile URL.");
  }

  const person = getPersonProperties(match.result);
  const warnings: string[] = [];
  const sources: Source[] = [];
  const profile: Profile = { ...EMPTY_PROFILE, images: {} };
  const source = sourceFromResult(match.result);

  const name = firstString(person, ["name", "fullName", "full_name"]);
  if (name) {
    profile.name = name;
    sources.push(fieldSource("profile.name", source, "high"));
  } else {
    const titleName = nameFromTitle(match.result.title);
    if (titleName) {
      profile.name = titleName;
      sources.push(fieldSource("profile.name", source, "medium"));
    }
  }

  const headline = firstString(person, ["headline", "title", "currentTitle", "jobTitle"]);
  if (headline) {
    profile.headline = headline;
    sources.push(fieldSource("profile.headline", source, "high"));
  } else {
    const titleHeadline = headlineFromTitle(match.result.title);
    if (titleHeadline) {
      profile.headline = titleHeadline;
      sources.push(fieldSource("profile.headline", source, "medium"));
    }
  }

  const location = firstString(person, ["location", "geo", "region"]);
  if (location) {
    profile.location = location;
    sources.push(fieldSource("profile.location", source, "high"));
  }

  const about = firstString(person, ["about", "summary", "description", "bio"]);
  if (about) {
    profile.about = about;
    sources.push(fieldSource("profile.about", source, "medium"));
  } else {
    const highlight = firstUsableHighlight(match.result.highlights);
    if (highlight) {
      profile.about = highlight;
      sources.push(fieldSource("profile.about", source, "low"));
    }
  }

  profile.experience = mapWorkHistory(person);
  if (profile.experience.length > 0) {
    sources.push(fieldSource("profile.experience", source, "high"));
  }

  profile.education = mapEducationHistory(person);
  if (profile.education.length > 0) {
    sources.push(fieldSource("profile.education", source, "high"));
  }

  profile.skills = firstStringArray(person, ["skills", "skillNames"]);
  if (profile.skills.length > 0) {
    sources.push(fieldSource("profile.skills", source, "medium"));
  }

  profile.certifications = firstStringArray(person, ["certifications", "licenses", "licensesAndCertifications"]);
  if (profile.certifications.length > 0) {
    sources.push(fieldSource("profile.certifications", source, "medium"));
  }

  profile.languages = firstStringArray(person, ["languages"]);
  if (profile.languages.length > 0) {
    sources.push(fieldSource("profile.languages", source, "medium"));
  }

  const image = firstString(person, ["image", "profileImage", "profilePicture"]) ?? match.result.image;
  if (image) {
    profile.images.profile = image;
    sources.push(fieldSource("profile.images.profile", source, "medium"));
  }

  if (!person || Object.keys(person).length === 0) {
    warnings.push("Matched Exa result did not include structured person entity metadata; response uses result metadata and highlights only.");
  }

  for (const field of ["name", "headline", "location"] as const) {
    if (!profile[field]) {
      warnings.push(`Missing ${field}; Exa did not return a grounded value.`);
    }
  }

  if (profile.experience.length === 0) {
    warnings.push("Missing experience; Exa did not return grounded work history.");
  }

  if (profile.education.length === 0) {
    warnings.push("Missing education; Exa did not return grounded education history.");
  }

  sources.push(...groundingSources(args.exa));

  return {
    inputUrl: args.inputUrl,
    canonicalUrl: args.canonicalUrl,
    publicIdentifier: args.publicIdentifier,
    profile,
    sources: dedupeSources(sources),
    warnings,
    provider: "exa",
    fetchedAt: args.fetchedAt ?? new Date().toISOString()
  };
}

export function chooseBestResult(
  results: ExaResult[],
  canonicalUrl: string,
  publicIdentifier: string
): Match | null {
  const canonical = canonicalUrl.toLowerCase();
  const identifier = publicIdentifier.toLowerCase();

  const matches = results
    .map((result): Match => {
      const resultUrl = result.url ?? result.id ?? "";
      const resultCanonical = canonicalizeProfileUrl(resultUrl);
      const resultIdentifier = publicIdentifierFromUrl(resultUrl);
      const title = result.title?.toLowerCase() ?? "";

      if (resultCanonical === canonical) {
        return { result, score: 100, reason: "exact_url" };
      }

      if (resultIdentifier === identifier) {
        return { result, score: 90, reason: "identifier_match" };
      }

      if (resultUrl.toLowerCase().includes(`/in/${identifier}`)) {
        return { result, score: 80, reason: "url_contains_identifier" };
      }

      if (title.includes(identifier.replaceAll("-", " "))) {
        return { result, score: 50, reason: "title_contains_identifier" };
      }

      return { result, score: 0, reason: "no_match" };
    })
    .filter((match) => match.score >= 50)
    .sort((a, b) => b.score - a.score);

  return matches[0] ?? null;
}

function getPersonProperties(result: ExaResult): PersonProperties | null {
  const entity = result.entities?.find((candidate) => candidate.type === "person");
  return entity?.properties ?? null;
}

function mapWorkHistory(person: PersonProperties | null): ProfileExperience[] {
  const history = arrayValue(person, ["workHistory", "experience", "positions"]);
  return history
    .map((item) => objectValue(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const company = objectValue(item.company);
      const dates = objectValue(item.dates);
      return compactObject({
        title: stringValue(item.title),
        company: stringValue(company?.name) ?? stringValue(item.companyName) ?? stringValue(item.company),
        location: stringValue(item.location),
        startDate: stringValue(dates?.from) ?? stringValue(item.startDate),
        endDate: stringValue(dates?.to) ?? stringValue(item.endDate) ?? null
      });
    })
    .filter((item) => Object.keys(item).length > 0);
}

function mapEducationHistory(person: PersonProperties | null): ProfileEducation[] {
  const history = arrayValue(person, ["educationHistory", "education", "schools"]);
  return history
    .map((item) => objectValue(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const institution = objectValue(item.institution) ?? objectValue(item.school);
      const dates = objectValue(item.dates);
      return compactObject({
        institution: stringValue(institution?.name) ?? stringValue(item.institutionName) ?? stringValue(item.schoolName),
        degree: stringValue(item.degree),
        field: stringValue(item.field) ?? stringValue(item.fieldOfStudy),
        startDate: stringValue(dates?.from) ?? stringValue(item.startDate),
        endDate: stringValue(dates?.to) ?? stringValue(item.endDate) ?? null
      });
    })
    .filter((item) => Object.keys(item).length > 0);
}

function firstString(person: PersonProperties | null, keys: string[]): string | undefined {
  if (!person) {
    return undefined;
  }
  for (const key of keys) {
    const value = stringValue(person[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function firstStringArray(person: PersonProperties | null, keys: string[]): string[] {
  if (!person) {
    return [];
  }
  for (const key of keys) {
    const value = person[key];
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }
          const object = objectValue(item);
          return stringValue(object?.name) ?? stringValue(object?.title);
        })
        .filter((item): item is string => Boolean(item));
    }
  }
  return [];
}

function arrayValue(person: PersonProperties | null, keys: string[]): unknown[] {
  if (!person) {
    return [];
  }
  for (const key of keys) {
    const value = person[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function objectValue(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function compactObject<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== "")
  ) as T;
}

function sourceFromResult(result: ExaResult): { url: string; title?: string } {
  return {
    url: result.url ?? result.id ?? "unknown",
    title: result.title
  };
}

function fieldSource(
  field: string,
  source: { url: string; title?: string },
  confidence: Confidence
): Source {
  return {
    field,
    url: source.url,
    title: source.title,
    confidence
  };
}

function groundingSources(exa: ExaSearchResponse): Source[] {
  return (
    exa.output?.grounding?.flatMap((grounding) =>
      (grounding.citations ?? [])
        .filter((citation) => citation.url)
        .map((citation) => ({
          field: grounding.field ?? "profile",
          url: citation.url as string,
          title: citation.title,
          confidence: grounding.confidence ?? "medium"
        }))
    ) ?? []
  );
}

function dedupeSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.field}|${source.url}|${source.confidence}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function nameFromTitle(title?: string): string | undefined {
  if (!title) {
    return undefined;
  }
  const [name] = title.split(" - ");
  return name?.trim() || undefined;
}

function headlineFromTitle(title?: string): string | undefined {
  if (!title) {
    return undefined;
  }
  const [, ...rest] = title.split(" - ");
  return rest.join(" - ").trim() || undefined;
}

function firstUsableHighlight(highlights?: string[]): string | undefined {
  return highlights?.find((highlight) => highlight.trim().length > 20)?.trim();
}
