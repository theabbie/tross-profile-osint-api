import { createSign } from "node:crypto";
import { PROFILE_CACHE_NAMESPACE, type ProfileCache } from "./cache.js";
import type { ProfileResponse } from "./types.js";

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

type FirestoreDocument = {
  name?: string;
  fields?: {
    cacheVersion?: { stringValue?: string };
    response?: { stringValue?: string };
  };
};

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

const COLLECTION = "tross_profile_osint_cache";
const CACHE_VERSION = "exa-contents-v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const tokenCacheByClient = new Map<string, TokenCache>();

export class FirestoreProfileCache implements ProfileCache {
  constructor(private readonly serviceAccount = parseServiceAccount()) {}

  async get(publicIdentifier: string): Promise<ProfileResponse | null> {
    const response = await fetch(this.documentUrl(publicIdentifier), {
      headers: {
        authorization: `Bearer ${await this.accessToken()}`
      }
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Firestore cache read failed with status ${response.status}.`);
    }

    const document = (await response.json()) as FirestoreDocument;
    if (document.fields?.cacheVersion?.stringValue !== CACHE_VERSION) {
      return null;
    }

    const raw = document.fields?.response?.stringValue;
    return raw ? (JSON.parse(raw) as ProfileResponse) : null;
  }

  async set(publicIdentifier: string, profileResponse: ProfileResponse): Promise<void> {
    const response = await fetch(this.documentUrl(publicIdentifier), {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${await this.accessToken()}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        fields: {
          namespace: { stringValue: PROFILE_CACHE_NAMESPACE },
          cacheVersion: { stringValue: CACHE_VERSION },
          publicIdentifier: { stringValue: publicIdentifier.toLowerCase() },
          canonicalUrl: { stringValue: profileResponse.canonicalUrl },
          response: { stringValue: JSON.stringify(profileResponse) },
          updatedAt: { timestampValue: new Date().toISOString() }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Firestore cache write failed with status ${response.status}.`);
    }
  }

  private documentUrl(publicIdentifier: string): string {
    const project = encodeURIComponent(this.serviceAccount.project_id);
    const document = encodeURIComponent(publicIdentifier.toLowerCase());
    return `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${COLLECTION}/${document}`;
  }

  private async accessToken(): Promise<string> {
    const cached = tokenCacheByClient.get(this.serviceAccount.client_email);
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.accessToken;
    }

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: signJwt(this.serviceAccount)
      })
    });

    const payload = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };
    if (!response.ok || !payload.access_token) {
      throw new Error(`Firestore auth failed: ${payload.error ?? response.status}`);
    }

    tokenCacheByClient.set(this.serviceAccount.client_email, {
      accessToken: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000
    });
    return payload.access_token;
  }
}

export function firestoreCacheConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT?.trim());
}

export function createFirestoreCache(): ProfileCache | null {
  if (!firestoreCacheConfigured()) {
    return null;
  }
  return new FirestoreProfileCache();
}

function parseServiceAccount(): FirebaseServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured.");
  }

  const decoded = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const parsed = JSON.parse(decoded) as Partial<FirebaseServiceAccount>;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT must include project_id, client_email, and private_key.");
  }

  return {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, "\n")
  };
}

function signJwt(serviceAccount: FirebaseServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: FIRESTORE_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600
    })
  );
  const unsigned = `${header}.${claim}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(serviceAccount.private_key);
  return `${unsigned}.${base64Url(signature)}`;
}

function base64Url(value: string | Buffer): string {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
