# claude-max-mcp

> An MCP server that lets any MCP-compatible agent delegate to Claude Code — billed against your Claude Max / Pro subscription instead of an Anthropic API key.

If you pay $200/month for Claude Max but your agents (Cline, Continue, Hermes, custom MCP setups, even Claude Code itself nested) hit the Anthropic API directly with credit-card billing, you're paying twice. This is a 90-line MCP server that fixes that.

```
  Your MCP-compatible agent                           
  (Hermes • Cline • Continue • Claude Code           
   itself • Cursor • custom agents • etc.)            
              │                                       
              │  ask_claude(prompt)                   
              ▼                                       
        ┌──────────────────┐                          
        │  claude-max-mcp  │  ← this repo            
        │  (stdio server)  │                          
        └──────────────────┘                          
              │                                       
              │  spawn  claude -p --model opus-4-7    
              ▼                                       
        ┌──────────────────┐                          
        │  Claude Code CLI │                          
        └──────────────────┘                          
              │                                       
              │  OAuth via ~/.claude.json             
              ▼                                       
        Claude Max subscription                       
        (your $200/mo allotment)                      
```

## Why this exists

Three real scenarios this solves:

1. **Cheap router → Opus delegate.** A bot powered by Gemini 2.5 Pro or Sonnet 4.6 routes Discord/Slack chat, then delegates substantive work to Opus 4.7. The cheap model handles 95% of messages directly; only hard tasks burn Opus credits. (Reference architecture in `hermes/`.)
2. **Multi-IDE Claude reuse.** Use Cline/Continue/Cursor with this as their backing model so all your IDE work counts against your Max allotment instead of accumulating API charges in parallel.
3. **Custom agents inside Claude Code.** Yes, you can register this MCP inside Claude Code itself — useful for sub-agents that need their own scoped Claude call without polluting the main session context.

## Install

```bash
# 1. Install Claude Code CLI if you don't have it
npm install -g @anthropic-ai/claude-code

# 2. Log in once (OAuth flow — uses your Claude Max subscription)
claude /login

# 3. Install this MCP server
npm install -g claude-max-mcp
# or, run from source:
#   git clone https://github.com/Jonahbkerr/claude-max-mcp
#   cd claude-max-mcp && npm install

# 4. Smoke test
claude-max-mcp --smoke
# → ✓ claude-max-mcp smoke test passed (model: claude-opus-4-7)
```

## Register with your MCP client

The server is stdio-based. Drop this into your MCP client's config:

### Claude Code

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

### Hermes Agent

```bash
hermes mcp add claude-max --command npx --args -y claude-max-mcp
```

…then tell Hermes to use it via a delegation rule in `SOUL.md`. Full template at [`hermes/SOUL-additions.md`](hermes/SOUL-additions.md), one-shot setup script at [`hermes/setup-profile.sh`](hermes/setup-profile.sh).

### Cline (VS Code)

```json
{
  "mcpServers": {
    "claude-max": {
      "command": "npx",
      "args": ["-y", "claude-max-mcp"],
      "env": {}
    }
  }
}
```

### Continue (VS Code)

```yaml
# ~/.continue/config.yaml
mcpServers:
  - name: claude-max
    command: npx
    args: [-y, claude-max-mcp]
```

More examples in [`examples/`](examples/).

## Configure

Set on the MCP client side when registering:

| Env var | Default | What it does |
|---|---|---|
| `CLAUDE_MAX_MCP_MODEL` | `claude-opus-4-7` | Model passed to `claude -p --model`. Aliases work (`opus`, `sonnet`, `haiku`). |
| `CLAUDE_MAX_MCP_BIN` | `claude` (from PATH) | Path to the Claude Code CLI. |
| `CLAUDE_MAX_MCP_TIMEOUT_MS` | `600000` (10 min) | How long a single delegated call can run. |
| `CLAUDE_MAX_MCP_CWD` | `$HOME` | Working dir for the claude subprocess — set to a project root if you want Claude to see CLAUDE.md / files there. |
| `CLAUDE_MAX_MCP_TOOL_NAME` | `ask_claude` | Override the exposed tool name. |
| `CLAUDE_MAX_MCP_EXTRA_ARGS` | _(empty)_ | Space-separated extra args to pass to `claude -p`. |

Example — wire it to a specific project so Claude has codebase context:

```bash
hermes mcp add claude-max-codebase \
  --command npx --args -y claude-max-mcp \
  --env CLAUDE_MAX_MCP_CWD=/Users/me/my-codebase \
        CLAUDE_MAX_MCP_TOOL_NAME=ask_claude_codebase
```

## Architecture / FAQ

- **[docs/architecture.md](docs/architecture.md)** — full data flow, why subprocess instead of HTTP, how OAuth gets discovered.
- **[docs/faq.md](docs/faq.md)** — Max sub credit consumption math, model selection guidance, how to inspect call costs, common errors.

## Caveats / honest tradeoffs

- **Not free** — each delegated call debits your Claude Max subscription allotment. The savings come from avoiding *additional* API billing on top of your subscription, not from making Claude free.
- **Opus is ~5× Sonnet in credit terms.** If you blast 1000 Opus delegations a day, you'll hit the Max usage cap. Use it for tasks that need Opus, route simpler ones to Sonnet or Haiku via `CLAUDE_MAX_MCP_MODEL=sonnet`.
- **Subprocess overhead.** Each call spawns `claude` (~1–2s startup). Fine for chat/agent latency, not great for sub-second tool use.
- **OAuth tokens rotate.** If you start seeing auth errors, run `claude /login` once and the MCP server picks it up next call.
- **Requires `claude` to be authenticated and on PATH** when the MCP server runs. Daemon-mode setups (launchd, systemd) need PATH explicitly set in their env.

## Security model

- Tokens stay on your machine. The MCP server never holds Anthropic credentials directly — it shells out to `claude`, which reads its own OAuth from `~/.claude.json`.
- The MCP tool surface is exactly one tool with one string argument. No file access, no shell injection (args are passed via `spawn` not shell), no follow-up tool-use loops.
- If you want to scope what Claude can do during a delegation, set `CLAUDE_MAX_MCP_CWD` to a sandboxed directory and rely on Claude Code's own `--allowed-tools` (via `CLAUDE_MAX_MCP_EXTRA_ARGS`).

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

Built as part of getting a Hermes-Agent-powered Discord bot fleet to route through a Claude Max subscription instead of an API key. The pattern generalizes to any MCP client.

Issues, PRs, and "this should also work with X" reports welcome.
