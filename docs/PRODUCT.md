# Product Intent & Feature Map (`PRODUCT.md`)
> **1-Line Summary:** The permanent source of truth for what Obsidian Agent Manager does and how it behaves across external agent harnesses and DeepTutor.

## 1. Core Vision & User Experience Intent
* **What This App Does (Plain English):** Obsidian Agent Manager is a zero-binary-bloat Obsidian plugin and sidecar system that turns an Obsidian vault into a live, controllable context provider for external AI agent harnesses (Google Antigravity, Claude Code, Gemini CLI, Cursor, Codex) and connects it to local hybrid RAG with DeepTutor and Ollama.
* **How It Must Feel to Use:** Lightweight, instantaneous, and invisible to system resources. It runs on loopback `127.0.0.1`, consumes less than 100 KB in Obsidian without embedded binaries, keeps RAM low (<200 MB), throttles local embeddings to 4 CPU threads so the PC never lags, and preserves Obsidian editor undo (`Ctrl+Z`) completely.

## 2. Active Features (Do Not Break)

### [FEATURE: Localhost-Bridge-Server] | Aliases: rest server, loopback http, health check, bearer auth
> **1-Line Summary:** Secure loopback HTTP server on `127.0.0.1:27125` exposing live vault context, note reading, and graph inspection with Bearer token authentication and CSRF origin blocking.
* **User Intention (Non-Negotiable):** Allow external agents to query workspace status without exposing the user to DNS rebinding or unauthorized local network access.
* **Visual / UI Behavior:** Configured via plugin settings tab; runs silently in the background on Obsidian launch.
* **Code Anchors (Grep Targets):**
  * `plugin/src/server.ts` -> `BridgeServer`, `handleRequest`
  * `plugin/src/main.ts` -> `AgentManagerPlugin`

### [FEATURE: Live-Workspace-Context] | Aliases: active file, open tabs, cursor position, active heading, search state
> **1-Line Summary:** Live snapshot of the user's active file, open editor tabs, cursor position, heading hierarchy, highlighted text, and global search query.
* **User Intention (Non-Negotiable):** Agents must know exactly what note the user is reading or editing, what heading they are under, and what text they selected in real time.
* **Visual / UI Behavior:** Reflected whenever the agent queries `GET /context` or calls the `obsidian_get_context` MCP tool.
* **Code Anchors (Grep Targets):**
  * `plugin/src/context.ts` -> `getWorkspaceSnapshot`, `getActiveHeading`, `getOpenTabs`

### [FEATURE: Graph-And-Attachment-Traversal] | Aliases: wikilinks, backlinks, attachments, embeds, pdf, epub
> **1-Line Summary:** Resolves outgoing wikilinks, incoming backlinks, and embedded attachments (images, PDFs, EPUBs) to absolute disk paths for multimodal AI harnesses.
* **User Intention (Non-Negotiable):** External multimodal agents must be able to read referenced PDFs and images directly from disk without manual copying.
* **Visual / UI Behavior:** Queried via `GET /note/graph` or `GET /context/attachments`.
* **Code Anchors (Grep Targets):**
  * `plugin/src/graph.ts` -> `getNoteGraph`, `getActiveAttachments`

### [FEATURE: Undo-Safe-Editing] | Aliases: active note edit, replace selection, atomic file edit, frontmatter patch
> **1-Line Summary:** Applies edits to the active note via CodeMirror editor transactions so `Ctrl+Z` undo is preserved, falling back to atomic file writes for inactive notes.
* **User Intention (Non-Negotiable):** Edits suggested or applied by an AI agent must never corrupt notes or break the user's standard Obsidian undo history.
* **Visual / UI Behavior:** Modifies note content in place with immediate visual feedback in the active editor.
* **Code Anchors (Grep Targets):**
  * `plugin/src/editor.ts` -> `applyEdit`

### [FEATURE: Built-In-Streamable-MCP-Server] | Aliases: mcp server, jsonrpc, tools list, antigravity mcp, claude code mcp
> **1-Line Summary:** Built-in JSON-RPC 2.0 Streamable HTTP Model Context Protocol endpoint on `POST /mcp` exposing 8 tools (including note creation) to external coding agents without extra Node processes.
* **User Intention (Non-Negotiable):** One-click integration with modern AI harnesses (Antigravity, Claude Code, Cursor) using standard MCP configuration.
* **Visual / UI Behavior:** Settings tab provides a "Copy MCP Config" button that copies ready-to-paste JSON.
* **Code Anchors (Grep Targets):**
  * `plugin/src/mcp.ts` -> `handleMcpRequest`, `MCP_TOOLS`
  * `plugin/src/settings.ts` -> `AgentManagerSettingTab`

