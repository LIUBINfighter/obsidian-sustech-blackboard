import * as cheerio from 'cheerio';
import type { BlackboardPageSection } from '../models';

export function parsePage(html: string): BlackboardPageSection[] {
	const $ = cheerio.load(html);
	const sections: BlackboardPageSection[] = [];

	$('li.clearfix.liItem.read').each((_, element) => {
		const item = $(element);
		const heading = item.find('h3').first();
		const title = heading.text().trim();
		if (!title) {
			return;
		}

		const text = cleanText(item.find('div.vtbegenerated_div').html() ?? '');

		const files = item
			.find('a[href]')
			.filter((__, link) => !$(link).closest('h3').length)
			.toArray()
			.map((link) => ({
				name: $(link).text().trim(),
				url: toAbsoluteUrl($(link).attr('href') ?? ''),
			}))
			.filter((file) => file.name && file.url);

		if (files.length === 0) {
			const headingLink = heading.find('a[href]').first();
			const headingHref = headingLink.attr('href');
			if (headingHref) {
				files.push({
					name: `${title}.pdf`,
					url: toAbsoluteUrl(headingHref),
				});
			}
		}

		if (files.length === 0 && !text) {
			return;
		}

		sections.push({
			title,
			text,
			files,
		});
	});

	return sections;
}

function toAbsoluteUrl(href: string): string {
	return href.startsWith('http') ? href : new URL(href, 'https://bb.sustech.edu.cn').toString();
}

function cleanText(rawHtml: string): string {
	return rawHtml
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/[ \t]+/g, ' ')
		.trim();
}
