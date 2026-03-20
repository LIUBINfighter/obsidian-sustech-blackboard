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
			text: "Most blackboard controls stay inside the dedicated view. This settings tab currently keeps startup behavior only.",
			cls: "sb-setting-intro",
		});

		new Setting(containerEl)
			.setName("Open workbench on startup")
			.setDesc(
				"Open the blackboard view automatically when Obsidian finishes loading.",
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
