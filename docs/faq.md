# FAQ

## Does this really avoid Anthropic API billing?

Yes, *if* your Claude Code CLI is signed in via Claude.ai OAuth (the standard `claude /login` flow). When `claude -p` runs with OAuth auth, requests go through Claude.ai's backend and are debited from your Claude Pro / Max subscription credit allotment — not from any API workspace tied to `ANTHROPIC_API_KEY`.

To confirm, after running a few delegated calls, check:

- `~/.claude.json` should contain an `oauthAccount` object and no `api_key` field
- `console.anthropic.com/settings/usage` should show no new API usage on the workspace tied to your API key

## How many Opus calls can I make on Max?

Anthropic publishes [usage policies for Pro and Max plans](https://www.anthropic.com/pricing) and adjusts limits over time. As of 2026, Max ($200/mo) gives substantially higher Claude Code usage than Pro, but it is metered, not unlimited. Expect to hit caps if you run constant Opus-heavy delegations at scale.

Rough rules of thumb:

- A typical Discord-bot reply (3K input + 500 output tokens) on Opus = a few hundred credits
- Same reply on Sonnet 4.6 = ~⅕ the credits
- Same reply on Haiku 4.5 = ~1/30 the credits

If you're burning through the Max allotment too fast, drop the default model:

```
CLAUDE_MAX_MCP_MODEL=sonnet
```

## What about Claude Pro (the $20/mo plan)?

It works, but with a smaller allotment. The architecture is identical — Claude Code OAuth flow is the same for Pro and Max. You just hit limits sooner. Pro is fine for a single user + occasional agent delegation; Max is the realistic floor for serving multiple bots heavily.

## Why does the first call take so long?

`claude -p` has to start the Node runtime, load Claude Code, validate OAuth, and stream the response. First call ≈ 3–5s of overhead. Subsequent calls don't share state — each one re-spawns. If sub-second latency matters, this server isn't the right tool.

## How do I give Claude project context?

Set `CLAUDE_MAX_MCP_CWD` to a project root. Claude Code auto-discovers `CLAUDE.md` files and respects them. Example:

```bash
CLAUDE_MAX_MCP_CWD=/Users/me/my-project npx claude-max-mcp
```

Now `ask_claude` calls launch `claude` in that directory, and Claude has full access to the file tree (via its built-in tools) plus any `CLAUDE.md` you've written.

## Can I run multiple instances with different configs?

Yes. Register the same MCP server multiple times under different names. See [`architecture.md`](architecture.md) for an example with one Opus-on-codebase delegate and one Haiku-for-quick-answers delegate.

## How do I update OAuth tokens?

Run `claude /login` once in a terminal. The MCP server reads the latest token on every subprocess spawn — no restart needed.

## What if I want to scope what the delegated Claude session can do?

Pass `--allowed-tools` (or `--disallowed-tools`) through `CLAUDE_MAX_MCP_EXTRA_ARGS`:

```
CLAUDE_MAX_MCP_EXTRA_ARGS="--allowed-tools=Read,Glob,Grep"
```

Now delegated calls can only read files, not write, run shell, or call MCP tools recursively. Useful when the calling agent is untrusted.

## I'm getting "claude: command not found" when invoked from a daemon

The server tries `claude` from PATH. Daemon-managed processes (launchd, systemd) often strip PATH. Two fixes:

1. **Set PATH explicitly in the MCP client's env config:**
   ```json
   "env": { "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" }
   ```
2. **Or use an absolute path:**
   ```json
   "env": { "CLAUDE_MAX_MCP_BIN": "/opt/homebrew/bin/claude" }
   ```

## I get "No Anthropic credentials found" inside the delegated call

That means `claude` couldn't find OAuth in `~/.claude.json`. Either:

- You haven't run `claude /login` yet
- `$HOME` isn't propagating to the subprocess (set it explicitly in env config)
- Your OAuth token expired (re-run `claude /login`)

## Can the calling agent see Claude's tool calls?

No. The delegated Claude session runs to completion before returning. The MCP server only forwards Claude's final text response. If you want intermediate visibility, you'd need a richer transport — this server keeps things simple and stateless.

## Why isn't there a Python version?

Could be — happy to accept a PR with a Python implementation alongside the Node one. Node was chosen because the official MCP SDK there is the most mature, and Claude Code is itself npm-distributed.

## What's the relationship to Hermes Agent?

[Hermes Agent](https://github.com/NousResearch/hermes-agent) was the original motivating use case — a fleet of Discord bots routed by Gemini that delegate substantive work to Opus via this server. There's a complete reference setup in [`hermes/`](../hermes/) you can copy-paste.

The pattern generalizes to any MCP client, though. Cline, Continue, Cursor, and Claude Code itself all benefit from the same architecture.
