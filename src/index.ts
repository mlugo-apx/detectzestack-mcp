#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// --- Multi-Marketplace Auth ---

interface ProviderConfig {
  baseUrl: string;
  headers: Record<string, string>;
  name: string;
}

function resolveProvider(): ProviderConfig {
  // Priority: RAPIDAPI_KEY > APIMARKET_KEY > DETECTZESTACK_API_KEY
  if (process.env.RAPIDAPI_KEY) {
    return {
      baseUrl: "https://detectzestack.p.rapidapi.com",
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "detectzestack.p.rapidapi.com",
      },
      name: "RapidAPI",
    };
  }
  if (process.env.APIMARKET_KEY) {
    return {
      baseUrl: "https://prod.api.market/api/v1/detectzestack/techstack",
      headers: {
        "x-api-market-key": process.env.APIMARKET_KEY,
      },
      name: "API.market",
    };
  }
  if (process.env.DETECTZESTACK_API_KEY) {
    return {
      baseUrl: "https://detectzestack.com",
      headers: {
        "X-API-Key": process.env.DETECTZESTACK_API_KEY,
      },
      name: "Direct",
    };
  }
  // Should never reach here — caught by startup validation
  throw new Error("No API key configured");
}

// --- Startup Validation ---

if (
  !process.env.RAPIDAPI_KEY &&
  !process.env.APIMARKET_KEY &&
  !process.env.DETECTZESTACK_API_KEY
) {
  console.error(
    "ERROR: No API key found. Set one of these environment variables:\n\n" +
      "  RAPIDAPI_KEY          — Get at https://rapidapi.com/detectzestack/api/detectzestack\n" +
      "  APIMARKET_KEY         — Get at https://api.market/store/detectzestack\n" +
      "  DETECTZESTACK_API_KEY — Get at https://detectzestack.com\n\n" +
      "Set it in your MCP config:\n" +
      '  "env": { "RAPIDAPI_KEY": "your-key-here" }'
  );
  process.exit(1);
}

const provider = resolveProvider();
console.error(
  `DetectZeStack MCP server starting (provider: ${provider.name})`
);

// --- API Client ---

interface ApiRequestOptions {
  method?: "GET" | "POST";
  params?: Record<string, string>;
  body?: unknown;
}

async function apiRequest(
  path: string,
  options: ApiRequestOptions = {}
): Promise<unknown> {
  const { method = "GET", params, body } = options;

  // String concatenation, not new URL() — API.market's base URL includes
  // a path prefix (/api/v1/detectzestack/techstack) that new URL() strips
  const queryString = params
    ? "?" + new URLSearchParams(params).toString()
    : "";
  const url = provider.baseUrl + path + queryString;

  const headers: Record<string, string> = {
    ...provider.headers,
    Accept: "application/json",
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = (data as Record<string, unknown>)?.error;
    throw new Error(
      typeof errorMsg === "string"
        ? errorMsg
        : `API request failed with status ${response.status}`
    );
  }

  return data;
}

// --- Error Handler ---

function handleError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;

    // Rate limit
    if (msg.includes("rate limit") || msg.includes("429")) {
      return "Rate limit exceeded. Your plan's monthly request quota has been reached. Upgrade at https://rapidapi.com/detectzestack/api/detectzestack/pricing";
    }

    // Auth
    if (msg.includes("unauthorized") || msg.includes("401")) {
      return "Authentication failed. Check that your API key environment variable is set correctly.\n\nSupported providers:\n  RAPIDAPI_KEY          — https://rapidapi.com/detectzestack/api/detectzestack\n  APIMARKET_KEY         — https://api.market/store/detectzestack\n  DETECTZESTACK_API_KEY — https://detectzestack.com";
    }

    // Tier gate
    if (msg.includes("tier") || msg.includes("403")) {
      return `Access denied: ${msg}. This endpoint may require a higher plan tier. See https://rapidapi.com/detectzestack/api/detectzestack/pricing`;
    }

    return `Error: ${msg}`;
  }

  return `Unexpected error: ${String(error)}`;
}

