# Changelog

All notable changes to claude-max-mcp.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project loosely follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-05-18

### Changed

- **`examples/hermes/SOUL-additions.md`**: refined the delegation rule from "always call `ask_claude`" into an explicit prompt-enhancement-and-routing pattern. The router model now does no substantive work — its only job is to add context (project / date / scope) and forward the user's original message verbatim to Claude. Includes a concrete template of what the prompt argument should look like.
- **`README.md`**: updated the "cheap router → premium delegate" use case to reflect the prompt-enhancement framing, with a pointer to the SOUL template.

### Notes

No code or API changes in `src/server.js`. This is a docs/integration-pattern refinement based on real-world testing where the older rule allowed the router model to pre-answer some queries from its own knowledge instead of delegating to Claude.

## [0.1.0] - 2026-05-17

### Added

- Initial release. Stdio MCP server that exposes a single tool, `ask_claude`, which spawns `claude -p --model claude-opus-4-7` (or any configured model) and returns the response text. Authenticates via the user's `~/.claude.json` OAuth session, so calls bill against Claude Max / Pro subscription credits rather than an API key.
- Configurable via env vars: `CLAUDE_MAX_MCP_MODEL`, `CLAUDE_MAX_MCP_BIN`, `CLAUDE_MAX_MCP_TIMEOUT_MS`, `CLAUDE_MAX_MCP_CWD`, `CLAUDE_MAX_MCP_TOOL_NAME`, `CLAUDE_MAX_MCP_EXTRA_ARGS`.
- `--smoke` flag for validating the install end-to-end.
- Examples for Claude Code, Cline, Continue, and Hermes Agent.
- Hermes Agent reference integration in `examples/hermes/` with a `setup-profile.sh` one-shot installer and a `SOUL-additions.md` delegation-rule template.
