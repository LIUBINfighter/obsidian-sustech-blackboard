import type {
	BlackboardCourseSnapshot,
	BlackboardDownloadItem,
	BlackboardFile,
} from './models';
import { joinVaultPath, sanitizePathSegment } from './pathing';

export function createCourseDownloadPlan(
	snapshot: BlackboardCourseSnapshot,
	destinationFolder: string,
): BlackboardDownloadItem[] {
	const items: BlackboardDownloadItem[] = [];

	for (const category of snapshot.categories) {
		for (const page of category.pages) {
			for (const section of page.sections) {
				for (const file of section.files) {
					items.push(createDownloadItem(snapshot, destinationFolder, category.title, page.title, file));
				}
			}
		}
	}

	return items;
}

export function createDownloadItem(
	snapshot: BlackboardCourseSnapshot,
	destinationFolder: string,
	categoryTitle: string,
	pageTitle: string,
	file: BlackboardFile,
): BlackboardDownloadItem {
	return {
		url: file.url,
		fileName: file.name,
		vaultPath: joinVaultPath(
			destinationFolder,
			sanitizePathSegment(snapshot.termId),
			sanitizePathSegment(snapshot.course.name),
			sanitizePathSegment(categoryTitle),
			sanitizePathSegment(pageTitle),
			sanitizePathSegment(file.name),
		),
	};
}
