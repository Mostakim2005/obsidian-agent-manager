import { App, TFile } from "obsidian";
import { toDiskPath } from "./context";

export function getNoteGraph(app: App, vaultPath: string) {
  const file = app.vault.getAbstractFileByPath(vaultPath);
  if (!(file instanceof TFile)) return null;

  const cache = app.metadataCache.getFileCache(file);
  const resolveRef = (link: string) => {
    const cleanLink = link.split("#")[0].split("|")[0];
    const dest = app.metadataCache.getFirstLinkpathDest(cleanLink, file.path);
    return dest
      ? {
          rawLink: link,
          vaultPath: dest.path,
          diskPath: toDiskPath(app, dest.path),
          extension: dest.extension,
          sizeBytes: dest.stat.size,
        }
      : { rawLink: link, unresolved: true };
  };

  const outgoing = (cache?.links ?? []).map((l) => resolveRef(l.link));
  const embeds = (cache?.embeds ?? []).map((e) => resolveRef(e.link));

  const incoming: Array<{ vaultPath: string; diskPath: string }> = [];
  const resolved = app.metadataCache.resolvedLinks;
  for (const [sourcePath, targets] of Object.entries(resolved)) {
    if (targets && targets[file.path]) {
      incoming.push({ vaultPath: sourcePath, diskPath: toDiskPath(app, sourcePath) });
    }
  }

  return {
    vaultPath: file.path,
    diskPath: toDiskPath(app, file.path),
    headings: (cache?.headings ?? []).map((h) => ({
      level: h.level,
      heading: h.heading,
      line: h.position.start.line + 1,
    })),
    outgoing,
    embeds,
    incoming,
  };
}

export function getActiveAttachments(app: App) {
  const active = app.workspace.getActiveFile();
  if (!active) return { activePath: null, attachments: [] };
  const graph = getNoteGraph(app, active.path);
  return {
    activePath: active.path,
    attachments: graph?.embeds ?? [],
  };
}

export function searchVaultMetadata(app: App, query: string, limit = 25) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: Array<{ vaultPath: string; diskPath: string; tags: string[] }> = [];
  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    const tags = (cache?.tags ?? []).map((t) => t.tag);
    const headings = (cache?.headings ?? []).map((h) => h.heading);
    const hay = `${file.path} ${tags.join(" ")} ${headings.join(" ")}`.toLowerCase();
    if (hay.includes(q)) {
      results.push({ vaultPath: file.path, diskPath: toDiskPath(app, file.path), tags });
      if (results.length >= limit) break;
    }
  }
  return results;
}
