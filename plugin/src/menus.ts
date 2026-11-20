import { App, Editor, MarkdownView, Menu, Notice, TAbstractFile, TFile } from "obsidian";
import * as crypto from "node:crypto";
import { getActiveHeading, toDiskPath } from "./context";
import { PinnedContextItem } from "./types";

const MAX_INBOX_ITEMS = 25;

export class PinnedInbox {
  private items: PinnedContextItem[] = [];
  private listeners: Array<(count: number) => void> = [];

  onChange(listener: (count: number) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    for (const l of this.listeners) l(this.items.length);
  }

  push(item: Omit<PinnedContextItem, "id" | "createdAt">): PinnedContextItem {
    const entry: PinnedContextItem = {
      ...item,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.items.unshift(entry);
    if (this.items.length > MAX_INBOX_ITEMS) {
      this.items.length = MAX_INBOX_ITEMS;
    }
    this.notify();
    return entry;
  }

  list(): PinnedContextItem[] {
    return [...this.items];
  }

  size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
    this.notify();
  }
}

export function attachEditorMenu(app: App, inbox: PinnedInbox, menu: Menu, editor: Editor, view: MarkdownView) {
  const file = view.file;
  if (!file) return;
  const selection = editor.getSelection();
  const cursor = editor.getCursor();

  menu.addItem((item) => {
    item
      .setTitle(selection ? "Send selection to Agent Manager" : "Pin active note to Agent Manager")
      .setIcon("send")
      .onClick(() => {
        inbox.push({
          kind: selection ? "selection" : "note",
          vaultPath: file.path,
          diskPath: toDiskPath(app, file.path),
          selection: selection || undefined,
          cursorLine: cursor.line + 1,
          heading: getActiveHeading(app, file, cursor.line),
        });
        new Notice(selection ? "Selection pinned to Agent Manager inbox" : `Pinned "${file.basename}" to Agent Manager`);
      });
  });
}

export function attachFileMenu(app: App, inbox: PinnedInbox, menu: Menu, file: TAbstractFile) {
  if (!(file instanceof TFile)) return;
  menu.addItem((item) => {
    item
      .setTitle("Pin file/attachment to Agent Manager")
      .setIcon("paperclip")
      .onClick(() => {
        inbox.push({
          kind: file.extension === "md" ? "note" : "attachment",
          vaultPath: file.path,
          diskPath: toDiskPath(app, file.path),
        });
        new Notice(`Pinned "${file.name}" to Agent Manager inbox`);
      });
  });
}
