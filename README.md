# claude-max-mcp

> **An MCP server that turns your Claude Max / Pro subscription into a backend any AI agent can call.**

If you pay for Claude Max or Pro, you have a real allotment of Claude usage already — but most agent tools (Cline, Continue, Cursor, custom MCP setups, even Claude Code nested inside another agent) hit the Anthropic API directly with separate credit-card billing. You end up paying twice.

This is a small stdio MCP server that fixes that. It exposes a single tool — `ask_claude` — which spawns Claude Code under the hood and uses your existing Claude.ai OAuth session to route the call. Net effect: the call counts against your Max/Pro subscription credits, **not** against any API key.

```
  Your MCP-compatible agent
  (Cline • Continue • Cursor • Claude Code itself •
   Hermes Agent • custom agents • etc.)
              │
              │  ask_claude(prompt)
              ▼
        ┌──────────────────┐
        │  claude-max-mcp  │  ← this repo
        │  (stdio server)  │
        └──────────────────┘
              │
              │  spawn  claude -p --model claude-opus-4-7
              ▼
        ┌──────────────────┐
        │  Claude Code CLI │
        └──────────────────┘
              │
              │  OAuth via ~/.claude.json
              ▼
        Claude Max / Pro subscription
        (your existing monthly allotment)
```

## Why this exists

Three real scenarios this solves:

1. **Reduce duplicate billing.** Stop paying for Max *and* API credits when the agent work could just count against Max.
2. **Prompt-enhancement router → Claude delegate.** A cheap router model (Gemini, Sonnet, Haiku) does no substantive reasoning — it just adds context (project name, today's date, scope hints) to the user's message and forwards it verbatim to Claude Opus 4.7. Claude does all the actual thinking, billed to your Max subscription. Reference template in [`examples/hermes/SOUL-additions.md`](examples/hermes/SOUL-additions.md).
3. **Nest agents inside Claude Code.** Use this from within a Claude Code session so a sub-agent can make its own scoped Claude call without polluting the parent session's context.

## Install

```bash
# 1. Install Claude Code CLI if you don't have it
npm install -g @anthropic-ai/claude-code

# 2. Log in once (OAuth — uses your Claude Max / Pro subscription)
claude /login

# 3. Install this MCP server
npm install -g claude-max-mcp
# or run from source:
#   git clone https://github.com/Jonahbkerr/claude-max-mcp
#   cd claude-max-mcp && npm install

# 4. Smoke test
claude-max-mcp --smoke
# → ✓ claude-max-mcp smoke test passed (model: claude-opus-4-7)
```

## Register with your MCP client

The server is stdio. Drop it into your client's MCP config.

### Claude Code itself

Add to `~/.claude/settings.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "claude-max": { "command": "npx", "args": ["-y", "claude-max-mcp"] }
  }
}
```

### Cline (VS Code)

In Cline's MCP server settings:

```json
{
  "mcpServers": {
    "claude-max": {
      "command": "npx",
      "args": ["-y", "claude-max-mcp"]
    }
  }
}
```

### Continue (VS Code / JetBrains)

In `~/.continue/config.yaml`:

```yaml
mcpServers:
  - name: claude-max
    command: npx
    args: [-y, claude-max-mcp]
```

### Any other MCP-compatible client

Same pattern — `command: npx, args: [-y, claude-max-mcp]`. See [`examples/`](examples/) for ready-to-paste configs.

## Configure

Set on the MCP client side when you register the server:

| Env var | Default | What it does |
|---|---|---|
| `CLAUDE_MAX_MCP_MODEL` | `claude-opus-4-7` | Model passed to `claude --model`. Aliases work (`opus`, `sonnet`, `haiku`). |
| `CLAUDE_MAX_MCP_BIN` | `claude` (from PATH) | Path to the Claude Code CLI. |
| `CLAUDE_MAX_MCP_TIMEOUT_MS` | `600000` (10 min) | How long a single delegated call can run. |
| `CLAUDE_MAX_MCP_CWD` | `$HOME` | Working dir for the claude subprocess — point at a project root if you want Claude to see CLAUDE.md / files there. |
| `CLAUDE_MAX_MCP_TOOL_NAME` | `ask_claude` | Override the exposed tool name (useful when running multiple instances). |
| `CLAUDE_MAX_MCP_EXTRA_ARGS` | _(empty)_ | Extra space-separated args to pass to `claude -p`. |

You can register the same server multiple times under different names with different env to expose multiple tools to the same agent (e.g. one Opus instance scoped to a project, one Haiku for one-liners). See [`examples/hermes/multi-instance.sh`](examples/hermes/multi-instance.sh).

## How it works

[`docs/architecture.md`](docs/architecture.md) — data flow, OAuth discovery, model selection, why subprocess.

[`docs/faq.md`](docs/faq.md) — Max sub credit math, common errors, troubleshooting, what this does and doesn't do.

## Honest tradeoffs

- **Not free.** Each call debits your Claude subscription allotment. The savings come from avoiding *additional* API billing, not from making Claude free.
- **Opus is ~5× Sonnet in credit terms.** Burning thousands of Opus delegations per day will exhaust Max usage caps. Use `CLAUDE_MAX_MCP_MODEL=sonnet` or `=haiku` for routine work.
- **Subprocess overhead** ≈ 1–2s per call. Fine for chat / agent latency, not for sub-second tool loops.
- **Daemon-managed clients** (launchd, systemd) often strip PATH — set `PATH` or `CLAUDE_MAX_MCP_BIN` explicitly in env config.

## Security

- Anthropic credentials never pass through this server. It shells out to `claude`, which reads its own OAuth from `~/.claude.json`.
- The MCP surface is one tool, one string argument. No file I/O, no shell injection (args go through `spawn`, not a shell), no recursive tool-use loops.
- To restrict what Claude can do during delegated calls, set `CLAUDE_MAX_MCP_CWD` to a sandboxed directory and use `CLAUDE_MAX_MCP_EXTRA_ARGS="--allowed-tools=Read,Glob,Grep"` (or similar) to scope its toolset.

## License

MIT — see [LICENSE](LICENSE).

Issues, PRs, and "this should also work with X" reports welcome.
