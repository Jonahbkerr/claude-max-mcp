# Architecture

## Data flow for a single delegated call

```
1. MCP client (Cline / Hermes / Claude Code / your agent)
   ↓  tool_call("ask_claude", { prompt: "..." })
2. claude-max-mcp Node process (this repo)
   ↓  spawn `claude -p "..." --model claude-opus-4-7`
3. Claude Code CLI (@anthropic-ai/claude-code)
   ↓  reads OAuth token from ~/.claude.json
   ↓  HTTPS to api.anthropic.com (or Claude.ai backend)
4. Anthropic backend
   ↓  routes to Opus 4.7 inference
   ↓  debits the OAuth account's Max subscription credits
5. Response streams back: Anthropic → claude CLI → MCP server → MCP client
```

## Why subprocess, not HTTP

The straightforward way to call Claude is `POST /v1/messages` with an API key. We don't do that, because the entire point of this server is to **not** use the API key. Claude Code is the only first-party client today that authenticates via Claude.ai OAuth (your Max subscription), so the path is: MCP server → spawns Claude Code → Claude Code does the OAuth-authenticated HTTP call.

Subprocess overhead is ~1–2 seconds per call (Node startup + Claude Code session bootstrap). Acceptable for agent / chat latency, less so for tight tool-use loops where you'd want sub-second responses. For tight loops, fall back to direct API calls.

## How OAuth gets discovered

`claude` (the CLI) reads `~/.claude.json` at startup, which contains an `oauthAccount` object after you run `claude /login`. The MCP server doesn't touch this file directly — it just spawns `claude` with the calling user's `$HOME` intact and lets Claude Code do its own auth.

If `claude` is invoked from a daemonized context (launchd / systemd) where `$HOME` may not propagate, set it explicitly in the MCP client's env config:

```json
{
  "env": {
    "HOME": "/Users/yourname"
  }
}
```

The server already passes `process.env.HOME || homedir()` to the subprocess, but some launchd setups strip `HOME` entirely.

## Model selection

Default is `claude-opus-4-7` because Max subscribers paying $200/mo typically want their delegated tasks to hit the best available model. Override per-server-instance via `CLAUDE_MAX_MCP_MODEL`:

- `claude-opus-4-7` — best for complex code, deep reasoning, multi-step engineering (~5× Sonnet's credit cost)
- `claude-sonnet-4-6` — strong all-rounder, ~⅕ the credit cost of Opus
- `claude-haiku-4-5-20251001` — fast and cheapest, fine for short answers

Aliases work too: `opus`, `sonnet`, `haiku`.

## Multi-instance setup (different models per agent)

You can register the same MCP server multiple times under different names, each with its own model + cwd. Example in Hermes:

```bash
# Heavy delegate for code work — Opus, scoped to a project
hermes mcp add claude-max-code \
  --command npx --args -y claude-max-mcp \
  --env CLAUDE_MAX_MCP_MODEL=claude-opus-4-7 \
        CLAUDE_MAX_MCP_CWD=/Users/me/my-project \
        CLAUDE_MAX_MCP_TOOL_NAME=ask_claude_code

# Cheap delegate for routine Q&A — Haiku
hermes mcp add claude-max-quick \
  --command npx --args -y claude-max-mcp \
  --env CLAUDE_MAX_MCP_MODEL=haiku \
        CLAUDE_MAX_MCP_TOOL_NAME=ask_claude_quick
```

Now the calling agent has two tools and picks based on task complexity.

## Why MCP and not a library?

Two reasons:

1. **Compatibility.** MCP is the protocol most agents (Cline, Continue, Claude Code, Cursor, Hermes Agent, custom builds) speak. A library would lock you into one framework's plugin system.
2. **Process isolation.** The Claude Code subprocess inherits its own working directory, env, and auth state. Running it in a separate process keeps the calling agent's state clean — useful when the caller is itself Claude Code and you don't want recursive memory pollution.

## What this does NOT do

- **No conversation persistence.** Each `ask_claude` call spawns a fresh `claude -p` session. Claude has no memory of prior delegations. Include all relevant context in the `prompt` argument.
- **No streaming.** The MCP server waits for `claude -p` to finish, then returns the full text. Streaming responses through MCP would require additional plumbing not yet implemented.
- **No cost tracking.** Costs are debited from your Max subscription on the Anthropic side. To audit usage, check `console.anthropic.com/settings/usage` or Anthropic's billing dashboard.
- **No tool granting.** The delegated Claude session uses its own default toolset. If you want to grant or restrict tools to the delegated session, configure that via `CLAUDE_MAX_MCP_EXTRA_ARGS` with appropriate `--allowed-tools` / `--disallowed-tools` flags.
