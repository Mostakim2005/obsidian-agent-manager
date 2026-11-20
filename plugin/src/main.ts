import { MarkdownView, Notice, Plugin } from "obsidian";
import * as crypto from "node:crypto";
import { getActiveHeading, toDiskPath } from "./context";
import { attachEditorMenu, attachFileMenu, PinnedInbox } from "./menus";
import { BridgeServer } from "./server";
import { AgentManagerSettingTab } from "./settings";
import { BridgeSettings, DEFAULT_SETTINGS } from "./types";

export default class AgentManagerPlugin extends Plugin {
  settings: BridgeSettings = { ...DEFAULT_SETTINGS };
  inbox = new PinnedInbox();
  private server: BridgeServer | null = null;
  private statusBarEl: HTMLElement | null = null;

  async onload() {
    await this.loadSettings();
    if (!this.settings.apiToken) {
      this.settings.apiToken = crypto.randomBytes(32).toString("hex");
      await this.saveSettings();
    }

    this.addSettingTab(new AgentManagerSettingTab(this.app, this));

    this.statusBarEl = this.addStatusBarItem();
    const updateStatus = (count: number) => {
      if (this.statusBarEl) {
        this.statusBarEl.setText(`Agent :${this.settings.port} (${count} pinned)`);
      }
    };
    updateStatus(this.inbox.size());
    this.register(this.inbox.onChange(updateStatus));

    this.addCommand({
      id: "pin-active-selection-or-note",
      name: "Pin active selection or note to Agent Manager inbox",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice("No active note to pin");
          return;
        }
        const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
        const selection = mdView?.editor.getSelection() ?? "";
        const cursor = mdView?.editor.getCursor();
        this.inbox.push({
          kind: selection ? "selection" : "note",
          vaultPath: file.path,
          diskPath: toDiskPath(this.app, file.path),
          selection: selection || undefined,
          cursorLine: cursor ? cursor.line + 1 : undefined,
          heading: cursor ? getActiveHeading(this.app, file, cursor.line) : null,
        });
        new Notice(selection ? "Selection pinned to Agent Manager inbox" : `Pinned "${file.basename}"`);
      },
    });

    this.addCommand({
      id: "clear-agent-manager-inbox",
      name: "Clear Agent Manager pinned inbox",
      callback: () => {
        this.inbox.clear();
        new Notice("Cleared Agent Manager inbox");
      },
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        if ("file" in view && view.file) {
          attachEditorMenu(this.app, this.inbox, menu, editor, view as never);
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        attachFileMenu(this.app, this.inbox, menu, file);
      })
    );

    await this.restartServer(false);
  }

  async restartServer(notify = true): Promise<void> {
    if (this.server) {
      await this.server.stop();
    }
    this.server = new BridgeServer(this.app, () => this.settings, this.inbox);
    try {
      await this.server.start();
      this.statusBarEl?.setText(`Agent :${this.settings.port} (${this.inbox.size()} pinned)`);
      if (notify) {
        new Notice(`Obsidian Agent Manager restarted on 127.0.0.1:${this.settings.port}`);
      }
    } catch (err) {
      this.statusBarEl?.setText(`Agent :${this.settings.port} (offline)`);
      new Notice(`Obsidian Agent Manager failed to start on port ${this.settings.port}: ${String(err)}`);
    }
  }

  async onunload() {
    await this.server?.stop();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
