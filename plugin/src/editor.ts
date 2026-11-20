import { App, MarkdownView, TFile } from "obsidian";
import { normalizeSafeVaultPath } from "./security";
import { EditRequest } from "./types";

function findHeadingRange(app: App, file: TFile, headingQuery: string): { start: number; end: number } | null {
  const cache = app.metadataCache.getFileCache(file);
  const headings = cache?.headings ?? [];
  const norm = headingQuery.replace(/^#+\s*/, "").trim().toLowerCase();
  const idx = headings.findIndex((h) => h.heading.trim().toLowerCase() === norm);
  if (idx === -1) return null;
  const target = headings[idx];
  const start = target.position.start.line;
  let end = -1;
  for (let i = idx + 1; i < headings.length; i++) {
    if (headings[i].level <= target.level) {
      end = headings[i].position.start.line - 1;
      break;
    }
  }
  return { start, end };
}

export async function readNoteSlice(
  app: App,
  vaultPath?: string,
  heading?: string,
  startLine?: number,
  endLine?: number
) {
  const file = vaultPath
    ? app.vault.getAbstractFileByPath(vaultPath)
    : app.workspace.getActiveFile();
  if (!(file instanceof TFile)) throw new Error("Note not found");

  // Prefer live unsaved editor buffer when reading the active note
  const activeView = app.workspace.getActiveViewOfType(MarkdownView);
  const fullText =
    activeView && activeView.file?.path === file.path
      ? activeView.editor.getValue()
      : await app.vault.read(file);
  const lines = fullText.split(/\r?\n/);

  if (heading) {
    const range = findHeadingRange(app, file, heading);
    if (!range) throw new Error(`Heading not found: ${heading}`);
    const sliceEnd = range.end === -1 ? lines.length : range.end + 1;
    return {
      vaultPath: file.path,
      startLine: range.start + 1,
      endLine: sliceEnd,
      totalLines: lines.length,
      content: lines.slice(range.start, sliceEnd).join("\n"),
    };
  }

  if (typeof startLine === "number") {
    const s = Math.max(1, startLine);
    const e = Math.min(lines.length, endLine ?? lines.length);
    if (e < s) throw new Error("endLine must be >= startLine");
    return {
      vaultPath: file.path,
      startLine: s,
      endLine: e,
      totalLines: lines.length,
      content: lines.slice(s - 1, e).join("\n"),
    };
  }

  return {
    vaultPath: file.path,
    startLine: 1,
    endLine: lines.length,
    totalLines: lines.length,
    content: fullText,
  };
}

export async function createNote(app: App, rawPath: string, content: string, overwrite = false) {
  const safePath = normalizeSafeVaultPath(rawPath);
  const finalPath = safePath.endsWith(".md") ? safePath : `${safePath}.md`;
  const existing = app.vault.getAbstractFileByPath(finalPath);
  if (existing instanceof TFile) {
    if (!overwrite) throw new Error(`Note already exists: ${finalPath}`);
    await app.vault.modify(existing, content);
    return { ok: true, vaultPath: existing.path, created: false, overwritten: true };
  }
  const folder = finalPath.includes("/") ? finalPath.slice(0, finalPath.lastIndexOf("/")) : "";
  if (folder && !app.vault.getAbstractFileByPath(folder)) {
    await app.vault.createFolder(folder);
  }
  const created = await app.vault.create(finalPath, content);
  return { ok: true, vaultPath: created.path, created: true, overwritten: false };
}

export async function applyEdit(app: App, req: EditRequest) {
  const targetFile = req.path
    ? app.vault.getAbstractFileByPath(req.path)
    : app.workspace.getActiveFile();
  if (!(targetFile instanceof TFile)) throw new Error("Target note not found");

  if (req.mode === "patch_frontmatter") {
    if (!req.frontmatterPatch) throw new Error("frontmatterPatch is required");
    await app.fileManager.processFrontMatter(targetFile, (fm) => {
      Object.assign(fm, req.frontmatterPatch);
    });
    return { ok: true, vaultPath: targetFile.path, mode: req.mode };
  }

  const content = req.content ?? "";
  const activeView = app.workspace.getActiveViewOfType(MarkdownView);
  const isEditingActive = activeView && activeView.file?.path === targetFile.path;

  if (req.mode === "replace_selection") {
    if (!isEditingActive) throw new Error("replace_selection requires the target note to be active");
    activeView.editor.replaceSelection(content);
    return { ok: true, vaultPath: targetFile.path, mode: req.mode, undoSafe: true };
  }

  if (req.mode === "replace_lines") {
    if (typeof req.startLine !== "number" || typeof req.endLine !== "number") {
      throw new Error("startLine and endLine (1-indexed) are required");
    }
    if (req.startLine < 1 || req.endLine < req.startLine) {
      throw new Error("Invalid line range: require 1 <= startLine <= endLine");
    }
    if (isEditingActive) {
      const editor = activeView.editor;
      const from = { line: Math.max(0, req.startLine - 1), ch: 0 };
      const endIdx = Math.min(editor.lineCount() - 1, req.endLine - 1);
      const to = { line: endIdx, ch: editor.getLine(endIdx).length };
      editor.replaceRange(content, from, to);
      return { ok: true, vaultPath: targetFile.path, mode: req.mode, undoSafe: true };
    }
    await app.vault.process(targetFile, (data) => {
      const lines = data.split(/\r?\n/);
      const clampedStart = Math.min(req.startLine! - 1, lines.length);
      const deleteCount = Math.max(0, Math.min(req.endLine!, lines.length) - clampedStart);
      lines.splice(clampedStart, deleteCount, ...content.split(/\r?\n/));
      return lines.join("\n");
    });
    return { ok: true, vaultPath: targetFile.path, mode: req.mode, undoSafe: false };
  }

  if (req.mode === "replace_heading") {
    if (!req.heading) throw new Error("heading is required");
    const range = findHeadingRange(app, targetFile, req.heading);
    if (!range) throw new Error(`Heading not found: ${req.heading}`);
    if (isEditingActive) {
      const editor = activeView.editor;
      const lastLine = range.end === -1 ? editor.lineCount() - 1 : range.end;
      editor.replaceRange(content, { line: range.start, ch: 0 }, { line: lastLine, ch: editor.getLine(lastLine).length });
      return { ok: true, vaultPath: targetFile.path, mode: req.mode, undoSafe: true };
    }
    await app.vault.process(targetFile, (data) => {
      const lines = data.split(/\r?\n/);
      const sliceEnd = range.end === -1 ? lines.length - 1 : range.end;
      lines.splice(range.start, sliceEnd - range.start + 1, ...content.split(/\r?\n/));
      return lines.join("\n");
    });
    return { ok: true, vaultPath: targetFile.path, mode: req.mode, undoSafe: false };
  }

  if (req.mode === "append") {
    if (isEditingActive) {
      const editor = activeView.editor;
      const last = editor.lineCount() - 1;
      editor.replaceRange(`\n${content}`, { line: last, ch: editor.getLine(last).length });
      return { ok: true, vaultPath: targetFile.path, mode: req.mode, undoSafe: true };
    }
    await app.vault.append(targetFile, `\n${content}`);
    return { ok: true, vaultPath: targetFile.path, mode: req.mode, undoSafe: false };
  }

  throw new Error(`Unsupported edit mode: ${String(req.mode)}`);
}

export async function openNoteAtLine(app: App, vaultPath: string, line?: number) {
  const file = app.vault.getAbstractFileByPath(vaultPath);
  if (!(file instanceof TFile)) throw new Error("Note not found");
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file);
  if (typeof line === "number" && leaf.view instanceof MarkdownView) {
    const pos = { line: Math.max(0, line - 1), ch: 0 };
    leaf.view.editor.setCursor(pos);
    leaf.view.editor.scrollIntoView({ from: pos, to: pos }, true);
  }
  return { ok: true, vaultPath: file.path, line: line ?? 1 };
}
