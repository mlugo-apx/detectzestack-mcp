// Testable core of the DetectZeStack MCP server (extracted in 1.1.0).
// Tests: test/lib.test.ts

export const VERSION = "1.1.0";
export const USER_AGENT = `detectzestack-mcp/${VERSION}`;

export interface ProviderConfig {
  baseUrl: string;
  headers: Record<string, string>;
  name: "RapidAPI" | "API.market" | "Direct";
}

type Env = Record<string, string | undefined>;

const RAPIDAPI_LISTING = "https://rapidapi.com/mlugoapx/api/detectzestack";
const APIMARKET_LISTING = "https://api.market/store/detectzestack";
const DIRECT_SIGNUP = "https://detectzestack.com/signup";

/** Priority: RAPIDAPI_KEY > APIMARKET_KEY > DETECTZESTACK_API_KEY (unchanged from 1.0.0). */
export function resolveProvider(env: Env): ProviderConfig {
  if (env.RAPIDAPI_KEY) {
    return {
      baseUrl: "https://detectzestack.p.rapidapi.com",
      headers: {
        "X-RapidAPI-Key": env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "detectzestack.p.rapidapi.com",
      },
      name: "RapidAPI",
    };
  }
  if (env.APIMARKET_KEY) {
    return {
      baseUrl: "https://prod.api.market/api/v1/detectzestack/techstack",
      headers: { "x-api-market-key": env.APIMARKET_KEY },
      name: "API.market",
    };
  }
  if (env.DETECTZESTACK_API_KEY) {
    return {
      baseUrl: "https://detectzestack.com",
      headers: { "X-API-Key": env.DETECTZESTACK_API_KEY },
      name: "Direct",
    };
  }
  throw new Error("No API key configured");
}

/** Request headers: provider auth + Accept + a versioned User-Agent so MCP traffic is identifiable. */
export function buildHeaders(provider: ProviderConfig, hasBody: boolean): Record<string, string> {
  const h: Record<string, string> = {
    ...provider.headers,
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  };
  if (hasBody) h["Content-Type"] = "application/json";
  return h;
}

/** Where a customer of this provider can actually upgrade. */
export function upgradeUrlFor(provider: ProviderConfig): string {
  switch (provider.name) {
    case "RapidAPI":
      return `${RAPIDAPI_LISTING}/pricing`;
    case "API.market":
      return APIMARKET_LISTING;
    case "Direct":
      return "https://detectzestack.com/pricing?src=mcp";
  }
}

/** Error carrying the HTTP status and, when the API sent one, its upgrade_url. */
export class ApiError extends Error {
  constructor(message: string, public status: number, public upgradeUrl?: string) {
    super(message);
    this.name = "ApiError";
  }
}

function providerList(): string {
  return (
    `  RAPIDAPI_KEY          — ${RAPIDAPI_LISTING}\n` +
    `  APIMARKET_KEY         — ${APIMARKET_LISTING}\n` +
    `  DETECTZESTACK_API_KEY — ${DIRECT_SIGNUP}`
  );
}

export function handleError(error: unknown, provider: ProviderConfig): string {
  if (!(error instanceof Error)) return `Unexpected error: ${String(error)}`;
  const msg = error.message;
  const status = error instanceof ApiError ? error.status : 0;
  const serverUpgrade = error instanceof ApiError ? error.upgradeUrl : undefined;

  if (status === 429 || msg.includes("rate limit") || msg.includes("429")) {
    return `Rate limit exceeded. Your plan's monthly request quota has been reached. Upgrade at ${serverUpgrade || upgradeUrlFor(provider)}`;
  }
  if (status === 401 || msg.includes("unauthorized") || msg.includes("401")) {
    return `Authentication failed. Check that your API key environment variable is set correctly.\n\nSupported providers:\n${providerList()}`;
  }
  if (status === 403 || msg.includes("tier") || msg.includes("403")) {
    return `Access denied: ${msg}. This endpoint may require a higher plan tier. See ${serverUpgrade || upgradeUrlFor(provider)}`;
  }
  return `Error: ${msg}`;
}

export function missingKeyMessage(): string {
  return (
    "ERROR: No API key found. Set one of these environment variables:\n\n" +
    providerList() +
    "\n\nSet it in your MCP config:\n" +
    '  "env": { "DETECTZESTACK_API_KEY": "your-key-here" }'
  );
}
