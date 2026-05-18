# Hermes Agent example

One concrete integration: wiring `claude-max-mcp` into a [Hermes Agent](https://github.com/NousResearch/hermes-agent) profile so a cheap router model (Gemini, Sonnet, etc.) delegates substantive work to Claude Opus 4.7 over your Max subscription. The pattern generalizes — these files are scoped to Hermes specifically because Hermes was the motivating use case.

## Quick install (one profile)

Requires Hermes Agent already installed (`brew install hermes-agent`), `claude-max-mcp` installed globally (`npm install -g claude-max-mcp`), and Claude Code CLI authenticated (`claude /login`).

```bash
./setup-profile.sh <profile-name>
```

Where `<profile-name>` is the Hermes profile you want to convert (e.g. `default`, or your custom profile). The script:

1. Registers `claude-max-mcp` as an MCP server on that profile.
2. Appends the delegation rule block (see [`SOUL-additions.md`](SOUL-additions.md)) to the profile's `SOUL.md`.
3. Sets `tool_use_enforcement: required` in profile config (forces the cheap router to actually use the tool instead of answering directly).
4. Restarts the profile's gateway service so changes take effect.

After this, the profile will route every substantive message through Opus.

## Manual install

If you'd rather wire each piece yourself:

### 1. Pick a cheap router model

Set the profile to Gemini, Sonnet, or another model that's cheap to run per-message:

```bash
<profile> config set provider gemini
<profile> config set model gemini-2.5-pro
```

(Add the relevant API key to `~/.hermes/profiles/<profile>/.env`.)

### 2. Register the MCP server

```bash
<profile> mcp add claude-max \
  --command npx \
  --args -y claude-max-mcp
```

To target a specific project root (so Claude has codebase context):

```bash
<profile> mcp add claude-max-mycodebase \
  --command npx --args -y claude-max-mcp \
  --env CLAUDE_MAX_MCP_CWD=/Users/me/my-codebase
```

### 3. Add the delegation rule to SOUL.md

Append the contents of [`SOUL-additions.md`](SOUL-additions.md) to `~/.hermes/profiles/<profile>/SOUL.md`. Put it at the TOP of the file — Hermes' default SOUL.md is verbose and a rule at the bottom tends to get drowned out.

### 4. Force tool use

```bash
<profile> config set agent.tool_use_enforcement required
```

This makes the router actually invoke `ask_claude` instead of answering from its own knowledge (which it'll otherwise do, especially when the session has accumulated history).

### 5. Reset session history (optional but recommended)

If the profile has prior conversation history from when it was using Claude directly, the router model will read that history and inherit the "I answer directly" pattern. Wipe it:

```bash
<profile> gateway stop
rm -f ~/.hermes/profiles/<profile>/sessions/*.{jsonl,json}
rm -f ~/.hermes/profiles/<profile>/state.db
<profile> gateway start
```

### 6. Verify

```bash
# Send a substantive question via Discord / your gateway
# Then check the log for tool invocation:
tail -50 ~/.hermes/profiles/<profile>/logs/agent.log | grep -i ask_claude
```

You should see lines like:

```
tool mcp_claude_max_ask_claude completed (X.XXs, NNN chars)
```

If the tool isn't being called, see [Troubleshooting](#troubleshooting) below.

## Architecture in Hermes terms

```
Discord message
    ↓
Hermes profile gateway
    ↓
Cheap router model (Gemini 2.5 Pro / Sonnet 4.6 / etc.)
    ↓  SOUL rule: "DELEGATE EVERYTHING via ask_claude"
    ↓  invokes mcp_claude_max_ask_claude tool
    ↓
claude-max-mcp Node subprocess
    ↓  spawns `claude -p --model claude-opus-4-7`
    ↓
Claude Code CLI → OAuth → Max subscription
    ↓
Opus 4.7 response
    ↓  back through Node → Hermes → Discord
```

## Troubleshooting

**Router answers directly without calling ask_claude.**
Most common cause: session history bias. The router reads prior turns (where another model answered) and follows the same pattern. Fix: wipe session files (step 5 above) and start a fresh Discord thread for testing.

**`mcp add` fails with "name 'StdioServerParameters' is not defined".**
Hermes' bundled Python venv is missing the `mcp` SDK. Bootstrap it:

```bash
HERMES_PY=$(ls /opt/homebrew/Cellar/hermes-agent/*/libexec/bin/python | head -1)
$HERMES_PY -m ensurepip --upgrade
$HERMES_PY -m pip install mcp
```

**`claude` not found from the launchd-managed gateway.**
Launchd strips PATH. Either add a PATH override when registering the MCP server, or use the absolute path:

```bash
<profile> mcp add claude-max \
  --command /opt/homebrew/bin/npx \
  --args -y claude-max-mcp
```

**Auth errors inside delegated calls.**
Re-run `claude /login` once in a terminal. The MCP server reads the latest token on each spawn.
