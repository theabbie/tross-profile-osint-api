import { buildPeopleQuery, type ExaClient } from "./exa.js";
import { parseLinkedInProfileUrl } from "./linkedin.js";
import { mapExaToProfileResponse } from "./profileMapper.js";
import type { ProfileResponse } from "./types.js";

export async function fetchProfile(inputUrl: string, exaClient: ExaClient): Promise<ProfileResponse> {
  const parsed = parseLinkedInProfileUrl(inputUrl);
  const query = buildPeopleQuery(parsed.publicIdentifier, parsed.canonicalUrl);
  const exa = await exaClient.searchPeople(query);

  return mapExaToProfileResponse({
    inputUrl,
    canonicalUrl: parsed.canonicalUrl,
    publicIdentifier: parsed.publicIdentifier,
    exa
  });
}
