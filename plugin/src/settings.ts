import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import * as crypto from "node:crypto";
import type AgentManagerPlugin from "./main";

export class AgentManagerSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: AgentManagerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("Obsidian Agent Manager").setHeading();

    new Setting(containerEl)
      .setName("Localhost port")
      .setDesc("Binds strictly to 127.0.0.1 (valid range: 1024–65535).")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.port)).onChange(async (val) => {
          const parsed = Number(val);
          if (Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535) {
            this.plugin.settings.port = parsed;
            await this.plugin.saveSettings();
          } else if (val.trim().length > 0) {
            new Notice("Port must be an integer between 1024 and 65535.");
          }
        })
      )
      .addButton((b) =>
        b.setButtonText("Restart Bridge").onClick(async () => {
          await this.plugin.restartServer(true);
        })
      );

    new Setting(containerEl)
      .setName("API Bearer token")
      .setDesc("Required in Authorization header for REST and MCP requests.")
      .addButton((b) =>
        b.setButtonText("Copy Token").onClick(async () => {
          await navigator.clipboard.writeText(this.plugin.settings.apiToken);
          new Notice("Copied API token");
        })
      )
      .addButton((b) =>
        b.setButtonText("Copy MCP Config").onClick(async () => {
          const cfg = {
            mcpServers: {
              "obsidian-agent-manager": {
                type: "http",
                url: `http://127.0.0.1:${this.plugin.settings.port}/mcp`,
                headers: { Authorization: `Bearer ${this.plugin.settings.apiToken}` },
              },
            },
          };
          await navigator.clipboard.writeText(JSON.stringify(cfg, null, 2));
          new Notice("Copied MCP JSON config");
        })
      )
      .addButton((b) =>
        b.setButtonText("Regenerate").onClick(async () => {
          this.plugin.settings.apiToken = crypto.randomBytes(32).toString("hex");
          await this.plugin.saveSettings();
          new Notice("Regenerated API token");
        })
      );

    new Setting(containerEl)
      .setName("DeepTutor backend URL")
      .setDesc("Default local DeepTutor backend address.")
      .addText((t) =>
        t.setValue(this.plugin.settings.deepTutorUrl).onChange(async (val) => {
          this.plugin.settings.deepTutorUrl = val.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("DeepTutor default knowledge base")
      .setDesc("Default KB name reported to external sync scripts.")
      .addText((t) =>
        t.setValue(this.plugin.settings.deepTutorDefaultKb).onChange(async (val) => {
          const cleaned = val.trim();
          if (cleaned) {
            this.plugin.settings.deepTutorDefaultKb = cleaned;
            await this.plugin.saveSettings();
          }
        })
      );
  }
}
