#!/usr/bin/env node
/**
 * claude-max-mcp
 *
 * A stdio MCP server that exposes a single tool — ask_claude — which spawns
 * the `claude` CLI in non-interactive print mode and returns its response.
 *
 * Because Claude Code authenticates via OAuth stored in ~/.claude.json by
 * default, the call is billed against your Claude Max / Pro subscription
 * credits, NOT against any Anthropic API key configured in your environment.
 * Result: any MCP-compatible agent (Hermes Agent, Cline, Continue, Claude
 * Code itself, custom agents, etc.) can delegate work to Claude — typically
 * Opus 4.7 — without burning API credits.
 *
 * Configurable via environment variables (set them on the MCP client side
 * when registering this server):
 *
 *   CLAUDE_MAX_MCP_MODEL          — model alias or full ID
 *                                   (default: "claude-opus-4-7")
 *   CLAUDE_MAX_MCP_BIN            — path to the `claude` binary
 *                                   (default: "claude" from PATH)
 *   CLAUDE_MAX_MCP_TIMEOUT_MS     — max wait for a single delegated call
 *                                   (default: 600000 = 10 minutes)
 *   CLAUDE_MAX_MCP_CWD            — working directory for the claude
 *                                   subprocess (default: caller's HOME)
 *   CLAUDE_MAX_MCP_TOOL_NAME      — override tool name exposed to clients
 *                                   (default: "ask_claude")
 *   CLAUDE_MAX_MCP_EXTRA_ARGS     — additional space-separated args to pass
 *                                   to `claude -p` (advanced)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';

const MODEL = process.env.CLAUDE_MAX_MCP_MODEL || 'claude-opus-4-7';
const CLAUDE_BIN = process.env.CLAUDE_MAX_MCP_BIN || 'claude';
const TIMEOUT_MS = parseInt(process.env.CLAUDE_MAX_MCP_TIMEOUT_MS || '600000', 10);
const CWD = process.env.CLAUDE_MAX_MCP_CWD || homedir();
const TOOL_NAME = process.env.CLAUDE_MAX_MCP_TOOL_NAME || 'ask_claude';
const EXTRA_ARGS = (process.env.CLAUDE_MAX_MCP_EXTRA_ARGS || '')
  .split(/\s+/)
  .filter(Boolean);

const TOOL_DESCRIPTION =
  `Delegate a substantive task to Claude Code, billed against the user's Claude Max / Pro subscription ` +
  `(model: ${MODEL}). Use this for: code generation, deep reasoning, multi-step engineering, refactoring, ` +
  `or anything that needs more capability than the routing model can reliably deliver. The receiver has NO ` +
  `memory of the calling agent's conversation — include everything Claude needs in the prompt argument: ` +
  `the user's verbatim request, project / file context, relevant prior messages, and what kind of output ` +
  `you want back. Returns Claude's full text response.`;

// ─── Smoke test mode ─────────────────────────────────────────────────────────
// `node src/server.js --smoke` validates that the claude CLI is reachable and
// authenticated. Exits 0 on success, non-zero on failure. Useful for CI and
// onboarding scripts.
if (process.argv.includes('--smoke')) {
  const child = spawn(CLAUDE_BIN, ['-p', 'reply with exactly: smoke OK', '--model', MODEL], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: CWD,
    env: { ...process.env, HOME: process.env.HOME || homedir() },
  });
  let stdout = '';
  child.stdout.on('data', (c) => { stdout += c; });
  child.on('close', (code) => {
    const ok = code === 0 && stdout.trim().startsWith('smoke OK');
    if (ok) {
      console.log(`✓ claude-max-mcp smoke test passed (model: ${MODEL})`);
      process.exit(0);
    }
    console.error(`✗ smoke test failed (exit ${code}). Output:`);
    console.error(stdout);
    process.exit(1);
  });
  setTimeout(() => {
    console.error(`✗ smoke test timed out after ${TIMEOUT_MS / 1000}s`);
    child.kill('SIGTERM');
    process.exit(2);
  }, Math.min(TIMEOUT_MS, 120000));
  // Don't continue to MCP server boot
} else {
  await runMcpServer();
}

async function runMcpServer() {
  const server = new Server(
    { name: 'claude-max-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description:
                "The full prompt to send to Claude. Claude has no access to the calling agent's conversation — include all context here.",
            },
          },
          required: ['prompt'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== TOOL_NAME) {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }
    const prompt = request.params.arguments?.prompt;
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Missing or invalid required argument: prompt (string)');
    }

    const args = ['-p', prompt, '--model', MODEL, ...EXTRA_ARGS];
    const result = await new Promise((resolve, reject) => {
      const child = spawn(CLAUDE_BIN, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: CWD,
        env: { ...process.env, HOME: process.env.HOME || homedir() },
      });
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`${TOOL_NAME} timed out after ${TIMEOUT_MS / 1000}s`));
      }, TIMEOUT_MS);
      child.stdout.on('data', (c) => { stdout += c; });
      child.stderr.on('data', (c) => { stderr += c; });
      child.on('error', (err) => { clearTimeout(timeout); reject(err); });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          // Filter known noise (SessionEnd hook errors from user's claude config).
          const cleanStderr = stderr
            .split('\n')
            .filter((line) => !line.includes('SessionEnd hook'))
            .join('\n')
            .trim();
          reject(new Error(`${CLAUDE_BIN} exited ${code}: ${cleanStderr || '(no stderr)'}`));
        } else {
          resolve(stdout.trim());
        }
      });
    });

    return { content: [{ type: 'text', text: result }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
