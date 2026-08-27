import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ErrorResponse } from "./types.js";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function sendJson(response: VercelResponse, statusCode: number, body: unknown): void {
  response.status(statusCode).setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.json(body);
}

export function sendError(response: VercelResponse, error: unknown): void {
  if (error instanceof HttpError) {
    sendJson(response, error.statusCode, {
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    } satisfies ErrorResponse);
    return;
  }

  sendJson(response, 500, {
    error: {
      code: "internal_error",
      message: "Unexpected server error."
    }
  } satisfies ErrorResponse);
}

export function allowMethods(request: VercelRequest, allowed: string[]): void {
  if (!request.method || !allowed.includes(request.method)) {
    throw new HttpError(405, "method_not_allowed", `Use one of: ${allowed.join(", ")}.`);
  }
}

export function requestIp(request: VercelRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.socket.remoteAddress || "unknown";
}
