export interface BridgeSettings {
  port: number;
  apiToken: string;
  deepTutorUrl: string;
  deepTutorDefaultKb: string;
}

export const DEFAULT_SETTINGS: BridgeSettings = {
  port: 27125,
  apiToken: "",
  deepTutorUrl: "http://127.0.0.1:8001",
  deepTutorDefaultKb: "obsidian-study",
};

export interface PinnedContextItem {
  id: string;
  createdAt: string;
  kind: "selection" | "note" | "attachment";
  vaultPath: string;
  diskPath: string;
  selection?: string;
  cursorLine?: number;
  heading?: string | null;
}

export interface OpenTabInfo {
  vaultPath: string;
  diskPath: string;
  viewType: string;
  isActive: boolean;
}

export interface EditRequest {
  path?: string;
  mode: "replace_selection" | "replace_lines" | "replace_heading" | "append" | "patch_frontmatter";
  content?: string;
  startLine?: number;
  endLine?: number;
  heading?: string;
  frontmatterPatch?: Record<string, unknown>;
}
