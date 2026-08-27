import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join } from "node:path";
import healthHandler from "../api/health.js";
import profileHandler from "../api/profile.js";
import configHandler from "../api/config.js";

const port = Number(process.env.PORT ?? process.argv[2] ?? 3000);

type LocalRequest = IncomingMessage & {
  query: Record<string, string | string[]>;
  body?: unknown;
};

type LocalResponse = ServerResponse & {
  status(statusCode: number): LocalResponse;
  json(body: unknown): void;
};

const server = createServer(async (incoming, outgoing) => {
  const request = incoming as LocalRequest;
  const response = decorateResponse(outgoing as LocalResponse);
  const parsed = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  request.query = Object.fromEntries(parsed.searchParams.entries());

  if (request.method === "POST") {
    request.body = await readJsonBody(request);
  }

  if (parsed.pathname === "/api/health") {
    healthHandler(request as never, response as never);
    return;
  }

  if (parsed.pathname === "/api/config") {
    configHandler(request as never, response as never);
    return;
  }

  if (parsed.pathname === "/api/profile") {
    await profileHandler(request as never, response as never);
    return;
  }

  if (await tryServeStatic(parsed.pathname, response)) {
    return;
  }

  response.status(404).json({
    error: {
      code: "not_found",
      message: "Route not found."
    }
  });
});

server.listen(port, () => {
  console.log(`Local API server listening on http://localhost:${port}`);
});

function decorateResponse(response: LocalResponse): LocalResponse {
  response.status = (statusCode: number) => {
    response.statusCode = statusCode;
    return response;
  };

  response.json = (body: unknown) => {
    if (!response.headersSent) {
      response.setHeader("content-type", "application/json; charset=utf-8");
    }
    response.end(JSON.stringify(body));
  };

  return response;
}

async function tryServeStatic(pathname: string, response: ServerResponse): Promise<boolean> {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  if (safePath.includes("..")) {
    return false;
  }

  const filePath = join(process.cwd(), "public", safePath);
  try {
    const details = await stat(filePath);
    if (!details.isFile()) {
      return false;
    }
  } catch {
    return false;
  }

  response.statusCode = 200;
  response.setHeader("content-type", contentType(filePath));
  createReadStream(filePath).pipe(response);
  return true;
}

function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (!body) {
    return undefined;
  }

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
