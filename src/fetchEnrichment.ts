import { canonicalizeProfileUrl } from "./linkedin.js";
import type { ExaContentsResult } from "./exa.js";
import type { ProfileEducation, ProfileExperience, ProfileResponse } from "./types.js";

export function enrichWithFetchedLinkedInContent(
  response: ProfileResponse,
  fetched: ExaContentsResult | undefined,
  canonicalUrl: string
): ProfileResponse {
  if (!fetched?.text || canonicalizeProfileUrl(fetched.url ?? "") !== canonicalUrl.toLowerCase()) {
    return response;
  }

  const parsed = parseLinkedInMarkdown([fetched.text, ...(fetched.highlights ?? [])].join("\n"), fetched.title);
  const source = {
    field: "profile",
    url: fetched.url ?? canonicalUrl,
    title: fetched.title,
    confidence: "high" as const
  };

  return {
    ...response,
    profile: {
      ...response.profile,
      name: parsed.name ?? response.profile.name,
      headline: parsed.headline ?? response.profile.headline,
      location: parsed.location ?? response.profile.location,
      about: parsed.about ?? response.profile.about,
      experience: parsed.experience.length > 0 ? parsed.experience : response.profile.experience,
      education: parsed.education.length > 0 ? parsed.education : response.profile.education,
      skills: parsed.skills.length > 0 ? parsed.skills : response.profile.skills,
      certifications: parsed.certifications.length > 0 ? parsed.certifications : response.profile.certifications,
      languages: parsed.languages.length > 0 ? parsed.languages : response.profile.languages
    },
    sources: dedupeSources([
      source,
      ...response.sources,
      ...fieldSources(fetched.url ?? canonicalUrl, fetched.title, parsed)
    ]),
    warnings: response.warnings.filter(
      (warning) =>
        !warning.startsWith("No exact Exa People match was found") &&
        !warning.startsWith("Missing headline") &&
        !warning.startsWith("Missing location") &&
        !warning.startsWith("Missing experience") &&
        !warning.startsWith("Missing education")
    )
  };
}

function parseLinkedInMarkdown(text: string, title?: string) {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  const name = stripMarkdown(lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/u, "")) ?? title;
  const nameIndex = lines.findIndex((line) => line.startsWith("# "));
  const headline = nameIndex >= 0 ? stripMarkdown(lines[nameIndex + 1]) : undefined;
  const location = nameIndex >= 0 ? stripMarkdown(lines[nameIndex + 2]) : undefined;
  const about = cleanSection(sectionBetween(lines, "## About", "## Experience").join("\n"));

  return {
    name,
    headline,
    location: location?.replace(/\s+\([A-Z]{2}\)$/u, ""),
    about,
    experience: parseExperience(sectionBetween(lines, "## Experience", "##")),
    education: parseEducation(sectionBetween(lines, "## Education", "## Licenses & Certifications")),
    certifications: parseCertifications(sectionBetween(lines, "## Licenses & Certifications", "##")),
    skills: parseSkills(lines),
    languages: parseLanguages(lines)
  };
}

function parseExperience(lines: string[]): ProfileExperience[] {
  const items: ProfileExperience[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line?.startsWith("### ")) {
      continue;
    }

    const heading = stripMarkdown(line.replace(/^###\s+/u, "")) ?? "";
    const [titlePart, companyPart] = heading.split(/\s+-\s+/u);
    const dateLine = lines.slice(index + 1, index + 5).find((candidate) => /\d{4}|Present|Current/u.test(candidate));
    const { startDate, endDate, location } = parseDateLocation(dateLine);

    items.push(compact({
      title: titlePart,
      company: companyPart?.replace(/\s+\(Current\)$/u, ""),
      startDate,
      endDate,
      location
    }));
  }
  return items;
}

function parseEducation(lines: string[]): ProfileEducation[] {
  const items: ProfileEducation[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line?.startsWith("### ")) {
      continue;
    }

    const heading = stripMarkdown(line.replace(/^###\s+/u, "")) ?? "";
    const [degree, institution] = heading.split(/\s+at\s+/iu);
    const dateLine = lines.slice(index + 1, index + 4).find((candidate) => /\d{4}/u.test(candidate));
    const { startDate, endDate, location } = parseDateLocation(dateLine);

    items.push(compact({
      institution,
      degree,
      startDate,
      endDate,
      field: location
    }));
  }
  return items;
}

function parseCertifications(lines: string[]): string[] {
  return lines
    .filter((line) => line.startsWith("### "))
    .map((line) => stripMarkdown(line.replace(/^###\s+/u, "")))
    .filter((line): line is string => Boolean(line));
}

function parseSkills(lines: string[]): string[] {
  const skillLine = [...lines].reverse().find((line) => line.includes(" • "));
  if (!skillLine) {
    return [];
  }
  return skillLine
    .split(" • ")
    .map((skill) => skill.trim())
    .filter(Boolean)
    .slice(0, 80);
}

function parseLanguages(lines: string[]): string[] {
  return lines
    .filter((line) => /^[A-Za-z ]+ - .+proficiency$/iu.test(line))
    .map((line) => stripMarkdown(line))
    .filter((line): line is string => Boolean(line));
}

function parseDateLocation(line?: string): { startDate?: string; endDate?: string | null; location?: string } {
  if (!line) {
    return {};
  }

  const cleaned = stripMarkdown(line) ?? "";
  const [datePart, locationPart] = cleaned.split(/\s+in\s+/u);
  const [startDate, endDate] = datePart.split(/\s+-\s+/u);
  return compact({
    startDate,
    endDate: endDate?.startsWith("Present") ? null : endDate,
    location: locationPart
  });
}

function sectionBetween(lines: string[], startHeading: string, endHeading: string): string[] {
  const start = lines.findIndex((line) => line === startHeading);
  if (start < 0) {
    return [];
  }

  const end = lines.findIndex((line, index) => index > start && isEndHeading(line, endHeading));
  return lines.slice(start + 1, end > start ? end : undefined);
}

function isEndHeading(line: string, endHeading: string): boolean {
  if (endHeading === "##") {
    return /^##(?!#)/u.test(line);
  }
  return line === endHeading;
}

function cleanSection(lines: string): string | undefined {
  const cleaned = stripMarkdown(lines.replace(/Show less/giu, "").trim());
  return cleaned || undefined;
}

function stripMarkdown(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/#{1,6}\s*/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== "")
  ) as T;
}

function fieldSources(url: string, title: string | undefined, parsed: ReturnType<typeof parseLinkedInMarkdown>) {
  const fields: string[] = [];
  if (parsed.name) fields.push("profile.name");
  if (parsed.headline) fields.push("profile.headline");
  if (parsed.location) fields.push("profile.location");
  if (parsed.about) fields.push("profile.about");
  if (parsed.experience.length > 0) fields.push("profile.experience");
  if (parsed.education.length > 0) fields.push("profile.education");
  if (parsed.certifications.length > 0) fields.push("profile.certifications");
  if (parsed.skills.length > 0) fields.push("profile.skills");
  if (parsed.languages.length > 0) fields.push("profile.languages");
  return fields.map((field) => ({ field, url, title, confidence: "high" as const }));
}

function dedupeSources<T extends { field: string; url: string; confidence: string }>(sources: T[]): T[] {
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
