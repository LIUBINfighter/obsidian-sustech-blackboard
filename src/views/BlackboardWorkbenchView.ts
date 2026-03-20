import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type { BlackboardCourseSnapshot, BlackboardFile, BlackboardPageSection, BlackboardTerm } from '../blackboard/models';
import type SUSTechBlackboardPlugin from '../main';
import { DEFAULT_DESTINATION_FOLDER } from '../schema';

export const BLACKBOARD_WORKBENCH_VIEW_TYPE = 'sustech-blackboard-workbench';

export class BlackboardWorkbenchView extends ItemView {
	plugin: SUSTechBlackboardPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: SUSTechBlackboardPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return BLACKBOARD_WORKBENCH_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Sustech blackboard';
	}

	getIcon(): string {
		return 'book-open';
	}

	async onOpen(): Promise<void> {
		await this.refresh();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	async refresh(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('sb-workbench');

		const shell = contentEl.createDiv({ cls: 'sb-shell sb-shell--browser' });
		this.renderHeader(shell);
		this.renderControls(shell);
		this.renderBody(shell);
		this.renderFooter(shell);
	}

	private renderHeader(container: HTMLElement): void {
		const header = container.createDiv({ cls: 'sb-header sb-header--browser' });
		const copy = header.createDiv({ cls: 'sb-header__copy' });

		copy.createDiv({ cls: 'sb-eyebrow', text: 'SUSTech Blackboard' });
		copy.createEl('h1', { text: 'Blackboard workbench' });
		copy.createEl('p', {
			text: 'Browse blackboard course content inside Obsidian and download single files or the current course into a vault folder.',
		});

		const runtime = this.plugin.getRuntimeState();
		const status = header.createDiv({ cls: 'sb-status-card' });
		status.createDiv({ cls: 'sb-status-card__label', text: runtime.isBusy ? 'Working' : 'Ready' });
		status.createDiv({ cls: 'sb-status-card__message', text: runtime.statusText });
		if (runtime.errorText) {
			status.createDiv({ cls: 'sb-status-card__error', text: runtime.errorText });
		}
	}

	private renderControls(container: HTMLElement): void {
		const panel = container.createDiv({ cls: 'sb-panel sb-panel--controls' });
		panel.createEl('h2', { text: 'Connection' });

		const fieldGrid = panel.createDiv({ cls: 'sb-fields-grid' });
		const usernameInput = this.createTextInput(
			fieldGrid,
			'Username',
			this.plugin.settings.browser.username,
			'SUSTech account',
			false,
		);
		const passwordInput = this.createTextInput(
			fieldGrid,
			'Password',
			this.plugin.getSessionPassword(),
			'Only kept for this session',
			true,
		);
		const folderInput = this.createTextInput(
			fieldGrid,
			'Destination folder',
			this.plugin.settings.browser.destinationFolder,
			`Vault-relative path, for example ${DEFAULT_DESTINATION_FOLDER}`,
			false,
		);

		usernameInput.addEventListener('change', () => {
			void this.plugin.updateBrowserPreferences({ username: usernameInput.value });
		});
		folderInput.addEventListener('change', () => {
			void this.plugin.updateBrowserPreferences({
				destinationFolder: folderInput.value.trim() || DEFAULT_DESTINATION_FOLDER,
			});
		});
		passwordInput.addEventListener('input', () => {
			this.plugin.setSessionPassword(passwordInput.value);
		});

		const actions = panel.createDiv({ cls: 'sb-actions-row' });
		const loadButton = this.createActionButton(actions, 'Load Blackboard', async () => {
			await this.plugin.loadCourseCatalog(usernameInput.value.trim(), passwordInput.value, folderInput.value.trim());
		});
		loadButton.disabled = this.plugin.getRuntimeState().isBusy;
	}

	private renderBody(container: HTMLElement): void {
		const body = container.createDiv({ cls: 'sb-body sb-body--browser' });
		this.renderCourseList(body.createDiv({ cls: 'sb-panel sb-panel--sidebar' }));
		this.renderCurrentCourse(body.createDiv({ cls: 'sb-panel sb-panel--content' }));
	}

	private renderCourseList(container: HTMLElement): void {
		container.createEl('h2', { text: 'Courses' });
		const terms = this.plugin.settings.browser.terms;
		if (terms.length === 0) {
			container.createEl('p', { text: 'Load blackboard to see your course list.' });
			return;
		}

		for (const term of terms) {
			const details = container.createEl('details', {
				cls: 'sb-term',
				attr: { open: this.isTermOpen(term) ? 'true' : null },
			});
			details.createEl('summary', {
				cls: 'sb-term__summary',
				text: `${term.name} (${term.courses.length})`,
			});

			const list = details.createDiv({ cls: 'sb-course-list' });
			for (const course of term.courses) {
				const button = list.createEl('button', {
					cls: ['sb-list-button', this.isCourseSelected(term, course.url) ? 'is-selected' : ''],
					text: course.name,
					attr: { type: 'button' },
				});
				button.disabled = this.plugin.getRuntimeState().isBusy;
				button.addEventListener('click', () => {
					void this.plugin.openCourse(term.id, course.url);
				});
			}
		}
	}

	private renderCurrentCourse(container: HTMLElement): void {
		const snapshot = this.plugin.settings.browser.currentCourse;
		if (!snapshot) {
			container.createEl('h2', { text: 'Current content' });
			container.createEl('p', { text: 'Select a course to view its blackboard structure and available files.' });
			return;
		}

		const filesCount = countCourseFiles(snapshot);
		const header = container.createDiv({ cls: 'sb-content-header' });
		const copy = header.createDiv({ cls: 'sb-content-header__copy' });
		copy.createEl('h2', { text: snapshot.course.name });
		copy.createDiv({ cls: 'sb-meta-line', text: `${snapshot.termName ?? snapshot.termId} · ${filesCount} file${filesCount === 1 ? '' : 's'}` });
		copy.createDiv({
			cls: 'sb-meta-line',
			text: `Downloads go to ${this.plugin.settings.browser.destinationFolder}/${snapshot.termId}/${snapshot.course.name}`,
		});

		const actionButton = this.createActionButton(header.createDiv({ cls: 'sb-content-header__actions' }), 'Download current course', async () => {
			await this.plugin.downloadCurrentCourse();
		});
		actionButton.disabled = this.plugin.getRuntimeState().isBusy || filesCount === 0;

		if (snapshot.categories.length === 0) {
			container.createEl('p', { text: 'This course loaded successfully, but no downloadable blackboard content was found.' });
			return;
		}

		for (const category of snapshot.categories) {
			const categoryEl = container.createDiv({ cls: 'sb-category' });
			categoryEl.createEl('h3', { text: category.title });

			for (const page of category.pages) {
				const pageEl = categoryEl.createEl('details', { cls: 'sb-page', attr: { open: 'true' } });
				pageEl.createEl('summary', { cls: 'sb-page__summary', text: page.title });
				const pageBody = pageEl.createDiv({ cls: 'sb-page__body' });

				if (page.sections.length === 0) {
					pageBody.createEl('p', { text: 'No downloadable files were found on this blackboard page.' });
					continue;
				}

				for (const section of page.sections) {
					this.renderSection(pageBody, snapshot, category.title, page.title, section);
				}
			}
		}
	}

	private renderSection(
		container: HTMLElement,
		snapshot: BlackboardCourseSnapshot,
		categoryTitle: string,
		pageTitle: string,
		section: BlackboardPageSection,
	): void {
		const sectionEl = container.createDiv({ cls: 'sb-section' });
		sectionEl.createEl('h4', { text: section.title });
		if (section.text) {
			sectionEl.createEl('p', { cls: 'sb-section__text', text: section.text });
		}

		if (section.files.length === 0) {
			sectionEl.createEl('p', { text: 'This blackboard item has no attachments.' });
			return;
		}

		const fileList = sectionEl.createDiv({ cls: 'sb-file-list' });
		for (const file of section.files) {
			this.renderFileRow(fileList, snapshot, categoryTitle, pageTitle, file);
		}
	}

	private renderFileRow(
		container: HTMLElement,
		snapshot: BlackboardCourseSnapshot,
		categoryTitle: string,
		pageTitle: string,
		file: BlackboardFile,
	): void {
		const row = container.createDiv({ cls: 'sb-file-row' });
		const copy = row.createDiv({ cls: 'sb-file-row__copy' });
		copy.createDiv({ cls: 'sb-file-row__name', text: file.name });
		copy.createDiv({
			cls: 'sb-file-row__meta',
			text: `${snapshot.termId} / ${snapshot.course.name} / ${categoryTitle} / ${pageTitle}`,
		});

		const button = this.createActionButton(row, 'Download', async () => {
			await this.plugin.downloadAttachment(categoryTitle, pageTitle, file);
		});
		button.disabled = this.plugin.getRuntimeState().isBusy;
	}

	private renderFooter(container: HTMLElement): void {
		const footer = container.createDiv({ cls: 'sb-footer' });
		footer.createDiv({
			cls: 'sb-footer__status',
			text: this.plugin.getRuntimeState().statusText,
		});
		footer.createDiv({
			cls: 'sb-footer__timestamp',
			text: this.plugin.settings.browser.lastLoadedAt
				? `Last updated ${new Date(this.plugin.settings.browser.lastLoadedAt).toLocaleString()}`
				: 'Nothing loaded yet.',
		});
		footer.createDiv({
			cls: 'sb-footer__hint',
			text: 'All Blackboard actions stay inside this view and downloads are written into your vault.',
		});
	}

	private createActionButton(container: HTMLElement, label: string, onClick: () => Promise<void>): HTMLButtonElement {
		const button = container.createEl('button', {
			cls: 'sb-button',
			text: label,
			attr: { type: 'button' },
		});
		button.addEventListener('click', () => {
			void onClick();
		});
		return button;
	}

	private createTextInput(
		container: HTMLElement,
		label: string,
		value: string,
		placeholder: string,
		isPassword: boolean,
	): HTMLInputElement {
		const field = container.createDiv({ cls: 'sb-field' });
		field.createEl('label', { cls: 'sb-field__label', text: label });
		const input = field.createEl('input', {
			cls: 'sb-input',
			attr: {
				type: isPassword ? 'password' : 'text',
				placeholder,
			},
		});
		input.value = value;
		input.disabled = this.plugin.getRuntimeState().isBusy;
		return input;
	}

	private isTermOpen(term: BlackboardTerm): boolean {
		return this.plugin.settings.browser.selectedTermId === term.id || this.plugin.settings.browser.terms[0]?.id === term.id;
	}

	private isCourseSelected(term: BlackboardTerm, courseUrl: string): boolean {
		return this.plugin.settings.browser.selectedTermId === term.id
			&& this.plugin.settings.browser.selectedCourseUrl === courseUrl;
	}
}

function countCourseFiles(snapshot: BlackboardCourseSnapshot): number {
	return snapshot.categories.reduce((sum, category) => (
		sum + category.pages.reduce((pageSum, page) => (
			pageSum + page.sections.reduce((sectionSum, section) => sectionSum + section.files.length, 0)
		), 0)
	), 0);
}
