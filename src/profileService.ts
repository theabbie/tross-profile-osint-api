import { buildPeopleQuery, type ExaClient } from "./exa.js";
import { parseLinkedInProfileUrl } from "./linkedin.js";
import { mapExaToProfileResponse } from "./profileMapper.js";
import type { ProfileResponse } from "./types.js";
import { markCacheHit, markCacheMiss, type ProfileCache } from "./cache.js";

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
  const exa = await exaClient.searchPeople(query);

  const response = markCacheMiss(mapExaToProfileResponse({
    inputUrl,
    canonicalUrl: parsed.canonicalUrl,
    publicIdentifier: parsed.publicIdentifier,
    exa
  }));

  await writeCache(cache, parsed.publicIdentifier, response);
  response.warnings.push(...cacheWarnings);
  return response;
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
