import type { App } from "obsidian";
import pLimit from "p-limit";
import { BlackboardAuthService } from "./auth";
import { type BlackboardEndpoints, createDefaultEndpoints } from "./endpoints";
import type { BlackboardHttpClientLike } from "./http-types";
import { createCourseDownloadPlan, createDownloadItem } from "./indexing";
import type {
	BlackboardCourse,
	BlackboardCourseSnapshot,
	BlackboardDownloadItem,
	BlackboardFile,
	BlackboardSidebarCategory,
	BlackboardTerm,
} from "./models";
import { parseCourseList } from "./parsers/course-list";
import { parsePage } from "./parsers/page";
import { parseSidebar } from "./parsers/sidebar";
import { writeBinaryToVault } from "./vault";

export interface BlackboardProgressUpdate {
	completed: number;
	total: number;
	label: string;
}

export interface BlackboardDownloadSummary {
	total: number;
	completed: number;
	failed: BlackboardDownloadItem[];
}

export class BlackboardService {
	private readonly auth: BlackboardAuthService;
	private readonly endpoints: BlackboardEndpoints;

	constructor(
		private readonly app: App,
		private readonly client: BlackboardHttpClientLike,
		endpoints: BlackboardEndpoints = createDefaultEndpoints(),
	) {
		this.endpoints = endpoints;
		this.auth = new BlackboardAuthService(client, endpoints);
	}

	async loadTerms(
		username: string,
		password: string,
	): Promise<BlackboardTerm[]> {
		await this.auth.ensureLogin(username, password);

		const response = await this.client.post(
			this.endpoints.tabActionUrl,
			new URLSearchParams({
				action: "refreshAjaxModule",
				modId: "_3_1",
				tabId: "_1_1",
				tab_tab_group_id: "_1_1",
			}),
		);

		if (response.status !== 200) {
			throw new Error("Failed to fetch the Blackboard course list.");
		}

		return parseCourseList(response.text);
	}

	async loadCourseSnapshot(
		term: BlackboardTerm,
		course: BlackboardCourse,
		username: string,
		password: string,
		onProgress?: (update: BlackboardProgressUpdate) => void,
	): Promise<BlackboardCourseSnapshot> {
		await this.auth.ensureLogin(username, password);
		const sidebar = await this.loadSidebar(course.url);
		const snapshot: BlackboardCourseSnapshot = {
			termId: term.id,
			termName: term.name,
			course,
			categories: [],
		};

		const pages = sidebar.flatMap((category) =>
			category.pages.map((page) => ({ category, page })),
		);
		let completed = 0;

		for (const entry of pages) {
			if (isHelpLink(entry.page.title)) {
				continue;
			}

			const sections = await this.loadPageSections(entry.page.url);
			let category = snapshot.categories.find(
				(item) => item.title === entry.category.title,
			);
			if (!category) {
				category = {
					title: entry.category.title,
					pages: [],
				};
				snapshot.categories.push(category);
			}

			category.pages.push({
				title: entry.page.title,
				url: entry.page.url,
				sections,
			});

			completed += 1;
			onProgress?.({
				completed,
				total: pages.length,
				label: `${entry.category.title} / ${entry.page.title}`,
			});
		}

		return snapshot;
	}

	async downloadAttachment(
		snapshot: BlackboardCourseSnapshot,
		destinationFolder: string,
		categoryTitle: string,
		pageTitle: string,
		file: BlackboardFile,
		username: string,
		password: string,
	): Promise<BlackboardDownloadItem> {
		await this.auth.ensureLogin(username, password);
		const item = createDownloadItem(
			snapshot,
			destinationFolder,
			categoryTitle,
			pageTitle,
			file,
		);
		await this.downloadItem(item);
		return item;
	}

	async downloadCourse(
		snapshot: BlackboardCourseSnapshot,
		destinationFolder: string,
		username: string,
		password: string,
		onProgress?: (update: BlackboardProgressUpdate) => void,
	): Promise<BlackboardDownloadSummary> {
		await this.auth.ensureLogin(username, password);
		const plan = createCourseDownloadPlan(snapshot, destinationFolder);
		const failed: BlackboardDownloadItem[] = [];
		const limit = pLimit(4);
		let completed = 0;

		await Promise.all(
			plan.map((item) =>
				limit(async () => {
					try {
						await this.downloadItem(item);
					} catch {
						failed.push(item);
					} finally {
						completed += 1;
						onProgress?.({
							completed,
							total: plan.length,
							label: item.fileName,
						});
					}
				}),
			),
		);

		return {
			total: plan.length,
			completed: plan.length - failed.length,
			failed,
		};
	}

	async clearSession(): Promise<void> {
		await this.auth.clearSession();
	}

	private async loadSidebar(
		courseUrl: string,
	): Promise<BlackboardSidebarCategory[]> {
		const response = await this.client.get(courseUrl, { redirect: "follow" });
		if (response.status !== 200) {
			throw new Error("Failed to open the selected Blackboard course.");
		}

		return parseSidebar(response.text);
	}

	private async loadPageSections(pageUrl: string) {
		const response = await this.client.get(pageUrl, { redirect: "follow" });
		if (response.status !== 200) {
			throw new Error("Failed to open a Blackboard page.");
		}

		return parsePage(response.text);
	}

	private async downloadItem(item: BlackboardDownloadItem): Promise<void> {
		const response = await this.client.get(item.url, { redirect: "follow" });
		if (!response.ok) {
			throw new Error(`Failed to download ${item.fileName}.`);
		}

		const buffer = response.arrayBuffer;
		await writeBinaryToVault(this.app, item.vaultPath, buffer);
	}
}

function isHelpLink(title: string): boolean {
	return title === "--Get Help" || title === "在线帮助";
}
