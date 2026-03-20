import * as cheerio from 'cheerio';
import { parseStringPromise } from 'xml2js';
import type { BlackboardTerm } from '../models';

export async function parseCourseList(xml: string): Promise<BlackboardTerm[]> {
	const parsed = await parseStringPromise(xml, {
		explicitArray: false,
		trim: true,
		explicitCharkey: true,
	}) as { contents?: { _: string } };

	const html = parsed.contents?._ ?? '';
	const $ = cheerio.load(html);
	const terms: BlackboardTerm[] = [];

	$('h3.termHeading-coursefakeclass').each((_, element) => {
		const heading = $(element);
		const termName = heading.text().trim();
		if (!termName) {
			return;
		}

		const anchorId = heading.find('a[id]').attr('id');
		const idMatch = anchorId?.match(/termCourses__\d+_\d+/);
		if (!idMatch) {
			return;
		}

		const term: BlackboardTerm = {
			id: normalizeTerm(termName),
			name: termName,
			courses: [],
		};

		const listId = `_3_1${idMatch[0]}`;
		$(`div#${listId}`)
			.find('li')
			.each((__, item) => {
				const link = $(item).find('a[href]').first();
				const href = link.attr('href')?.trim();
				const courseName = link.text().trim();
				if (!href || !courseName || href.includes('announcement')) {
					return;
				}

				term.courses.push({
					name: courseName,
					url: toAbsoluteUrl(href),
				});
			});

		terms.push(term);
	});

	return terms;
}

function toAbsoluteUrl(href: string): string {
	return href.startsWith('http') ? href : new URL(href, 'https://bb.sustech.edu.cn').toString();
}

function normalizeTerm(termName: string): string {
	const match = termName.match(/（(Spring|Fall|Summer|Winter)\s+(\d{4})）/i);
	if (!match) {
		return termName;
	}

	const season = match[1]?.toLowerCase() ?? '';
	const year = match[2]?.slice(-2) ?? '';
	return `${year}${season}`;
}