// --- Server Initialization ---

const server = new McpServer({
  name: "detectzestack-mcp",
  version: "1.0.0",
});

// --- Tool 1: detect_tech_stack ---

server.registerTool(
  "detect_tech_stack",
  {
    title: "Detect Tech Stack",
    description: `Detect all technologies used by a website. Returns frameworks, CMS platforms, analytics tools, CDNs, hosting providers, and more. Results are cached server-side for 24 hours.

Args:
  - url (string, required): Website URL or domain (e.g., "stripe.com" or "https://stripe.com")

Returns:
  JSON with: url, domain, technologies array (name, version, categories, confidence, cpe), categories grouped by type, meta (status_code, tech_count, scan_depth), cached flag, response_ms.

Examples:
  - "What tech stack does stripe.com use?" -> url="stripe.com"
  - "Is github.com using React?" -> Better to use check_technology tool instead
  - "Scan example.com for technologies" -> url="example.com"`,
    inputSchema: {
      url: z
        .string()
        .min(1, "URL is required")
        .describe("Website URL or domain to analyze (e.g., stripe.com)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ url }) => {
    try {
      const data = await apiRequest("/analyze", {
        params: { url },
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: handleError(error) }],
      };
    }
  }
);

// --- Tool 2: check_technology ---

server.registerTool(
  "check_technology",
  {
    title: "Check Technology",
    description: `Check whether a specific website uses a particular technology. Returns a boolean detected flag, confidence score, version if available, and categories.

More efficient than detect_tech_stack when you only need to verify one technology.

Args:
  - url (string, required): Website URL or domain (e.g., "shopify.com")
  - tech (string, required): Technology name to check (e.g., "React", "WordPress", "Cloudflare")

Returns:
  JSON with: domain, technology, detected (boolean), confidence (0-100), version, categories array, cached flag, response_ms.

Examples:
  - "Does stripe.com use React?" -> url="stripe.com", tech="React"
  - "Is this site on WordPress?" -> url="example.com", tech="WordPress"
  - "Check if shopify.com uses Cloudflare CDN" -> url="shopify.com", tech="Cloudflare"`,
    inputSchema: {
      url: z
        .string()
        .min(1, "URL is required")
        .describe("Website URL or domain to check"),
      tech: z
        .string()
        .min(1, "Technology name is required")
        .describe(
          "Technology name to look for (e.g., React, WordPress, Cloudflare)"
        ),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ url, tech }) => {
    try {
      const data = await apiRequest("/check", {
        params: { url, tech },
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: handleError(error) }],
      };
    }
  }
);

// --- Tool 3: lookup_by_technology ---

server.registerTool(
  "lookup_by_technology",
  {
    title: "Lookup by Technology",
    description: `Find domains that use a specific technology. Searches the DetectZeStack database of previously scanned sites. Results are paginated.

Result limits are tier-gated:
  - Basic (Free): 2 results max
  - Pro ($9/mo): 50 results max
  - Ultra ($29/mo): 200 results max
  - Mega ($79/mo): 800 results max

Args:
  - tech (string, required): Technology name to search for (e.g., "Next.js", "Stripe", "Shopify")
  - limit (number, optional): Max results to return (default: 50, capped by plan tier)
  - offset (number, optional): Pagination offset (default: 0)

Returns:
  JSON with: technology, domains array (domain, last_seen, tech_count), total count, limit, offset, response_ms.

Examples:
  - "Which sites use Next.js?" -> tech="Next.js"
  - "Find companies using Stripe" -> tech="Stripe"
  - "List WordPress sites" -> tech="WordPress"`,
    inputSchema: {
      tech: z
        .string()
        .min(1, "Technology name is required")
        .describe("Technology name to search for"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(50)
        .optional()
        .describe("Maximum results to return (default: 50)"),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .optional()
        .describe("Pagination offset (default: 0)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ tech, limit, offset }) => {
    try {
      const params: Record<string, string> = { tech };
      if (limit !== undefined) params.limit = String(limit);
      if (offset !== undefined) params.offset = String(offset);

      const data = await apiRequest("/lookup", { params });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: handleError(error) }],
      };
    }
  }
);

