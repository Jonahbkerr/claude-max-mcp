#!/usr/bin/env bash
# Example: register multiple instances of claude-max-mcp under a single Hermes
# profile, each scoped to a different project and / or model. The router model
# then has multiple tools to pick from based on the task.
#
# Adjust the profile name and paths to match your setup.
set -euo pipefail

PROFILE="default"   # ← change to your profile name

# 1. Opus 4.7 on your main codebase (heavy delegate)
"$PROFILE" mcp add claude-max-codebase \
  --command npx --args -y claude-max-mcp \
  --env "CLAUDE_MAX_MCP_MODEL=claude-opus-4-7" \
        "CLAUDE_MAX_MCP_CWD=$HOME/my-main-codebase" \
        "CLAUDE_MAX_MCP_TOOL_NAME=ask_claude_codebase"

# 2. Sonnet 4.6 generalist (cheaper delegate for non-code questions)
"$PROFILE" mcp add claude-max-general \
  --command npx --args -y claude-max-mcp \
  --env "CLAUDE_MAX_MCP_MODEL=sonnet" \
        "CLAUDE_MAX_MCP_TOOL_NAME=ask_claude_general"

# 3. Haiku for one-shot quick answers (cheapest)
"$PROFILE" mcp add claude-max-quick \
  --command npx --args -y claude-max-mcp \
  --env "CLAUDE_MAX_MCP_MODEL=haiku" \
        "CLAUDE_MAX_MCP_TOOL_NAME=ask_claude_quick"

echo ""
echo "Registered 3 claude-max-mcp instances on profile '$PROFILE':"
echo "  - ask_claude_codebase : Opus 4.7 scoped to ~/my-main-codebase"
echo "  - ask_claude_general  : Sonnet 4.6 generalist"
echo "  - ask_claude_quick    : Haiku for one-liners"
echo ""
echo "Now update SOUL.md to teach the router when to pick which one."
