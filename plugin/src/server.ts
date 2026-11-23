import { App } from "obsidian";
import * as http from "node:http";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getVaultBasePath, getWorkspaceSnapshot } from "./context";
import { applyEdit, createNote, openNoteAtLine, readNoteSlice } from "./editor";
import { getActiveAttachments, getNoteGraph, searchVaultMetadata } from "./graph";
import { handleMcpRequest } from "./mcp";
import { PinnedInbox } from "./menus";
import {
  appendVaultFile,
  deleteVaultFile,
  executeObsidianCommand,
  listObsidianCommands,
  listVaultDirectory,
  listVaultTags,
  moveVaultFile,
  patchVaultNote,
  readVaultNotePayload,
  simpleTextSearch,
  writeVaultFile,
} from "./rest-compat";
import { constantTimeEquals, isAllowedHost } from "./security";
import { BridgeSettings, EditRequest } from "./types";

const MAX_BODY_BYTES = 5 * 1024 * 1024;

function readRawBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(err);
    };
    req.on("data", (chunk: Buffer | string) => {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        fail(new Error("Payload too large"));
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", (err) => fail(err instanceof Error ? err : new Error(String(err))));
  });
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readRawBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res: http.ServerResponse, status: number, text: string, contentType = "text/markdown; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(text);
}

function decodeRouteSegment(raw: string): string {
  return raw
    .split("/")
    .map((part) => decodeURIComponent(part))
    .join("/");
}

export class BridgeServer {
  private server: http.Server | null = null;
  private discoveryFile = path.join(os.homedir(), ".obsidian-agent-manager", "vaults.json");

  constructor(private app: App, private getSettings: () => BridgeSettings, private inbox: PinnedInbox) {}

