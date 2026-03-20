export interface BlackboardCourse {
	name: string;
	url: string;
}

export interface BlackboardTerm {
	id: string;
	name: string;
	courses: BlackboardCourse[];
}

export interface BlackboardFile {
	name: string;
	url: string;
}

export interface BlackboardPageSection {
	title: string;
	text: string;
	files: BlackboardFile[];
}

export interface BlackboardPageLink {
	title: string;
	url: string;
}

export interface BlackboardSidebarCategory {
	title: string;
	pages: BlackboardPageLink[];
}

export interface BlackboardPage {
	title: string;
	url: string;
	sections: BlackboardPageSection[];
}

export interface BlackboardCourseCategory {
	title: string;
	pages: BlackboardPage[];
}

export interface BlackboardCourseSnapshot {
	termId: string;
	termName?: string;
	course: BlackboardCourse;
	categories: BlackboardCourseCategory[];
}

export interface BlackboardDownloadItem {
	url: string;
	vaultPath: string;
	fileName: string;
}
