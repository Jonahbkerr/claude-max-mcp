#!/usr/bin/env bash
# Wire claude-max-mcp into a Hermes Agent profile, end-to-end.
#
# Usage:
#   ./setup-profile.sh <profile-name> [project-cwd]
#
# Examples:
#   ./setup-profile.sh default
#   ./setup-profile.sh my-codebase /Users/me/my-codebase
#
# Pre-requisites:
#   - Hermes Agent installed (`brew install hermes-agent`)
#   - `claude` CLI installed and logged in (`claude /login`)
#   - claude-max-mcp installed globally OR available via `npx -y claude-max-mcp`
#   - Optional: a profile-specific wrapper (`<profile>` command) in PATH
set -euo pipefail

PROFILE="${1:-}"
PROJECT_CWD="${2:-}"

if [ -z "$PROFILE" ]; then
  echo "usage: $0 <profile-name> [project-cwd]" >&2
  exit 1
fi

HERMES_PROFILE_DIR="$HOME/.hermes/profiles/$PROFILE"
if [ ! -d "$HERMES_PROFILE_DIR" ]; then
  echo "✗ Hermes profile '$PROFILE' not found at $HERMES_PROFILE_DIR" >&2
  echo "  Create it first: hermes profile create $PROFILE" >&2
  exit 2
fi

# Resolve the per-profile wrapper (created by `hermes profile create`)
# Fall back to `hermes --profile <name>` if no wrapper exists.
if command -v "$PROFILE" >/dev/null 2>&1; then
  HCMD=("$PROFILE")
else
  HCMD=(hermes --profile "$PROFILE")
fi

echo "1. Registering claude-max-mcp as an MCP server on profile '$PROFILE'..."
if [ -n "$PROJECT_CWD" ]; then
  "${HCMD[@]}" mcp add claude-max \
    --command npx \
    --args -y claude-max-mcp \
    --env "CLAUDE_MAX_MCP_CWD=$PROJECT_CWD"
else
  "${HCMD[@]}" mcp add claude-max \
    --command npx \
    --args -y claude-max-mcp
fi

echo ""
echo "2. Appending delegation rule to SOUL.md..."
SOUL="$HERMES_PROFILE_DIR/SOUL.md"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADDITIONS="$SCRIPT_DIR/SOUL-additions.md"
if ! grep -q "DELEGATION DIRECTIVE" "$SOUL" 2>/dev/null; then
  # Prepend rather than append — rules at the top of the system prompt
  # carry more weight than rules at the bottom.
  if [ -f "$SOUL" ]; then
    cp "$SOUL" "$SOUL.bak"
    cat "$ADDITIONS" > "$SOUL.new"
    echo "" >> "$SOUL.new"
    cat "$SOUL.bak" >> "$SOUL.new"
    mv "$SOUL.new" "$SOUL"
  else
    cp "$ADDITIONS" "$SOUL"
  fi
  echo "   ✓ SOUL.md updated (backup at $SOUL.bak if it existed)"
else
  echo "   · DELEGATION DIRECTIVE already present, skipping"
fi

echo ""
echo "3. Setting tool_use_enforcement = required..."
"${HCMD[@]}" config set agent.tool_use_enforcement required

echo ""
echo "4. Restarting gateway..."
if "${HCMD[@]}" gateway status >/dev/null 2>&1; then
  "${HCMD[@]}" gateway restart
else
  echo "   · No gateway running for this profile, skipping restart"
fi

echo ""
echo "✓ Done. Profile '$PROFILE' is now wired to delegate to Claude Code (Opus 4.7 by default) via claude-max-mcp."
echo ""
echo "  Sanity-check:"
echo "    1. Send a substantive message to this profile's bot/chat surface."
echo "    2. Watch: tail -f $HERMES_PROFILE_DIR/logs/agent.log | grep ask_claude"
echo "    3. You should see lines like 'tool mcp_claude_max_ask_claude completed (X.XXs, NNN chars)'"
echo ""
echo "  Tip: if the router model answers directly without delegating, wipe session history:"
echo "    ${HCMD[*]} gateway stop"
echo "    rm -f $HERMES_PROFILE_DIR/sessions/*.{jsonl,json} $HERMES_PROFILE_DIR/state.db"
echo "    ${HCMD[*]} gateway start"
