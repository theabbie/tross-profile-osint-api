const baseUrl = process.argv[2];

if (!baseUrl) {
  console.error("Usage: npm run smoke -- <base-url>");
  process.exit(1);
}

const root = baseUrl.replace(/\/$/, "");

const checks = [
  {
    name: "health",
    url: `${root}/api/health`,
    expectStatus: 200
  },
  {
    name: "config",
    url: `${root}/api/config`,
    expectStatus: 200
  },
  {
    name: "invalid url",
    url: `${root}/api/profile?url=${encodeURIComponent("https://example.com/not-linkedin")}`,
    expectStatus: 400
  }
];

for (const check of checks) {
  const response = await fetch(check.url);
  const body = await response.text();
  if (response.status !== check.expectStatus) {
    console.error(`${check.name} failed: expected ${check.expectStatus}, got ${response.status}`);
    console.error(body);
    process.exit(1);
  }
  console.log(`${check.name}: ${response.status}`);
}

console.log("Smoke checks passed.");