// --- Tool 4: check_security_headers ---

server.registerTool(
  "check_security_headers",
  {
    title: "Check Security Headers",
    description: `Analyze the security headers of a website. Returns a letter grade (A+ through F), score, per-header test results, deprecated header warnings, information leak detection, and actionable recommendations.

Checks: HTTPS, HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and cookie security. Results cached for 24 hours.

Args:
  - url (string, required): Website URL or domain to analyze (e.g., "stripe.com")

Returns:
  JSON with: url, domain, grade (A+ to F), score, max_score, tests (per-header results), deprecated_headers, info_leaks, recommendations array, scan_time_ms, cached flag.

Examples:
  - "How secure is stripe.com?" -> url="stripe.com"
  - "Grade the security headers of example.com" -> url="example.com"
  - "Check if this site has CSP headers" -> url="mysite.com"`,
    inputSchema: {
      url: z
        .string()
        .min(1, "URL is required")
        .describe("Website URL or domain to analyze"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ url }) => {
    try {
      const data = await apiRequest("/security", {
        params: { url },
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: handleError(error) }],
      };
    }
  }
);

// --- Tool 5: check_ssl_certificate ---

server.registerTool(
  "check_ssl_certificate",
  {
    title: "Check SSL Certificate",
    description: `Inspect the SSL/TLS certificate for a domain. Returns TLS version, cipher suite, certificate subject/issuer, validity dates, days remaining until expiry, SAN entries, chain of trust, and more. Results cached for 24 hours.

Args:
  - url (string, required): Domain to check (e.g., "stripe.com")

Returns:
  JSON with: domain, ip, port, tls (version, cipher_suite, negotiated_protocol), certificate (subject, issuer, not_before, not_after, days_remaining, is_expired, san_domains, key_usage, etc.), chain array, has_tls flag, response_ms.

Examples:
  - "Check the SSL cert for stripe.com" -> url="stripe.com"
  - "Is example.com's certificate expired?" -> url="example.com"
  - "What TLS version does mysite.com use?" -> url="mysite.com"`,
    inputSchema: {
      url: z
        .string()
        .min(1, "URL is required")
        .describe("Domain to check (e.g., stripe.com)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ url }) => {
    try {
      const data = await apiRequest("/certificate/check", {
        params: { url },
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: handleError(error) }],
      };
    }
  }
);

// --- Tool 6: dns_lookup ---

server.registerTool(
  "dns_lookup",
  {
    title: "DNS Lookup",
    description: `Perform a comprehensive DNS lookup for a domain. Returns A, AAAA, CNAME, MX, NS, TXT, SOA, and PTR records resolved in parallel. Also includes SPF/DMARC/DKIM email security analysis.

Args:
  - domain (string, required): Domain to look up (e.g., "stripe.com"). Must be a bare domain, not a full URL.

Returns:
  JSON with: domain, a (IPv4 addresses), aaaa (IPv6), cname, mx (host + priority), ns (nameservers), txt (TXT records), soa, ptr, email_security (spf, dmarc, dkim grades), errors (non-fatal), query_ms, response_ms.

Examples:
  - "Look up DNS records for stripe.com" -> domain="stripe.com"
  - "What are the MX records for gmail.com?" -> domain="gmail.com"
  - "Check the nameservers for example.com" -> domain="example.com"`,
    inputSchema: {
      domain: z
        .string()
        .min(1, "Domain is required")
        .describe(
          "Domain to look up (e.g., stripe.com). Must be a bare domain, not a URL."
        ),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ domain }) => {
    try {
      const data = await apiRequest("/dns", {
        params: { domain },
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: handleError(error) }],
      };
    }
  }
);

// --- Tool 7: scan_vulnerabilities ---

