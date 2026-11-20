# Visual Feature & Change Log (`VISUAL_LOG.md`)
> **1-Line Summary:** Plain-English, color-coded Obsidian-compatible Mermaid flowcharts explaining how each major flow in Obsidian Agent Manager operates end to end.

## Feature & Change Flowcharts

### [VISUAL: Agent-Context-And-Inspection-Flow] | Aliases: get context, mcp context, active note inspection
> **1-Line Summary:** How an external AI harness queries live Obsidian workspace state and receives resolved attachments and cursor context.

* **Plain-English Walkthrough:** When an agent queries `/context` or calls the `obsidian_get_context` MCP tool, the plugin inspects the active editor leaf, extracts the cursor line, resolves the active markdown heading, gathers all open editor tabs, and collects file paths. If attachments (images, PDFs, EPUBs) are linked, it resolves them to absolute file paths on disk so the external agent can inspect them directly.

```mermaid
flowchart TD
    %% Color Definitions (Obsidian & GitHub compatible)
    classDef startNode fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff
    classDef processNode fill:#0f766e,stroke:#115e59,color:#ffffff
    classDef outputNode fill:#15803d,stroke:#14532d,color:#ffffff
    classDef trapNode fill:#b91c1c,stroke:#7f1d1d,color:#ffffff

    Start([AI Harness sends GET /context or obsidian_get_context]):::startNode --> AuthCheck{Bearer Token Valid?}:::processNode
    AuthCheck -->|No| Rejection[Return 401 Unauthorized]:::trapNode
    AuthCheck -->|Yes| OriginCheck{Has Origin Header?}:::processNode
    OriginCheck -->|Yes| Forbidden[Return 403 Forbidden - CSRF Guard]:::trapNode
    OriginCheck -->|No| Snapshot[Gather Workspace Snapshot]:::processNode

    Snapshot --> Leaves[Iterate Workspace Leaves for Open Tabs]:::processNode
    Snapshot --> Editor[Inspect Active MarkdownView: Cursor, Heading, Selection]:::processNode
    Snapshot --> Attachments[Resolve Linked Attachments to Absolute Disk Paths]:::processNode

    Leaves --> Assemble[Assemble Snapshot JSON Payload]:::processNode
    Editor --> Assemble
    Attachments --> Assemble

    Assemble --> Done([Return Complete Live Context to Agent]):::outputNode

    subgraph Legend["Legend (Color Guide)"]
        L1([Blue = Starting Request / Entry Point]):::startNode
        L2[Teal = Processing & Extraction Step]:::processNode
        L3([Green = Successful Final Output]):::outputNode
        L4[Red = Security Guard & Rejection]:::trapNode
    end
```

* **Code Anchors (Grep Targets):**
  * `plugin/src/server.ts` -> `handleRequest`
  * `plugin/src/context.ts` -> `getWorkspaceSnapshot`, `getActiveHeading`
  * `plugin/src/graph.ts` -> `getActiveAttachments`

---

### [VISUAL: EPUB-To-DeepTutor-RAG-Ingestion-Flow] | Aliases: epub conversion, deeptutor sync, hybrid rag ingestion
> **1-Line Summary:** How pinned items and EPUB attachments are converted to Markdown and ingested into DeepTutor knowledge bases.

* **Plain-English Walkthrough:** The user right-clicks a note, PDF, or EPUB in Obsidian to pin it to the Agent Manager inbox. Running `python scripts/deeptutor_sync.py --kb <kb-name>` fetches the pinned items over localhost. If any file is an `.epub`, it extracts each chapter into a clean `.md` file with proper headings in the staging folder. It then calls `deeptutor kb add`, which embeds all content through Ollama (`embeddinggemma-2:270m`) using 4 CPU threads.

