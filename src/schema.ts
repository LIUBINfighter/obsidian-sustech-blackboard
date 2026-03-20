import type { BlackboardCourseSnapshot, BlackboardTerm } from './blackboard/models';

// Example: "SUSTech/Blackboard", "Course Materials", or a semester template.
export const DEFAULT_DESTINATION_FOLDER = 'Blackboard';

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
		destinationFolder: DEFAULT_DESTINATION_FOLDER,
		terms: [],
		selectedTermId: '',
		selectedCourseUrl: '',
		currentCourse: null,
		lastLoadedAt: '',
	};
}