server.registerTool(
  "scan_vulnerabilities",
  {
    title: "Scan Vulnerabilities",
    description: `Scan a website for known vulnerabilities (CVEs). First detects the technology stack, then queries the NVD (National Vulnerability Database) for CVEs matching detected technologies with CPE identifiers and version numbers.

Only technologies with both a CPE identifier and a detected version can be checked. Results are sorted by CVSS score (most severe first).

Args:
  - url (string, required): Website URL or domain to scan (e.g., "example.com")
  - severity (string, optional): Filter by severity level: "CRITICAL", "HIGH", "MEDIUM", or "LOW"

Returns:
  JSON with: domain, scan_date, technologies_scanned, technologies_with_cpe, vulnerabilities_found, severity_summary (critical/high/medium/low counts), vulnerabilities array (cve_id, technology, version_detected, severity, cvss_score, summary, published_date, references), disclaimer.

Examples:
  - "Scan example.com for vulnerabilities" -> url="example.com"
  - "Find critical CVEs on mysite.com" -> url="mysite.com", severity="CRITICAL"
  - "Security audit of blog.example.com" -> url="blog.example.com"`,
    inputSchema: {
      url: z
        .string()
        .min(1, "URL is required")
        .describe("Website URL or domain to scan"),
      severity: z
        .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"])
        .optional()
        .describe("Filter by severity level (optional)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ url, severity }) => {
    try {
      const params: Record<string, string> = { url };
      if (severity) params.severity = severity;

      const data = await apiRequest("/vulnerability", { params });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: handleError(error) }],
      };
    }
  }
);

// --- Tool 8: compare_stacks ---

server.registerTool(
  "compare_stacks",
  {
    title: "Compare Tech Stacks",
    description: `Compare the technology stacks of 2 to 10 websites. Returns shared technologies, unique technologies per site, and full tech details for each domain.

Each URL in the list counts as one API credit toward your monthly limit.

Args:
  - urls (string[], required): Array of 2-10 website URLs or domains to compare

Returns:
  JSON with: domains array (url, domain, technologies, unique techs, errors), shared (technologies used by all sites), total_ms.

Examples:
  - "Compare stripe.com and shopify.com tech stacks" -> urls=["stripe.com", "shopify.com"]
  - "What do these 3 sites have in common?" -> urls=["site1.com", "site2.com", "site3.com"]`,
    inputSchema: {
      urls: z
        .array(z.string())
        .min(2, "At least 2 URLs required")
        .max(10, "Maximum 10 URLs per comparison")
        .describe("Array of 2-10 website URLs or domains to compare"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false, // Multiple URLs = multiple credits consumed
      openWorldHint: true,
    },
  },
  async ({ urls }) => {
    try {
      const data = await apiRequest("/compare", {
        method: "POST",
        body: { urls },
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: handleError(error) }],
      };
    }
  }
);

// --- Tool 9: site_profile ---

server.registerTool(
  "site_profile",
  {
    title: "Site Profile",
    description: `Get a comprehensive site profile combining tech stack detection, DNS records, SSL certificate inspection, and security header analysis in a single call. Runs all four analyses in parallel for efficiency.

This is a premium endpoint: requires Ultra ($29/mo) or Mega ($79/mo) plan and costs 3 API credits per call.

Args:
  - url (string, required): Website URL or domain to profile (e.g., "stripe.com")

Returns:
  JSON with: domain, url_scanned, technologies array, categories, dns (full DNS records), certificate (TLS/cert details), security (header grades), meta (page title, description), credits_used, response_ms, errors (partial failure details).

Examples:
  - "Give me a full profile of stripe.com" -> url="stripe.com"
  - "Complete security and tech audit of example.com" -> url="example.com"
  - "Everything you can tell me about mysite.com" -> url="mysite.com"`,
    inputSchema: {
      url: z
        .string()
        .min(1, "URL is required")
        .describe("Website URL or domain to profile"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ url }) => {
    try {
      const data = await apiRequest("/site", {
        params: { url },
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: handleError(error) }],
      };
    }
  }
);

// --- Server Startup ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DetectZeStack MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
