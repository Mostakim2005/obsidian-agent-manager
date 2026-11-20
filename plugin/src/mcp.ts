import { App } from "obsidian";
import { getWorkspaceSnapshot } from "./context";
import { applyEdit, createNote, openNoteAtLine, readNoteSlice } from "./editor";
import { getActiveAttachments, getNoteGraph, searchVaultMetadata } from "./graph";
import { PinnedInbox } from "./menus";
import { EditRequest } from "./types";

const MCP_TOOLS = [
  {
    name: "obsidian_get_context",
    description: "Get live Obsidian workspace context: active file, open tabs, cursor line, active heading, selected text, and active search query.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "obsidian_get_inbox",
    description: "Get selections, notes, or attachments explicitly pinned by the user via Obsidian's right-click menu.",
    inputSchema: { type: "object", properties: { clear: { type: "boolean" } } },
  },
  {
    name: "obsidian_get_graph",
    description: "Get outgoing wikilinks, incoming backlinks, headings, and resolved embedded attachments (with disk paths) for a note.",
    inputSchema: { type: "object", properties: { path: { type: "string" } } },
  },
  {
    name: "obsidian_read_note",
    description: "Read a note in full, by heading name, or by 1-indexed line range.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        heading: { type: "string" },
        startLine: { type: "number" },
        endLine: { type: "number" },
      },
    },
  },
  {
    name: "obsidian_edit_note",
    description: "Edit the active note (Ctrl+Z undo-safe) or a background note via replace_selection, replace_lines, replace_heading, append, or patch_frontmatter.",
    inputSchema: {
      type: "object",
      required: ["mode"],
      properties: {
        path: { type: "string" },
        mode: { type: "string", enum: ["replace_selection", "replace_lines", "replace_heading", "append", "patch_frontmatter"] },
        content: { type: "string" },
        startLine: { type: "number" },
        endLine: { type: "number" },
        heading: { type: "string" },
        frontmatterPatch: { type: "object" },
      },
    },
  },
  {
    name: "obsidian_create_note",
    description: "Create a new Markdown note in the vault (optionally creating parent folders).",
    inputSchema: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        overwrite: { type: "boolean" },
      },
    },
  },
  {
    name: "obsidian_open_note",
    description: "Open a note in Obsidian and optionally jump to a 1-indexed line.",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string" }, line: { type: "number" } },
    },
  },
  {
    name: "obsidian_search_vault",
    description: "Search vault notes by path, tags, or headings.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: { query: { type: "string" }, limit: { type: "number" } },
    },
  },
];

export async function handleMcpRequest(app: App, inbox: PinnedInbox, rpc: Record<string, unknown>) {
  const id = rpc.id ?? null;
  const method = String(rpc.method ?? "");
  const params = (rpc.params ?? {}) as Record<string, unknown>;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "obsidian-agent-manager", version: "0.1.0" },
      },
    };
  }

  if (method === "notifications/initialized") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } };
  }

  if (method === "tools/call") {
    const toolName = String(params.name ?? "");
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    try {
      let data: unknown;
      switch (toolName) {
        case "obsidian_get_context":
          data = { ...getWorkspaceSnapshot(app), activeAttachments: getActiveAttachments(app).attachments };
          break;
        case "obsidian_get_inbox":
          data = inbox.list();
          if (args.clear === true) inbox.clear();
          break;
        case "obsidian_get_graph": {
          const target = typeof args.path === "string" ? args.path : app.workspace.getActiveFile()?.path;
          data = target ? getNoteGraph(app, target) : null;
          break;
        }
        case "obsidian_read_note":
          data = await readNoteSlice(
            app,
            args.path as string | undefined,
            args.heading as string | undefined,
            args.startLine as number | undefined,
            args.endLine as number | undefined
          );
          break;
        case "obsidian_edit_note":
          data = await applyEdit(app, args as unknown as EditRequest);
          break;
        case "obsidian_create_note":
          data = await createNote(app, String(args.path ?? ""), String(args.content ?? ""), args.overwrite === true);
          break;
        case "obsidian_open_note":
          data = await openNoteAtLine(app, String(args.path), args.line as number | undefined);
          break;
        case "obsidian_search_vault":
          data = searchVaultMetadata(app, String(args.query ?? ""), (args.limit as number | undefined) ?? 25);
          break;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
      return {
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] },
      };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          isError: true,
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
        },
      };
    }
  }

  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}
