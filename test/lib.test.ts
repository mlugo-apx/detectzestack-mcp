// Tests for src/lib.ts — the testable core of the MCP server (v1.1.0, 2026-09-27).
// Run: npm test   (node:test via tsx)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveProvider,
  buildHeaders,
  upgradeUrlFor,
  handleError,
  ApiError,
  missingKeyMessage,
  VERSION,
  USER_AGENT,
} from "../src/lib.js";

const RAPID = { RAPIDAPI_KEY: "r" };
const MARKET = { APIMARKET_KEY: "m" };
const DIRECT = { DETECTZESTACK_API_KEY: "d" };

// --- pins: existing behaviour that must not change (S1) ---

test("provider priority is RapidAPI > API.market > Direct (unchanged from 1.0.0)", () => {
  assert.equal(resolveProvider({ ...RAPID, ...MARKET, ...DIRECT }).name, "RapidAPI");
  assert.equal(resolveProvider({ ...MARKET, ...DIRECT }).name, "API.market");
  assert.equal(resolveProvider(DIRECT).name, "Direct");
});

test("base URLs and auth headers are unchanged from 1.0.0", () => {
  const r = resolveProvider(RAPID);
  assert.equal(r.baseUrl, "https://detectzestack.p.rapidapi.com");
  assert.deepEqual(r.headers, { "X-RapidAPI-Key": "r", "X-RapidAPI-Host": "detectzestack.p.rapidapi.com" });
  const m = resolveProvider(MARKET);
  assert.equal(m.baseUrl, "https://prod.api.market/api/v1/detectzestack/techstack");
  assert.deepEqual(m.headers, { "x-api-market-key": "m" });
  const d = resolveProvider(DIRECT);
  assert.equal(d.baseUrl, "https://detectzestack.com");
  assert.deepEqual(d.headers, { "X-API-Key": "d" });
});

test("resolveProvider throws when no key is configured", () => {
  assert.throws(() => resolveProvider({}), /No API key configured/);
});

// --- new behaviour ---

test("requests identify the MCP server with a versioned User-Agent", () => {
  const h = buildHeaders(resolveProvider(DIRECT), false);
  assert.equal(h["User-Agent"], `detectzestack-mcp/${VERSION}`);
  assert.equal(USER_AGENT, `detectzestack-mcp/${VERSION}`);
  assert.equal(h["X-API-Key"], "d");
  assert.equal(h.Accept, "application/json");
  assert.equal(h["Content-Type"], undefined);
  assert.equal(buildHeaders(resolveProvider(DIRECT), true)["Content-Type"], "application/json");
});

test("VERSION matches package.json", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(VERSION, pkg.version);
});

test("upgrade links go to the checkout each provider's customer can actually use", () => {
  assert.equal(upgradeUrlFor(resolveProvider(RAPID)), "https://rapidapi.com/mlugoapx/api/detectzestack/pricing");
  assert.equal(upgradeUrlFor(resolveProvider(DIRECT)), "https://detectzestack.com/pricing?src=mcp");
  assert.equal(upgradeUrlFor(resolveProvider(MARKET)), "https://api.market/store/detectzestack");
});

test("429 message prefers the upgrade_url the API returned", () => {
  const p = resolveProvider(DIRECT);
  const msg = handleError(new ApiError("rate limit exceeded", 429, "https://detectzestack.com/pricing?src=cap"), p);
  assert.match(msg, /quota/);
  assert.match(msg, /https:\/\/detectzestack\.com\/pricing\?src=cap/);
});

test("429 without a server URL falls back to the provider's upgrade link", () => {
  const msg = handleError(new ApiError("rate limit exceeded", 429), resolveProvider(RAPID));
  assert.match(msg, /rapidapi\.com\/mlugoapx\/api\/detectzestack\/pricing/);
});

test("403 tier gate names the provider's upgrade link, not RapidAPI for direct users", () => {
  const msg = handleError(new ApiError("requires pro or business tier", 403), resolveProvider(DIRECT));
  assert.match(msg, /detectzestack\.com\/pricing\?src=mcp/);
  assert.doesNotMatch(msg, /rapidapi/i);
});

test("401 lists every provider with correct links", () => {
  const msg = handleError(new ApiError("unauthorized", 401), resolveProvider(DIRECT));
  assert.match(msg, /Authentication failed/);
  assert.match(msg, /rapidapi\.com\/mlugoapx\/api\/detectzestack/);
  assert.match(msg, /detectzestack\.com\/signup/);
});

test("other errors keep the 1.0.0 shape", () => {
  assert.equal(handleError(new Error("boom"), resolveProvider(DIRECT)), "Error: boom");
  assert.equal(handleError("weird", resolveProvider(DIRECT)), "Unexpected error: weird");
});

test("missing-key message lists correct links for all three providers", () => {
  const m = missingKeyMessage();
  assert.match(m, /rapidapi\.com\/mlugoapx\/api\/detectzestack/);
  assert.match(m, /api\.market\/store\/detectzestack/);
  assert.match(m, /detectzestack\.com\/signup/);
});

test("no file ships the wrong RapidAPI owner slug", () => {
  for (const f of ["../src/index.ts", "../src/lib.ts", "../README.md", "../smithery.yaml"]) {
    const s = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(s, /rapidapi\.com\/detectzestack/, `${f} still links rapidapi.com/detectzestack`);
  }
});

test("Smithery config accepts a direct key without requiring a RapidAPI key", () => {
  const y = readFileSync(new URL("../smithery.yaml", import.meta.url), "utf8");
  assert.doesNotMatch(y, /required:\s*\n\s*-\s*rapidApiKey/);
  assert.match(y, /directApiKey/);
});
