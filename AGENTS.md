# Project Operating Instructions (`AGENTS.md`)
> **Notice:** This project inherits user persona, confirmation gates, visual standards, and documentation blueprints from the global master `AGENTS.md`. Do not duplicate those rules here.

## 1. Project Tech Stack & Environment
* **Runtime / Language:** TypeScript 5.6+, Node.js v20+ / v24+, Python 3.11+
* **Framework / Host:** Obsidian Plugin API (`obsidian`), esbuild bundler, native Node `http` / `crypto`
* **Target Environment:** Obsidian Desktop (Windows/macOS/Linux)
* **Build Architecture:** Cloud-first compilation via GitHub Actions (`.github/workflows/build.yml`) to keep local disk lean without bloated `node_modules`

## 2. Mandatory Verification & Build Commands
* **Local Build (Optional if npm installed):** `cd plugin && npm run build`
* **Type Check:** `cd plugin && npx tsc --noEmit`
* **Test Suite:** `cd plugin && npm run test`
* **Cloud Build & Artifact Generation:** Push to `main` or trigger `.github/workflows/build.yml`
* **Release Packaging:** Push tag `v*` to trigger `.github/workflows/release.yml`

## 3. Repository Directory Structure & Conventions
* `plugin/` - Obsidian plugin source and configuration.
  * `plugin/src/` - Modular TypeScript source (`main.ts`, `server.ts`, `mcp.ts`, `context.ts`, `editor.ts`, `graph.ts`, `menus.ts`, `settings.ts`, `types.ts`).
  * `plugin/manifest.json` - Obsidian plugin metadata (`obsidian-agent-manager`).
* `scripts/` - Python and PowerShell automation sidecars.
  * `scripts/deeptutor_setup.json` - DeepTutor local configuration pointing to `embeddinggemma-2:270m` on Ollama (`127.0.0.1:11434`).
  * `scripts/deeptutor_sync.py` - Ingestion helper converting EPUBs to Markdown and adding notes to DeepTutor knowledge bases.
  * `scripts/setup_embedding_gemma.ps1` - PowerShell setup script for CPU-throttled Ollama embedding model.
* `docs/` - Core Markdown documentation suite (`PRODUCT.md`, `ARCHITECTURE.md`, `DECISIONS_AND_TRAPS.md`, `VISUAL_LOG.md`).
* `preview/` - On-demand interactive HTML/CSS/JS visual previews, created only upon explicit request.

## 4. Critical Trap Pointers (1-Line Warnings Only)
* **TRAP 1:** Never bind the HTTP server to `0.0.0.0` or allow cross-origin browser requests — see `docs/DECISIONS_AND_TRAPS.md` -> `[TRAP: Loopback-Binding-And-Origin-Rejection]`.
* **TRAP 2:** Do not run concurrent CLI chat turns while DeepTutor backend server is active — see `docs/DECISIONS_AND_TRAPS.md` -> `[TRAP: DeepTutor-Single-Turn-Owner]`.
* **TRAP 3:** Always preserve editor undo history by using active `MarkdownView.editor` methods over disk writes when editing the active note — see `docs/DECISIONS_AND_TRAPS.md` -> `[TRAP: Undo-Stack-Preservation]`.
