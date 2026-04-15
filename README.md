# DetectZeStack MCP Server

An MCP (Model Context Protocol) server that lets AI agents detect technology stacks,
analyze security headers, inspect SSL certificates, look up DNS records, and scan for
vulnerabilities on any website.

## Quick Start

### Claude Code

Add to `.mcp.json` in your project root (or `~/.claude/.mcp.json` for global):

```json
{
  "mcpServers": {
    "detectzestack": {
      "command": "npx",
      "args": ["-y", "detectzestack-mcp"],
      "env": {
        "RAPIDAPI_KEY": "your-rapidapi-key"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "detectzestack": {
      "command": "npx",
      "args": ["-y", "detectzestack-mcp"],
      "env": {
        "RAPIDAPI_KEY": "your-rapidapi-key"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "detectzestack": {
      "command": "npx",
      "args": ["-y", "detectzestack-mcp"],
      "env": {
        "RAPIDAPI_KEY": "your-rapidapi-key"
      }
    }
  }
}
```

### Get Your API Key

1. Go to [DetectZeStack on RapidAPI](https://rapidapi.com/detectzestack/api/detectzestack)
2. Subscribe to a plan (free tier: 100 requests/month)
3. Copy your API key from the RapidAPI dashboard

### Alternative API Providers

Instead of RapidAPI, you can use API.market or a direct API key:

**API.market:**
```json
{
  "mcpServers": {
    "detectzestack": {
      "command": "npx",
      "args": ["-y", "detectzestack-mcp"],
      "env": {
        "APIMARKET_KEY": "your-apimarket-key"
      }
    }
  }
}
```

**Direct API Key:**
```json
{
  "mcpServers": {
    "detectzestack": {
      "command": "npx",
      "args": ["-y", "detectzestack-mcp"],
      "env": {
        "DETECTZESTACK_API_KEY": "your-api-key"
      }
    }
  }
}
```

Provider priority: `RAPIDAPI_KEY` > `APIMARKET_KEY` > `DETECTZESTACK_API_KEY`

## Available Tools

| Tool | Description | Credits |
|------|-------------|---------|
| `detect_tech_stack` | Detect all technologies on a website | 1 |
| `check_technology` | Check if a site uses a specific technology | 1 |
| `lookup_by_technology` | Find domains using a specific technology | 1 |
| `check_security_headers` | Grade security headers (A+ to F) | 1 |
| `check_ssl_certificate` | Inspect SSL/TLS certificate details | 1 |
| `dns_lookup` | DNS records + email security (SPF/DMARC/DKIM) | 1 |
| `scan_vulnerabilities` | CVE/CPE vulnerability scan | 1 |
| `compare_stacks` | Compare tech stacks of 2-10 sites | 1 per URL |
| `site_profile` | Full combined profile (Ultra+ plan) | 3 |

## Example Prompts

Once configured, ask your AI agent:

- "What technologies does stripe.com use?"
- "Does shopify.com use React?"
- "Check the security headers of my-site.com"
- "Is the SSL certificate for example.com about to expire?"
- "Look up DNS records for gmail.com"
- "Scan my-app.com for known vulnerabilities"
- "Compare the tech stacks of stripe.com and square.com"
- "Give me a full site profile of github.com"

## Pricing

| Plan | Requests/Month | Price |
|------|---------------|-------|
| Basic | 100 | Free |
| Pro | 1,000 | $9/mo |
| Ultra | 10,000 | $29/mo |
| Mega | 50,000 | $79/mo |

[View pricing](https://rapidapi.com/detectzestack/api/detectzestack/pricing)

## Links

- [DetectZeStack Website](https://detectzestack.com)
- [API Documentation](https://detectzestack.com/openapi.yaml)
- [RapidAPI Listing](https://rapidapi.com/detectzestack/api/detectzestack)
- [Report Issues](https://github.com/mlugo-apx/detectzestack-mcp/issues)

## License

MIT