### [FEATURE: Safe-Note-Creation-And-Security-Hardening] | Aliases: create note, security helpers, host header check, path traversal guard
> **1-Line Summary:** Safely creates new Markdown notes (`/note/create` and `obsidian_create_note`) with automatic parent directory creation, path traversal defense, and host header validation.
* **User Intention (Non-Negotiable):** Enable external agents to create new notes while strictly preventing directory traversal outside the vault and DNS-rebinding via host header spoofing.
* **Visual / UI Behavior:** Live status bar element displays active port and pinned item count; command palette commands allow hotkey-based pinning.
* **Code Anchors (Grep Targets):**
  * `plugin/src/editor.ts` -> `createNote`
  * `plugin/src/security.ts` -> `constantTimeEquals`, `isAllowedHost`, `normalizeSafeVaultPath`
  * `plugin/src/main.ts` -> `statusBarEl`, `addCommand`

### [FEATURE: Pinned-Inbox-And-Context-Menus] | Aliases: right click menu, send to agent, pin attachment, inbox
> **1-Line Summary:** Right-click context menus in the editor and file explorer to explicitly push selected text, notes, or attachments into a 25-item ring buffer inbox.
* **User Intention (Non-Negotiable):** Give the user a quick physical gesture inside Obsidian to flag specific text or files for AI attention.
* **Visual / UI Behavior:** "Send selection to Agent Manager" in editor context menu; "Pin file/attachment to Agent Manager" in file explorer.
* **Code Anchors (Grep Targets):**
  * `plugin/src/menus.ts` -> `PinnedInbox`, `attachEditorMenu`, `attachFileMenu`

### [FEATURE: DeepTutor-And-EPUB-Sync] | Aliases: deeptutor sync, epub conversion, knowledge base ingestion, hybrid rag
> **1-Line Summary:** Python automation script that reads the agent inbox, converts `.epub` books into chaptered Markdown, and ingests notes and attachments into DeepTutor knowledge bases.
* **User Intention (Non-Negotiable):** Seamless book and research paper ingestion into local hybrid RAG without freezing the workstation.
* **Visual / UI Behavior:** Command-line CLI `python scripts/deeptutor_sync.py --kb <kb-name>`.
* **Code Anchors (Grep Targets):**
  * `scripts/deeptutor_sync.py` -> `fetch_bridge_paths`, `convert_epub_to_markdown`, `ingest_into_deeptutor`

### [FEATURE: Shared-Ollama-Embedding-Gemma-2] | Aliases: ollama embeddings, embeddinggemma-2, cpu throttling, 768 dimensions
> **1-Line Summary:** Shared local embedding service on `127.0.0.1:11434` serving Google's `embeddinggemma-2:270m` with CPU-friendly limits (4 threads, 5m keep-alive).
* **User Intention (Non-Negotiable):** Zero redundant embedding models in RAM; both DeepTutor and vault RAG share one compact 768-dimension local model.
* **Visual / UI Behavior:** Configured via `scripts/deeptutor_setup.json` and persistent user environment variables.
* **Code Anchors (Grep Targets):**
  * `scripts/deeptutor_setup.json` -> `embedding`
  * `scripts/setup_embedding_gemma.ps1` -> `OLLAMA_NUM_THREAD`

## 3. Planned Features & App-Merge Wishlist

### [WISHLIST: Diff-Confirmation-Modal] | Aliases: visual diff, change confirmation, review modal
> **1-Line Summary:** Optional visual modal in Obsidian to preview proposed agent edits as a side-by-side diff before accepting or rejecting.
* **User Intention:** Allow human-in-the-loop inspection of multi-section edits for high-stakes research notes.
* **Target Integration Point:** Connects to `plugin/src/editor.ts` controlled by a toggle in `plugin/src/settings.ts`.

### [FEATURE: UI-UX-Parity-And-Accessibility] | Aliases: ribbon bot, inspector modal, confirm modal, status bar, styles
> **1-Line Summary:** Introduces bot ribbon launcher, BridgeInspectorModal, ConfirmModal guardrail, live Status Bar monitor, and dedicated zero-hex plugin/styles.css.
* **User Intention (Non-Negotiable):** Provide intuitive GUI inspector for external agent localhost bridges, safe confirmation before connection teardown, and real-time status bar telemetry.
* **Visual / UI Behavior:** Ribbon bot icon opens bridge inspector; status bar displays connection health; accessible semantic modal dialogs.
* **Code Anchors (Grep Targets):** `plugin/src/ui/inspector-modal.ts`, `plugin/src/ui/confirm-modal.ts`, `plugin/src/main.ts`, `plugin/styles.css`
