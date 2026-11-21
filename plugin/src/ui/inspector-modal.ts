import { App, Modal, Notice } from "obsidian";
import type AgentManagerPlugin from "../main";
import { ConfirmModal } from "./confirm-modal";

export class BridgeInspectorModal extends Modal {
  constructor(app: App, private readonly plugin: AgentManagerPlugin) {
    super(app);
  }

  onOpen(): void {
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("oam-root", "oam-inspector-modal");

    contentEl.createEl("h2", { text: "Obsidian Agent Manager — Bridge Inspector" });
    const meta = contentEl.createDiv({ cls: "oam-meta-card" });
    meta.createDiv({ text: `Localhost Bridge Port: 127.0.0.1:${this.plugin.settings.port}` });
    meta.createDiv({ text: `Pinned Inbox Items: ${this.plugin.inbox.size()}` });

    const items = this.plugin.inbox.list();
    if (items.length === 0) {
      contentEl.createDiv({
        text: "No items pinned yet. Right-click a note or selection and choose Pin to Agent Manager inbox.",
        cls: "oam-empty-state",
      });
    } else {
      const list = contentEl.createDiv({ cls: "oam-inbox-list" });
      for (const item of items) {
        const row = list.createDiv({ cls: "oam-inbox-row" });
        row.createEl("strong", { text: item.vaultPath });
        row.createDiv({
          text: `${item.kind}${item.cursorLine ? ` · line ${item.cursorLine}` : ""}${item.heading ? ` · ${item.heading}` : ""}`,
          cls: "oam-inbox-sub",
        });
      }
    }

    const actions = contentEl.createDiv({ cls: "oam-confirm-actions" });
    const clearBtn = actions.createEl("button", {
      text: "Clear pinned inbox",
      cls: "mod-warning",
      attr: { type: "button" },
    });
    clearBtn.disabled = items.length === 0;
    clearBtn.addEventListener("click", () => {
      new ConfirmModal(this.app, {
        title: "Clear Agent Manager pinned inbox?",
        message: `Remove all ${items.length} pinned item(s) from the Agent Manager inbox?`,
        confirmLabel: "Clear inbox",
        destructive: true,
        cssPrefix: "oam",
        onConfirm: () => {
          this.plugin.inbox.clear();
          new Notice("Cleared Agent Manager inbox");
          this.render();
        },
      }).open();
    });

    const closeBtn = actions.createEl("button", {
      text: "Close",
      cls: "mod-cta",
      attr: { type: "button" },
    });
    closeBtn.addEventListener("click", () => this.close());
  }
}
