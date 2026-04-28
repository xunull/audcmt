# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0.0] - 2026-04-27

### Added

- Initial project setup with Next.js 16 and TypeScript
- Audit system for analyzing shell scripts (network ops, git ops, telemetry, dangerous patterns)
- Settings management with SQLite persistence and keychain storage for API keys
- UI components: ScriptViewer (CodeMirror), AuditSummary display
- Vitest + @testing-library/react test framework with initial component tests
- GitHub Actions CI workflow for running tests
- REST API routes for audit operations
