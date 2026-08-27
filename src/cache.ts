import type { ProfileResponse } from "./types.js";

export const PROFILE_CACHE_NAMESPACE = "tross-profile-osint/profiles";

export type ProfileCache = {
  get(publicIdentifier: string): Promise<ProfileResponse | null>;
  set(publicIdentifier: string, response: ProfileResponse): Promise<void>;
};

export class NoopProfileCache implements ProfileCache {
  async get(): Promise<ProfileResponse | null> {
    return null;
  }

  async set(): Promise<void> {
    return;
  }
}

export function markCacheHit(response: ProfileResponse): ProfileResponse {
  return {
    ...response,
    cache: {
      hit: true,
      namespace: PROFILE_CACHE_NAMESPACE
    }
  };
}

export function markCacheMiss(response: ProfileResponse): ProfileResponse {
  return {
    ...response,
    cache: {
      hit: false,
      namespace: PROFILE_CACHE_NAMESPACE
    }
  };
}
