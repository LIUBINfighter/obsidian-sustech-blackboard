import type { BlackboardCourseSnapshot, BlackboardTerm } from './blackboard/models';

export interface BlackboardBrowserState {
	username: string;
	destinationFolder: string;
	terms: BlackboardTerm[];
	selectedTermId: string;
	selectedCourseUrl: string;
	currentCourse: BlackboardCourseSnapshot | null;
	lastLoadedAt: string;
}

export function createDefaultBrowserState(): BlackboardBrowserState {
	return {
		username: '',
		destinationFolder: 'Blackboard',
		terms: [],
		selectedTermId: '',
		selectedCourseUrl: '',
		currentCourse: null,
		lastLoadedAt: '',
	};
}
