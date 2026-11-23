import { MarkdownView, Notice, Plugin } from "obsidian";
import * as crypto from "node:crypto";
import { getActiveHeading, toDiskPath } from "./context";
import { attachEditorMenu, attachFileMenu, PinnedInbox } from "./menus";
import { BridgeServer } from "./server";
import { AgentManagerSettingTab } from "./settings";
import { BridgeInspectorModal } from "./ui/inspector-modal";
import { ConfirmModal } from "./ui/confirm-modal";
import { BridgeSettings, DEFAULT_SETTINGS } from "./types";

export default class AgentManagerPlugin extends Plugin {
  settings: BridgeSettings = { ...DEFAULT_SETTINGS };
  inbox = new PinnedInbox();
  private server: BridgeServer | null = null;
  private statusBarEl: HTMLElement | null = null;
  private settingsReady: Promise<void> = Promise.resolve();

  onload() {
    this.settingsReady = this.loadSettings().then(async () => {
      if (!this.settings.apiToken) {
        this.settings.apiToken = crypto.randomBytes(32).toString("hex");
        await this.saveSettings();
      }
      await this.restartServer(false);
    });

    this.addSettingTab(new AgentManagerSettingTab(this.app, this));

    const ribbonEl = this.addRibbonIcon("bot", "Obsidian Agent Manager: Bridge & Pinned Inbox", () => {
      new BridgeInspectorModal(this.app, this).open();
    });
    ribbonEl.setAttribute("aria-label", "Open Obsidian Agent Manager Bridge Inspector");

    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass("oam-status-pill");
    this.statusBarEl.setAttribute("role", "button");
    this.statusBarEl.setAttribute("tabindex", "0");
    this.statusBarEl.setAttribute("aria-label", "Open Agent Manager Bridge Inspector");
    this.statusBarEl.addEventListener("click", () => new BridgeInspectorModal(this.app, this).open());
    this.statusBarEl.addEventListener("keydown", (evt: KeyboardEvent) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        new BridgeInspectorModal(this.app, this).open();
      }
    });
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
      id: "open-agent-manager-inspector",
      name: "Open Agent Manager Bridge Inspector",
      callback: () => new BridgeInspectorModal(this.app, this).open(),
    });

    this.addCommand({
      id: "clear-agent-manager-inbox",
      name: "Clear Agent Manager pinned inbox",
      callback: () => {
        const count = this.inbox.size();
        if (count === 0) {
          new Notice("Agent Manager inbox is already empty");
          return;
        }
        new ConfirmModal(this.app, {
          title: "Clear Agent Manager pinned inbox?",
          message: `Remove all ${count} pinned item(s) from the Agent Manager inbox?`,
          confirmLabel: "Clear inbox",
          destructive: true,
          cssPrefix: "oam",
          onConfirm: () => {
            this.inbox.clear();
            new Notice("Cleared Agent Manager inbox");
          },
        }).open();
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