```mermaid
flowchart TD
    %% Color Definitions (Obsidian & GitHub compatible)
    classDef startNode fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff
    classDef processNode fill:#0f766e,stroke:#115e59,color:#ffffff
    classDef outputNode fill:#15803d,stroke:#14532d,color:#ffffff

    UserPin([User Right-Clicks Note / PDF / EPUB -> Pin to Agent Manager]):::startNode --> InboxQueue[Stored in Memory: PinnedInbox Ring Buffer]:::processNode
    SyncCLI([Run: python scripts/deeptutor_sync.py --kb research]):::startNode --> Fetch[Fetch Items from GET /inbox]:::processNode
    InboxQueue --> Fetch

    Fetch --> TypeCheck{Is file an .epub?}:::processNode
    TypeCheck -->|Yes| Convert[Convert EPUB Chapters to Markdown in .staging/]:::processNode
    TypeCheck -->|No| Direct[Pass Raw Markdown or PDF Path]:::processNode

    Convert --> Ingest[Execute: deeptutor kb add research --doc ...]:::processNode
    Direct --> Ingest

    Ingest --> Ollama[Compute Embeddings via Ollama on 127.0.0.1:11434]:::processNode
    Ollama --> KnowledgeBase([DeepTutor Hybrid Knowledge Base Ready for Query]):::outputNode

    subgraph Legend["Legend (Color Guide)"]
        L1([Blue = User Action & CLI Trigger]):::startNode
        L2[Teal = Processing & Conversion Step]:::processNode
        L3([Green = Indexed Knowledge Base Ready]):::outputNode
    end
```

* **Code Anchors (Grep Targets):**
  * `plugin/src/menus.ts` -> `attachFileMenu`, `PinnedInbox`
  * `scripts/deeptutor_sync.py` -> `convert_epub_to_markdown`, `ingest_into_deeptutor`
  * `scripts/deeptutor_setup.json` -> `embedding`

---

### [VISUAL: Safe-Note-Creation-And-Path-Validation-Flow] | Aliases: create note flow, path validation, traversal check
> **1-Line Summary:** How note creation requests are validated against path traversal before safely creating folders and files in the vault.

* **Plain-English Walkthrough:** When an agent invokes `/note/create` or `obsidian_create_note`, the target path passes through `normalizeSafeVaultPath()`. If it contains `..` or leading slashes, the request fails with a security error. If valid, parent folders are automatically verified or created, and the note is safely written without overwriting existing files unless explicitly flagged.

```mermaid
flowchart TD
    %% Color Definitions (Obsidian & GitHub compatible)
    classDef startNode fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff
    classDef processNode fill:#0f766e,stroke:#115e59,color:#ffffff
    classDef outputNode fill:#15803d,stroke:#14532d,color:#ffffff
    classDef trapNode fill:#b91c1c,stroke:#7f1d1d,color:#ffffff

    Start([Agent calls /note/create or obsidian_create_note]):::startNode --> HostCheck{Host Header Allowed?}:::processNode
    HostCheck -->|No| BlockHost[Return 403 Invalid Host - Rebinding Guard]:::trapNode
    HostCheck -->|Yes| PathCheck{normalizeSafeVaultPath valid?}:::processNode

    PathCheck -->|Contains '..' or invalid syntax| BlockPath[Throw Error: Invalid Vault Path]:::trapNode
    PathCheck -->|Valid| ExistsCheck{File already exists?}:::processNode

    ExistsCheck -->|Yes & overwrite=false| Conflict[Error: Note already exists]:::trapNode
    ExistsCheck -->|Yes & overwrite=true| Modify[Overwrite existing file via modify]:::processNode
    ExistsCheck -->|No| FolderCheck{Parent folder exists?}:::processNode

    FolderCheck -->|No| CreateFolder[Create parent folder structure]:::processNode
    FolderCheck -->|Yes| CreateFile[Create note via app.vault.create]:::processNode
    CreateFolder --> CreateFile

    Modify --> Success([Return JSON: ok: true, vaultPath]):::outputNode
    CreateFile --> Success

    subgraph Legend["Legend (Color Guide)"]
        L1([Blue = Request Entry]):::startNode
        L2[Teal = Validation & File System Logic]:::processNode
        L3([Green = Note Created / Updated Successfully]):::outputNode
        L4[Red = Security Rejection / Error Path]:::trapNode
    end
```

* **Code Anchors (Grep Targets):**
  * `plugin/src/security.ts` -> `normalizeSafeVaultPath`, `isAllowedHost`
  * `plugin/src/editor.ts` -> `createNote`
  * `plugin/src/server.ts` -> `handleRequest`
