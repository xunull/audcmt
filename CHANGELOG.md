# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.1.0] - 2026-05-31

### Added

- MCP (Model Context Protocol) server: Claude Code can now audit scripts directly without opening the browser
  - `audit_script(url)` — download and audit a remote https script
  - `audit_local_file(path)` — audit a local script file
  - `check_risk_gate(url, maxRisk)` — audit and return pass/fail against a risk threshold for automated decisions
  - `get_audit(id)` / `list_audits(limit)` — query audit history
  - MCP resources `audits://list` and `audits://{id}` for browsing history in-conversation
- `npm run mcp:install` — one-command registration into Claude Code's `~/.claude.json` (idempotent, backs up existing config, aborts safely on parse failure)
- `npm run mcp` — start the stdio MCP server

### Changed

- Extracted audit orchestration (download → analyze → persist) from the `/api/audit` route into a shared `src/lib/audit.ts`, so the web UI and MCP server share one code path and stay behavior-consistent

## [0.1.0.0] - 2026-04-27

### Added

- Initial project setup with Next.js 16 and TypeScript
- Audit system for analyzing shell scripts (network ops, git ops, telemetry, dangerous patterns)
- Settings management with SQLite persistence and keychain storage for API keys
- UI components: ScriptViewer (CodeMirror), AuditSummary display
- Vitest + @testing-library/react test framework with initial component tests
- GitHub Actions CI workflow for running tests
- REST API routes for audit operations
