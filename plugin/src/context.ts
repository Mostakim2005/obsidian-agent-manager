import { App, FileSystemAdapter, MarkdownView, TFile } from "obsidian";
import * as path from "node:path";
import { OpenTabInfo } from "./types";

export function getVaultBasePath(app: App): string {
  const adapter = app.vault.adapter;
  if (adapter instanceof FileSystemAdapter) {
    return adapter.getBasePath();
  }
  return "";
}

export function toDiskPath(app: App, vaultPath: string): string {
  const base = getVaultBasePath(app);
  return base ? path.join(base, vaultPath) : vaultPath;
}

export function getOpenTabs(app: App): OpenTabInfo[] {
  const activeFile = app.workspace.getActiveFile();
  const tabs: OpenTabInfo[] = [];
  app.workspace.iterateAllLeaves((leaf) => {
    const view = leaf.view;
    const state = leaf.getViewState();
    const filePath = (state.state as Record<string, unknown> | undefined)?.file;
    if (typeof filePath === "string") {
      tabs.push({
        vaultPath: filePath,
        diskPath: toDiskPath(app, filePath),
        viewType: view.getViewType(),
        isActive: activeFile?.path === filePath,
      });
    }
  });
  return tabs;
}

export function getActiveHeading(app: App, file: TFile, cursorLine: number): string | null {
  const cache = app.metadataCache.getFileCache(file);
  if (!cache?.headings?.length) return null;
  let current: string | null = null;
  for (const h of cache.headings) {
    if (h.position.start.line <= cursorLine) {
      current = `${"#".repeat(h.level)} ${h.heading}`;
    } else {
      break;
    }
  }
  return current;
}

export function getGlobalSearchState(app: App): { query: string | null; matchedPaths: string[] } {
  const searchLeaves = app.workspace.getLeavesOfType("search");
  if (!searchLeaves.length) return { query: null, matchedPaths: [] };
  const view = searchLeaves[0].view as unknown as {
    getQuery?: () => string;
    dom?: { resultDomLookup?: Map<TFile, unknown> };
  };
  const query = typeof view.getQuery === "function" ? view.getQuery() : null;
  const matchedPaths: string[] = [];
  if (view.dom?.resultDomLookup instanceof Map) {
    for (const file of view.dom.resultDomLookup.keys()) {
      matchedPaths.push(file.path);
    }
  }
  return { query, matchedPaths: matchedPaths.slice(0, 50) };
}

export function getWorkspaceSnapshot(app: App) {
  const activeFile = app.workspace.getActiveFile();
  const mdView = app.workspace.getActiveViewOfType(MarkdownView);
  const editor = mdView?.editor;
  const cursor = editor ? editor.getCursor() : null;
  const selection = editor ? editor.getSelection() : "";
  const cache = activeFile ? app.metadataCache.getFileCache(activeFile) : null;

  return {
    vaultName: app.vault.getName(),
    vaultBasePath: getVaultBasePath(app),
    activeFile: activeFile
      ? {
          vaultPath: activeFile.path,
          diskPath: toDiskPath(app, activeFile.path),
          basename: activeFile.basename,
          extension: activeFile.extension,
          frontmatter: cache?.frontmatter ?? null,
          cursor: cursor ? { line: cursor.line + 1, ch: cursor.ch } : null,
          activeHeading: cursor ? getActiveHeading(app, activeFile, cursor.line) : null,
          selection: selection || null,
        }
      : null,
    openTabs: getOpenTabs(app),
    search: getGlobalSearchState(app),
  };
}
