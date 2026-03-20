import * as cheerio from 'cheerio';
import type { BlackboardSidebarCategory } from '../models';

export function parseSidebar(html: string): BlackboardSidebarCategory[] {
	const $ = cheerio.load(html);
	const sidebar: BlackboardSidebarCategory[] = [];
	const menu = $('#courseMenuPalette_contents');
	let currentCategory: BlackboardSidebarCategory | null = null;

	menu.find('li').each((_, element) => {
		const item = $(element);
		const heading = item.find('h3').first();
		if (heading.length) {
			const title = heading.text().trim();
			if (!title) {
				return;
			}

			currentCategory = {
				title,
				pages: [],
			};
			sidebar.push(currentCategory);
			return;
		}

		if (!currentCategory) {
			return;
		}

		const link = item.find('a[href]').first();
		const href = link.attr('href')?.trim();
		const title = link.text().trim();
		if (!href || !title) {
			return;
		}

		currentCategory.pages.push({
			title,
			url: new URL(href, 'https://bb.sustech.edu.cn').toString(),
		});
	});

	return sidebar;
}
