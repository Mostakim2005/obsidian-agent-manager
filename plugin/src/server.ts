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
import { constantTimeEquals, isAllowedHost } from "./security";
import { BridgeSettings, EditRequest } from "./types";

const MAX_BODY_BYTES = 5 * 1024 * 1024;

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
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
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", (err) => fail(err instanceof Error ? err : new Error(String(err))));
  });
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
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
      return sendJson(res, 200, { ok: true, vaultName: this.app.vault.getName(), version: "0.1.0" });
    }

    const auth = req.headers.authorization ?? "";
    const expected = `Bearer ${apiToken}`;
    if (!apiToken || !constantTimeEquals(auth, expected)) {
      return sendJson(res, 401, { error: "Unauthorized" });
    }

    try {
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
      return sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      return sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
