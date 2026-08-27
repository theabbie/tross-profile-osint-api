import { buildPeopleQuery, type ExaClient } from "./exa.js";
import { parseLinkedInProfileUrl } from "./linkedin.js";
import { mapExaToProfileResponse } from "./profileMapper.js";
import type { ProfileResponse } from "./types.js";
import { markCacheHit, markCacheMiss, type ProfileCache } from "./cache.js";
import { enrichWithFetchedLinkedInContent } from "./fetchEnrichment.js";

export async function fetchProfile(
  inputUrl: string,
  exaClient: ExaClient,
  cache?: ProfileCache | null
): Promise<ProfileResponse> {
  const parsed = parseLinkedInProfileUrl(inputUrl);
  const cacheWarnings: string[] = [];
  const cached = await readCache(cache, parsed.publicIdentifier, cacheWarnings);
  if (cached) {
    return markCacheHit({
      ...cached,
      inputUrl,
      warnings: [...cached.warnings, ...cacheWarnings]
    });
  }

  const query = buildPeopleQuery(parsed.publicIdentifier, parsed.canonicalUrl);
  const [exa, contents] = await Promise.all([
    exaClient.searchPeople(query),
    fetchLinkedInContents(exaClient, parsed.canonicalUrl, cacheWarnings)
  ]);

  const response = markCacheMiss(
    enrichWithFetchedLinkedInContent(
      mapExaToProfileResponse({
        inputUrl,
        canonicalUrl: parsed.canonicalUrl,
        publicIdentifier: parsed.publicIdentifier,
        exa
      }),
      contents?.results?.[0],
      parsed.canonicalUrl
    )
  );

  await writeCache(cache, parsed.publicIdentifier, response);
  response.warnings.push(...cacheWarnings);
  return response;
}

async function fetchLinkedInContents(
  exaClient: ExaClient,
  canonicalUrl: string,
  warnings: string[]
) {
  try {
    return await exaClient.fetchContents(canonicalUrl);
  } catch {
    warnings.push("Exa web fetch failed; response uses People Search results only.");
    return null;
  }
}

async function readCache(
  cache: ProfileCache | null | undefined,
  publicIdentifier: string,
  warnings: string[]
): Promise<ProfileResponse | null> {
  if (!cache) {
    return null;
  }

  try {
    return await cache.get(publicIdentifier);
  } catch {
    warnings.push("Firestore cache read failed; fetched a fresh provider result.");
    return null;
  }
}

async function writeCache(
  cache: ProfileCache | null | undefined,
  publicIdentifier: string,
  response: ProfileResponse
): Promise<void> {
  if (!cache) {
    return;
  }

  try {
    await cache.set(publicIdentifier, response);
  } catch {
    response.warnings.push("Firestore cache write failed; response was not cached.");
  }
}
