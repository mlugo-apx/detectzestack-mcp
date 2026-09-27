// MCP Registry metadata must stay consistent with package.json (1.1.1).
// The registry verifies ownership by matching server.json "name" to package.json "mcpName".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { VERSION } from "../src/lib.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const NAME = "io.github.mlugo-apx/detectzestack-mcp";

test("package.json declares mcpName under the GitHub namespace", () => {
  assert.equal(pkg.mcpName, NAME);
});

test("server.json exists and matches package.json", () => {
  const p = new URL("../server.json", import.meta.url);
  assert.ok(existsSync(p), "server.json missing");
  const s = JSON.parse(readFileSync(p, "utf8"));
  assert.match(s.$schema, /server\.schema\.json$/);
  assert.equal(s.name, pkg.mcpName);
  assert.equal(s.version, pkg.version);
  assert.equal(s.version, VERSION);
  assert.equal(s.repository.url, "https://github.com/mlugo-apx/detectzestack-mcp");
  assert.equal(s.packages.length, 1);
  const n = s.packages[0];
  assert.equal(n.registryType, "npm");
  assert.equal(n.identifier, pkg.name);
  assert.equal(n.version, pkg.version);
  assert.equal(n.transport.type, "stdio");
  const env = Object.fromEntries(n.environmentVariables.map((e: any) => [e.name, e]));
  for (const k of ["DETECTZESTACK_API_KEY", "RAPIDAPI_KEY", "APIMARKET_KEY"]) {
    assert.ok(env[k], `${k} not declared`);
    assert.equal(env[k].isSecret, true);
    assert.equal(env[k].isRequired, false, `${k} must not be individually required (any one of the three works)`);
  }
  assert.ok(s.description.length <= 100, "registry description max 100 chars");
});
