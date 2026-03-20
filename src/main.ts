import {
	type App,
	Notice,
	Plugin,
	type PluginManifest,
	type WorkspaceLeaf,
} from "obsidian";
import { BlackboardHttpClient } from "./blackboard/http";
import type { BlackboardFile, BlackboardTerm } from "./blackboard/models";
import {
	type BlackboardProgressUpdate,
	BlackboardService,
} from "./blackboard/service";
import {
	createDefaultBrowserState,
	DEFAULT_DESTINATION_FOLDER,
} from "./schema";
import {
	BLACKBOARD_DEFAULT_SETTINGS,
	type BlackboardPluginSettings,
	BlackboardSettingTab,
} from "./settings";
import {
	BLACKBOARD_WORKBENCH_VIEW_TYPE,
	BlackboardWorkbenchView,
} from "./views/BlackboardWorkbenchView";

interface BlackboardRuntimeState {
	isBusy: boolean;
	statusText: string;
	errorText: string;
}

const DEFAULT_RUNTIME_STATE: BlackboardRuntimeState = {
	isBusy: false,
	statusText: "Enter your SUSTech account and load Blackboard content.",
	errorText: "",
};

export default class SUSTechBlackboardPlugin extends Plugin {
	settings: BlackboardPluginSettings;
	private readonly runtimeState: BlackboardRuntimeState = {
		...DEFAULT_RUNTIME_STATE,
	};
	private readonly service: BlackboardService;
	private sessionPassword = "";

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);
		this.service = new BlackboardService(app, new BlackboardHttpClient());
	}

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(
			BLACKBOARD_WORKBENCH_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new BlackboardWorkbenchView(leaf, this),
		);

		this.addRibbonIcon("book-open", "Open blackboard workbench", async () => {
			await this.activateWorkbenchView();
		});

		this.addCommand({
			id: "open-blackboard-workbench",
			name: "Open workbench",
			callback: async () => {
				await this.activateWorkbenchView();
			},
		});

		this.addSettingTab(new BlackboardSettingTab(this.app, this));

		if (this.settings.openWorkbenchOnStartup) {
			this.app.workspace.onLayoutReady(() => {
				void this.activateWorkbenchView();
			});
		}
	}

	onunload(): void {}

	async activateWorkbenchView(): Promise<void> {
		const { workspace } = this.app;
		const existingLeaf = workspace.getLeavesOfType(
			BLACKBOARD_WORKBENCH_VIEW_TYPE,
		)[0];
		let leaf: WorkspaceLeaf;

		if (!existingLeaf) {
			const nextLeaf = workspace.getLeaf("tab");
			if (!nextLeaf) {
				new Notice("Could not open the blackboard view.");
				return;
			}
			leaf = nextLeaf;

			await leaf.setViewState({
				type: BLACKBOARD_WORKBENCH_VIEW_TYPE,
				active: true,
			});
		} else {
			leaf = existingLeaf;
		}

		await workspace.revealLeaf(leaf);
	}

	refreshWorkbenchViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(
			BLACKBOARD_WORKBENCH_VIEW_TYPE,
		)) {
			const view = leaf.view;
			if (view instanceof BlackboardWorkbenchView) {
				void view.refresh();
			}
		}
	}

	getRuntimeState(): Readonly<BlackboardRuntimeState> {
		return this.runtimeState;
	}

	getSessionPassword(): string {
		return this.sessionPassword;
	}

	setSessionPassword(password: string): void {
		this.sessionPassword = password;
	}

	async updateBrowserPreferences(patch: {
		username?: string;
		destinationFolder?: string;
	}): Promise<void> {
		this.settings.browser = {
			...this.settings.browser,
			...patch,
		};
		await this.saveSettings();
	}

	async loadCourseCatalog(
		username: string,
		password: string,
		destinationFolder: string,
	): Promise<void> {
		await this.withBusyState("Loading Blackboard courses…", async () => {
			this.sessionPassword = password;
			const sanitizedFolder =
				destinationFolder.trim() || DEFAULT_DESTINATION_FOLDER;
			const terms = await this.service.loadTerms(username, password);
			const selectedTerm = this.pickSelectedTerm(
				terms,
				this.settings.browser.selectedTermId,
			);
			const selectedCourseUrl = selectedTerm?.courses.some(
				(course) => course.url === this.settings.browser.selectedCourseUrl,
			)
				? this.settings.browser.selectedCourseUrl
				: "";

			this.settings.browser = {
				...this.settings.browser,
				username,
				destinationFolder: sanitizedFolder,
				terms,
				selectedTermId: selectedTerm?.id ?? "",
				selectedCourseUrl,
				currentCourse: null,
				lastLoadedAt: new Date().toISOString(),
			};
			await this.saveSettings();
			this.setRuntimeMessage(
				`Loaded ${terms.length} Blackboard term${terms.length === 1 ? "" : "s"}.`,
			);
		});
	}

	async openCourse(termId: string, courseUrl: string): Promise<void> {
		const term = this.settings.browser.terms.find((item) => item.id === termId);
		const course = term?.courses.find((item) => item.url === courseUrl);
		if (!term || !course) {
			new Notice("Could not find that blackboard course in the current list.");
			return;
		}

		await this.withBusyState(`Loading ${course.name}…`, async () => {
			const snapshot = await this.service.loadCourseSnapshot(
				term,
				course,
				this.settings.browser.username,
				this.sessionPassword,
				(update) => {
					this.setRuntimeMessage(
						this.formatProgress("Loading Blackboard content", update),
					);
				},
			);

			this.settings.browser = {
				...this.settings.browser,
				selectedTermId: term.id,
				selectedCourseUrl: course.url,
				currentCourse: snapshot,
				lastLoadedAt: new Date().toISOString(),
			};
			await this.saveSettings();
			this.setRuntimeMessage(`Loaded ${course.name}.`);
		});
	}

	async downloadAttachment(
		categoryTitle: string,
		pageTitle: string,
		file: BlackboardFile,
	): Promise<void> {
		const snapshot = this.settings.browser.currentCourse;
		if (!snapshot) {
			new Notice("Load a blackboard course first.");
			return;
		}

		await this.withBusyState(`Downloading ${file.name}…`, async () => {
			const item = await this.service.downloadAttachment(
				snapshot,
				this.settings.browser.destinationFolder,
				categoryTitle,
				pageTitle,
				file,
				this.settings.browser.username,
				this.sessionPassword,
			);
			this.setRuntimeMessage(
				`Downloaded ${item.fileName} to ${item.vaultPath}.`,
			);
		});
	}

	async downloadCurrentCourse(): Promise<void> {
		const snapshot = this.settings.browser.currentCourse;
		if (!snapshot) {
			new Notice("Load a blackboard course first.");
			return;
		}

		const summary = await this.withBusyState(
			`Downloading ${snapshot.course.name}…`,
			async () => {
				const finishedSummary = await this.service.downloadCourse(
					snapshot,
					this.settings.browser.destinationFolder,
					this.settings.browser.username,
					this.sessionPassword,
					(update) => {
						this.setRuntimeMessage(
							this.formatProgress("Downloading Blackboard files", update),
						);
					},
				);

				this.setRuntimeMessage(
					finishedSummary.failed.length === 0
						? `Downloaded ${finishedSummary.completed} files.`
						: `Downloaded ${finishedSummary.completed}/${finishedSummary.total} files. ${finishedSummary.failed.length} failed.`,
				);

				return finishedSummary;
			},
		);

		if (summary?.failed.length) {
			new Notice(
				`Downloaded ${summary.completed} files. ${summary.failed.length} failed.`,
			);
		}
	}

	async clearSession(): Promise<void> {
		await this.service.clearSession();
		this.sessionPassword = "";
		this.setRuntimeMessage("Cleared the current Blackboard session.");
	}

	async loadSettings(): Promise<void> {
		const loaded =
			(await this.loadData()) as Partial<BlackboardPluginSettings> | null;
		const defaultBrowser = createDefaultBrowserState();

		this.settings = {
			...BLACKBOARD_DEFAULT_SETTINGS,
			...loaded,
			browser: loaded?.browser
				? {
						...defaultBrowser,
						...loaded.browser,
					}
				: defaultBrowser,
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private pickSelectedTerm(
		terms: BlackboardTerm[],
		selectedTermId: string,
	): BlackboardTerm | undefined {
		return terms.find((term) => term.id === selectedTermId) ?? terms[0];
	}

	private async withBusyState<T>(
		message: string,
		action: () => Promise<T>,
	): Promise<T | null> {
		this.runtimeState.isBusy = true;
		this.runtimeState.statusText = message;
		this.runtimeState.errorText = "";
		this.refreshWorkbenchViews();

		try {
			return await action();
		} catch (error) {
			const messageText =
				error instanceof Error ? error.message : "Unexpected Blackboard error.";
			this.runtimeState.errorText = messageText;
			this.runtimeState.statusText = messageText;
			new Notice(messageText);
			return null;
		} finally {
			this.runtimeState.isBusy = false;
			this.refreshWorkbenchViews();
		}
	}

	private setRuntimeMessage(message: string): void {
		this.runtimeState.statusText = message;
		this.runtimeState.errorText = "";
		this.refreshWorkbenchViews();
	}

	private formatProgress(
		prefix: string,
		update: BlackboardProgressUpdate,
	): string {
		return `${prefix} (${update.completed}/${update.total}) — ${update.label}`;
	}
}
