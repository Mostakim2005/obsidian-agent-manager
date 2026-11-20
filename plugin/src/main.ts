import { Notice, Plugin } from "obsidian";
import * as crypto from "node:crypto";
import { attachEditorMenu, attachFileMenu, PinnedInbox } from "./menus";
import { BridgeServer } from "./server";
import { AgentManagerSettingTab } from "./settings";
import { BridgeSettings, DEFAULT_SETTINGS } from "./types";

export default class AgentManagerPlugin extends Plugin {
  settings: BridgeSettings = { ...DEFAULT_SETTINGS };
  inbox = new PinnedInbox();
  private server: BridgeServer | null = null;

  async onload() {
    await this.loadSettings();
    if (!this.settings.apiToken) {
      this.settings.apiToken = crypto.randomBytes(32).toString("hex");
      await this.saveSettings();
    }

    this.addSettingTab(new AgentManagerSettingTab(this.app, this));

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

    this.server = new BridgeServer(this.app, () => this.settings, this.inbox);
    try {
      await this.server.start();
    } catch (err) {
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