  start(): Promise<void> {
    const { port } = this.getSettings();
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => void this.handleRequest(req, res));
      this.server.on("error", reject);
      this.server.listen(port, "127.0.0.1", () => {
        this.updateDiscovery(true);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    this.updateDiscovery(false);
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      const srv = this.server;
      this.server = null;
      srv.close(() => resolve());
      if (typeof srv.closeAllConnections === "function") {
        srv.closeAllConnections();
      }
    });
  }

  private updateDiscovery(register: boolean) {
    try {
      const dir = path.dirname(this.discoveryFile);
      fs.mkdirSync(dir, { recursive: true });
      let data: Record<string, unknown> = {};
      if (fs.existsSync(this.discoveryFile)) {
        data = JSON.parse(fs.readFileSync(this.discoveryFile, "utf8")) as Record<string, unknown>;
      }
      const vaultPath = getVaultBasePath(this.app) || this.app.vault.getName();
      if (register) {
        data[vaultPath] = {
          vaultName: this.app.vault.getName(),
          port: this.getSettings().port,
          url: `http://127.0.0.1:${this.getSettings().port}`,
          mcpUrl: `http://127.0.0.1:${this.getSettings().port}/mcp`,
        };
      } else {
        delete data[vaultPath];
      }
      const tmpFile = `${this.discoveryFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), "utf8");
      fs.renameSync(tmpFile, this.discoveryFile);
    } catch {
      // Non-fatal discovery write failure
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const { port, apiToken } = this.getSettings();
    if (req.headers.origin) {
      return sendJson(res, 403, { error: "Browser Origin headers are rejected for local security" });
    }
    if (!isAllowedHost(req.headers.host, port)) {
      return sendJson(res, 403, { error: "Invalid Host header (DNS rebinding protection)" });
    }

    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true, vaultName: this.app.vault.getName(), version: "0.2.0" });
    }

    const auth = req.headers.authorization ?? "";
    const expected = `Bearer ${apiToken}`;
    const isAuthenticated = Boolean(apiToken && constantTimeEquals(auth, expected));

    // Local REST API compatible root status endpoint (GET /)
    if (req.method === "GET" && url.pathname === "/") {
      return sendJson(res, 200, {
        status: "OK",
        authenticated: isAuthenticated,
        service: "Obsidian Agent Manager",
        vaultName: this.app.vault.getName(),
        versions: {
          obsidian: "1.x",
          self: "0.2.0",
        },
        manifest: {
          id: "obsidian-agent-manager",
          name: "Obsidian Agent Manager",
          version: "0.2.0",
        },
      });
    }

    if (!isAuthenticated) {
      return sendJson(res, 401, { error: "Unauthorized" });
    }

    try {
      // --- Native Obsidian Agent Manager endpoints ---
      if (req.method === "GET" && url.pathname === "/context") {
        return sendJson(res, 200, getWorkspaceSnapshot(this.app));
      }
      if (req.method === "GET" && url.pathname === "/context/attachments") {
        return sendJson(res, 200, getActiveAttachments(this.app));
      }
      if (req.method === "GET" && url.pathname === "/note/graph") {
        const p = url.searchParams.get("path") ?? this.app.workspace.getActiveFile()?.path ?? "";
        const graph = getNoteGraph(this.app, p);
        return graph ? sendJson(res, 200, graph) : sendJson(res, 404, { error: "Note not found" });
      }
      if (req.method === "GET" && url.pathname === "/note/read") {
        const p = url.searchParams.get("path") ?? undefined;
        const heading = url.searchParams.get("heading") ?? undefined;
        const startLine = url.searchParams.get("startLine") ? Number(url.searchParams.get("startLine")) : undefined;
        const endLine = url.searchParams.get("endLine") ? Number(url.searchParams.get("endLine")) : undefined;
        return sendJson(res, 200, await readNoteSlice(this.app, p, heading, startLine, endLine));
      }
      if (req.method === "POST" && url.pathname === "/note/create") {
        const body = await readJsonBody(req);
        return sendJson(
          res,
          200,
          await createNote(this.app, String(body.path ?? ""), String(body.content ?? ""), body.overwrite === true)
        );
      }
      if (req.method === "POST" && url.pathname === "/note/move") {
        const body = await readJsonBody(req);
        return sendJson(res, 200, await moveVaultFile(this.app, String(body.from ?? ""), String(body.to ?? "")));
      }
      if (req.method === "GET" && url.pathname === "/search") {
        const q = url.searchParams.get("q") ?? "";
        return sendJson(res, 200, { results: searchVaultMetadata(this.app, q) });
      }
      if (req.method === "GET" && url.pathname === "/inbox") {
        return sendJson(res, 200, { items: this.inbox.list() });
      }
      if (req.method === "POST" && url.pathname === "/inbox/clear") {
        this.inbox.clear();
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/edit") {
        const body = await readJsonBody(req);
        return sendJson(res, 200, await applyEdit(this.app, body as unknown as EditRequest));
      }
      if (req.method === "POST" && url.pathname === "/open") {
        const body = await readJsonBody(req);
        return sendJson(res, 200, await openNoteAtLine(this.app, String(body.path ?? ""), body.line as number | undefined));
      }
      if (req.method === "POST" && url.pathname === "/mcp") {
        const body = await readJsonBody(req);
        const result = await handleMcpRequest(this.app, this.inbox, body);
        if (result === null) {
          res.writeHead(202);
          res.end();
          return;
        }
        return sendJson(res, 200, result);
      }

      // --- Local REST API / cli-anything-obsidian compatibility routes ---
      if (req.method === "GET" && (url.pathname === "/tags" || url.pathname === "/tags/")) {
        return sendJson(res, 200, listVaultTags(this.app));
      }

      if (req.method === "GET" && (url.pathname === "/commands" || url.pathname === "/commands/")) {
        return sendJson(res, 200, listObsidianCommands(this.app));
      }

      if (req.method === "POST" && url.pathname.startsWith("/commands/")) {
        const cmdId = decodeURIComponent(url.pathname.slice("/commands/".length).replace(/\/+$/, ""));
        return sendJson(res, 200, executeObsidianCommand(this.app, cmdId));
      }

      if (req.method === "POST" && url.pathname.startsWith("/open/")) {
        const targetPath = decodeRouteSegment(url.pathname.slice("/open/".length));
        return sendJson(res, 200, await openNoteAtLine(this.app, targetPath));
      }

      if (req.method === "POST" && (url.pathname === "/search/simple" || url.pathname === "/search/simple/")) {
        const q = url.searchParams.get("query") ?? "";
        const ctxLen = Number(url.searchParams.get("contextLength") ?? "100");
        return sendJson(res, 200, await simpleTextSearch(this.app, q, ctxLen));
      }

      if (req.method === "POST" && (url.pathname === "/search" || url.pathname === "/search/")) {
        const raw = await readRawBody(req);
        const q = url.searchParams.get("query") ?? raw.trim();
        return sendJson(res, 200, await simpleTextSearch(this.app, q, 100));
      }

      if (url.pathname === "/active" || url.pathname === "/active/") {
        const accept = String(req.headers.accept ?? "");
        if (req.method === "GET") {
          const note = await readVaultNotePayload(this.app);
          if (accept.includes("application/vnd.olrapi.note+json") || accept.includes("application/json")) {
            return sendJson(res, 200, note);
          }
          return sendText(res, 200, note.content);
        }
        if (req.method === "PUT") {
          const active = this.app.workspace.getActiveFile();
          if (!active) return sendJson(res, 404, { error: "No active note" });
          const body = await readRawBody(req);
          await writeVaultFile(this.app, active.path, body);
          res.writeHead(204);
          res.end();
          return;
        }
        if (req.method === "POST") {
          const body = await readRawBody(req);
          await appendVaultFile(this.app, undefined, body);
          res.writeHead(204);
          res.end();
          return;
        }
        if (req.method === "PATCH") {
          const body = await readRawBody(req);
          const targetType = String(req.headers["target-type"] ?? "") as "heading" | "frontmatter" | "block" | "";
          const target = req.headers.target ? decodeURIComponent(String(req.headers.target)) : undefined;
          const operation = String(req.headers.operation ?? "replace") as "append" | "prepend" | "replace";
          await patchVaultNote(this.app, undefined, {
            targetType: targetType || undefined,
            target,
            operation,
            content: body,
          });
          res.writeHead(204);
          res.end();
          return;
        }
        if (req.method === "DELETE") {
          const active = this.app.workspace.getActiveFile();
          if (!active) return sendJson(res, 404, { error: "No active note" });
          await deleteVaultFile(this.app, active.path);
          res.writeHead(204);
          res.end();
          return;
        }
      }

      if (url.pathname === "/vault" || url.pathname === "/vault/" || url.pathname.startsWith("/vault/")) {
        const subRaw = url.pathname.length > "/vault/".length ? url.pathname.slice("/vault/".length) : "";
        const isDirectoryRequest = url.pathname === "/vault" || url.pathname.endsWith("/");
        const decoded = subRaw ? decodeRouteSegment(subRaw) : "";
        const accept = String(req.headers.accept ?? "");

        if (req.method === "GET") {
          if (isDirectoryRequest) {
            return sendJson(res, 200, listVaultDirectory(this.app, decoded));
          }
          const note = await readVaultNotePayload(this.app, decoded);
          if (accept.includes("application/vnd.olrapi.note+json") || accept.includes("application/json")) {
            return sendJson(res, 200, note);
          }
          return sendText(res, 200, note.content);
        }
        if (req.method === "PUT") {
          const body = await readRawBody(req);
          await writeVaultFile(this.app, decoded, body);
          res.writeHead(204);
          res.end();
          return;
        }
        if (req.method === "POST") {
          const body = await readRawBody(req);
          await appendVaultFile(this.app, decoded, body);
          res.writeHead(204);
          res.end();
          return;
        }
        if (req.method === "PATCH") {
          const body = await readRawBody(req);
          const targetType = String(req.headers["target-type"] ?? "") as "heading" | "frontmatter" | "block" | "";
          const target = req.headers.target ? decodeURIComponent(String(req.headers.target)) : undefined;
          const operation = String(req.headers.operation ?? "replace") as "append" | "prepend" | "replace";
          await patchVaultNote(this.app, decoded, {
            targetType: targetType || undefined,
            target,
            operation,
            content: body,
          });
          res.writeHead(204);
          res.end();
          return;
        }
        if (req.method === "DELETE") {
          await deleteVaultFile(this.app, decoded);
          res.writeHead(204);
          res.end();
          return;
        }
      }

      return sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.toLowerCase().includes("not found") ? 404 : 400;
      return sendJson(res, status, { error: msg });
    }
  }
}
