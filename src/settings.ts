import { type App, PluginSettingTab, Setting } from "obsidian";
import type SUSTechBlackboardPlugin from "./main";
import {
	type BlackboardBrowserState,
	createDefaultBrowserState,
} from "./schema";

export interface BlackboardPluginSettings {
	openWorkbenchOnStartup: boolean;
	browser: BlackboardBrowserState;
}

export const BLACKBOARD_DEFAULT_SETTINGS: BlackboardPluginSettings = {
	openWorkbenchOnStartup: false,
	browser: createDefaultBrowserState(),
};

export class BlackboardSettingTab extends PluginSettingTab {
	plugin: SUSTechBlackboardPlugin;

	constructor(app: App, plugin: SUSTechBlackboardPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Workspace").setHeading();
		containerEl.createEl("p", {
			text: "Phase 1 controls stay inside the Blackboard view. This settings tab only keeps startup behavior.",
			cls: "sb-setting-intro",
		});

		new Setting(containerEl)
			.setName("Open Blackboard on startup")
			.setDesc(
				"Open the Blackboard view automatically when Obsidian finishes loading.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.openWorkbenchOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.openWorkbenchOnStartup = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
