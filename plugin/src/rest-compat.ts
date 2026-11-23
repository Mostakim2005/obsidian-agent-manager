import { App, MarkdownView, TFile, TFolder } from "obsidian";
import { applyEdit } from "./editor";
import { normalizeSafeVaultPath } from "./security";

interface CommandInternals {
  commands?: {
    commands?: Record<string, { id: string; name: string }>;
    executeCommandById?: (id: string) => boolean;
  };
}

export function listVaultDirectory(app: App, rawDirPath = ""): { files: string[] } {
  const cleaned = rawDirPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").trim();
  let folder: TFolder;
  if (!cleaned) {
    folder = app.vault.getRoot();
  } else {
    const safe = normalizeSafeVaultPath(cleaned);
    const target = app.vault.getAbstractFileByPath(safe);
    if (!(target instanceof TFolder)) {
      throw new Error(`Directory not found: ${safe}`);
    }
    folder = target;
  }

  const files = folder.children
    .map((child) => (child instanceof TFolder ? `${child.name}/` : child.name))
    .sort((a, b) => a.localeCompare(b));
  return { files };
}

export async function readVaultNotePayload(
  app: App,
  rawPath?: string
): Promise<{
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  stat: { ctime: number; mtime: number; size: number };
}> {
  const file = rawPath
    ? app.vault.getAbstractFileByPath(normalizeSafeVaultPath(rawPath))
    : app.workspace.getActiveFile();
  if (!(file instanceof TFile)) {
    throw new Error(rawPath ? `Note not found: ${rawPath}` : "No active note");
  }

  const activeView = app.workspace.getActiveViewOfType(MarkdownView);
  const content =
    activeView && activeView.file?.path === file.path
      ? activeView.editor.getValue()
      : await app.vault.read(file);

  const cache = app.metadataCache.getFileCache(file);
  const tagSet = new Set<string>();
  for (const t of cache?.tags ?? []) {
    tagSet.add(t.tag.replace(/^#/, ""));
  }
  const fmTags = cache?.frontmatter?.tags;
  if (Array.isArray(fmTags)) {
    for (const t of fmTags) {
      if (typeof t === "string" && t.trim()) tagSet.add(t.trim().replace(/^#/, ""));
    }
  } else if (typeof fmTags === "string" && fmTags.trim()) {
    tagSet.add(fmTags.trim().replace(/^#/, ""));
  }

  return {
    path: file.path,
    content,
    frontmatter: (cache?.frontmatter ?? {}) as Record<string, unknown>,
    tags: Array.from(tagSet).sort(),
    stat: {
      ctime: file.stat.ctime,
      mtime: file.stat.mtime,
      size: file.stat.size,
    },
  };
}

export async function writeVaultFile(
  app: App,
  rawPath: string,
  content: string
): Promise<{ ok: true; vaultPath: string; created: boolean; undoSafe: boolean }> {
  const safePath = normalizeSafeVaultPath(rawPath);
  const existing = app.vault.getAbstractFileByPath(safePath);
  if (existing instanceof TFile) {
    const activeView = app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView && activeView.file?.path === existing.path) {
      const editor = activeView.editor;
      const lastLine = Math.max(0, editor.lineCount() - 1);
      editor.replaceRange(
        content,
        { line: 0, ch: 0 },
        { line: lastLine, ch: editor.getLine(lastLine).length }
      );
      return { ok: true, vaultPath: existing.path, created: false, undoSafe: true };
    }
    await app.vault.modify(existing, content);
    return { ok: true, vaultPath: existing.path, created: false, undoSafe: false };
  }

  const folder = safePath.includes("/") ? safePath.slice(0, safePath.lastIndexOf("/")) : "";
  if (folder && !app.vault.getAbstractFileByPath(folder)) {
    await app.vault.createFolder(folder);
  }
  const created = await app.vault.create(safePath, content);
  return { ok: true, vaultPath: created.path, created: true, undoSafe: false };
}

export async function appendVaultFile(
  app: App,
  rawPath: string | undefined,
  content: string
): Promise<{ ok: true; vaultPath: string; undoSafe: boolean }> {
  const file = rawPath
    ? app.vault.getAbstractFileByPath(normalizeSafeVaultPath(rawPath))
    : app.workspace.getActiveFile();

  if (!(file instanceof TFile)) {
    if (rawPath) {
      const res = await writeVaultFile(app, rawPath, content);
      return { ok: true, vaultPath: res.vaultPath, undoSafe: res.undoSafe };
    }
    throw new Error("No active note");
  }

  const activeView = app.workspace.getActiveViewOfType(MarkdownView);
  if (activeView && activeView.file?.path === file.path) {
    const editor = activeView.editor;
    const last = Math.max(0, editor.lineCount() - 1);
    const prefix = editor.getValue().endsWith("\n") || !editor.getValue() ? "" : "\n";
    editor.replaceRange(`${prefix}${content}`, { line: last, ch: editor.getLine(last).length });
    return { ok: true, vaultPath: file.path, undoSafe: true };
  }

  await app.vault.append(file, content.startsWith("\n") ? content : `\n${content}`);
  return { ok: true, vaultPath: file.path, undoSafe: false };
}

export async function deleteVaultFile(
  app: App,
  rawPath: string
): Promise<{ ok: true; deleted: string }> {
  const safePath = normalizeSafeVaultPath(rawPath);
  const file = app.vault.getAbstractFileByPath(safePath);
  if (!(file instanceof TFile)) {
    throw new Error(`File not found: ${safePath}`);
  }
  await app.vault.trash(file, true);
  return { ok: true, deleted: safePath };
}

export async function moveVaultFile(
  app: App,
  rawFromPath: string,
  rawToPath: string
): Promise<{ ok: true; from: string; to: string }> {
  const fromPath = normalizeSafeVaultPath(rawFromPath);
  const toPath = normalizeSafeVaultPath(rawToPath);
  const file = app.vault.getAbstractFileByPath(fromPath);
  if (!(file instanceof TFile)) {
    throw new Error(`File not found: ${fromPath}`);
  }
  const destFolder = toPath.includes("/") ? toPath.slice(0, toPath.lastIndexOf("/")) : "";
  if (destFolder && !app.vault.getAbstractFileByPath(destFolder)) {
    await app.vault.createFolder(destFolder);
  }
  await app.fileManager.renameFile(file, toPath);
  return { ok: true, from: fromPath, to: toPath };
}

export async function patchVaultNote(
  app: App,
  rawPath: string | undefined,
  opts: {
    targetType?: "heading" | "frontmatter" | "block";
    target?: string;
    operation?: "append" | "prepend" | "replace";
    content?: string;
    frontmatterPatch?: Record<string, unknown>;
  }
) {
  const safePath = rawPath ? normalizeSafeVaultPath(rawPath) : undefined;
  if (opts.targetType === "frontmatter" || opts.frontmatterPatch) {
    let patch: Record<string, unknown> = opts.frontmatterPatch ?? {};
    if (!opts.frontmatterPatch && opts.target) {
      let parsed: unknown = opts.content ?? "";
      if (typeof opts.content === "string") {
        try {
          parsed = JSON.parse(opts.content);
        } catch {
          parsed = opts.content;
        }
      }
      patch = { [opts.target]: parsed };
    }
    return applyEdit(app, {
      path: safePath,
      mode: "patch_frontmatter",
      frontmatterPatch: patch,
    });
  }

  if (opts.targetType === "heading" && opts.target) {
    const targetHeading = opts.target.split("::").pop()?.trim() ?? opts.target.trim();
    return applyEdit(app, {
      path: safePath,
      mode: "replace_heading",
      heading: targetHeading,
      content: opts.content ?? "",
    });
  }

  return appendVaultFile(app, safePath, opts.content ?? "");
}

export function listVaultTags(app: App): { tags: Array<{ tag: string; count: number }> } {
  const counts = new Map<string, number>();
  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    const seenInFile = new Set<string>();
    for (const t of cache?.tags ?? []) {
      seenInFile.add(t.tag.replace(/^#/, ""));
    }
    const fmTags = cache?.frontmatter?.tags;
    if (Array.isArray(fmTags)) {
      for (const t of fmTags) {
        if (typeof t === "string" && t.trim()) seenInFile.add(t.trim().replace(/^#/, ""));
      }
    } else if (typeof fmTags === "string" && fmTags.trim()) {
      seenInFile.add(fmTags.trim().replace(/^#/, ""));
    }
    for (const tag of seenInFile) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const tags = Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return { tags };
}

export function listObsidianCommands(app: App): { commands: Array<{ id: string; name: string }> } {
  const internal = (app as unknown as CommandInternals).commands?.commands ?? {};
  const commands = Object.values(internal)
    .map((cmd) => ({ id: cmd.id, name: cmd.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { commands };
}

export function executeObsidianCommand(
  app: App,
  commandId: string
): { ok: true; commandId: string } {
  const runner = (app as unknown as CommandInternals).commands?.executeCommandById;
  if (!runner) {
    throw new Error("Obsidian command registry is unavailable");
  }
  const executed = runner(commandId);
  if (!executed) {
    throw new Error(`Command not found or could not run: ${commandId}`);
  }
  return { ok: true, commandId };
}

export async function simpleTextSearch(
  app: App,
  query: string,
  contextLength = 100,
  limit = 50
): Promise<
  Array<{
    filename: string;
    score: number;
    matches: Array<{ match: { start: number; end: number }; context: string }>;
  }>
> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const ctxLen = Math.max(20, Math.min(500, Number.isFinite(contextLength) ? contextLength : 100));
  const results: Array<{
    filename: string;
    score: number;
    matches: Array<{ match: { start: number; end: number }; context: string }>;
  }> = [];

  for (const file of app.vault.getMarkdownFiles()) {
    const content = await app.vault.cachedRead(file);
    const lower = content.toLowerCase();
    const matches: Array<{ match: { start: number; end: number }; context: string }> = [];
    let pos = 0;
    while (matches.length < 10) {
      const idx = lower.indexOf(needle, pos);
      if (idx === -1) break;
      const start = idx;
      const end = idx + needle.length;
      const ctxStart = Math.max(0, start - Math.floor(ctxLen / 2));
      const ctxEnd = Math.min(content.length, end + Math.floor(ctxLen / 2));
      matches.push({
        match: { start, end },
        context: content.slice(ctxStart, ctxEnd),
      });
      pos = end;
    }

    const nameMatch = file.path.toLowerCase().includes(needle);
    if (matches.length > 0 || nameMatch) {
      results.push({
        filename: file.path,
        score: matches.length + (nameMatch ? 5 : 0),
        matches,
      });
    }
  }

  results.sort((a, b) => b.score - a.score || a.filename.localeCompare(b.filename));
  return results.slice(0, limit);
}
