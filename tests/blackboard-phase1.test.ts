import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizePathSegment, joinVaultPath } from '../src/blackboard/pathing';
import { parseCourseList } from '../src/blackboard/parsers/course-list';
import { parseSidebar } from '../src/blackboard/parsers/sidebar';
import { parsePage } from '../src/blackboard/parsers/page';
import { createCourseDownloadPlan } from '../src/blackboard/indexing';
import type { BlackboardCourseSnapshot } from '../src/blackboard/models';

void test('sanitizePathSegment removes illegal characters and trims dots', () => {
	assert.equal(sanitizePathSegment(' Week 01: Intro?.pdf '), 'Week 01_ Intro_.pdf');
	assert.equal(sanitizePathSegment('...'), '_');
});

void test('joinVaultPath normalizes nested vault paths', () => {
	assert.equal(joinVaultPath('Blackboard/', '/25spring', 'CS101'), 'Blackboard/25spring/CS101');
	assert.equal(joinVaultPath('', 'Blackboard', 'Week 1'), 'Blackboard/Week 1');
});

void test('parseCourseList groups Blackboard courses by normalized term', async () => {
	const xml = `
		<contents><![CDATA[
			<h3 class="termHeading-coursefakeclass"><a id="termCourses__2025_1">（Spring 2025）</a></h3>
			<div id="_3_1termCourses__2025_1">
				<li>
					<a href="/webapps/blackboard/content/listContent.jsp?course_id=_1_1">CS101</a>
				</li>
			</div>
		]]></contents>
	`;

	const result = await parseCourseList(xml);

	assert.equal(result.length, 1);
	assert.equal(result[0]?.id, '25spring');
	assert.equal(result[0]?.courses[0]?.name, 'CS101');
	assert.match(result[0]?.courses[0]?.url ?? '', /course_id=_1_1/);
});

void test('parseSidebar extracts grouped page links', () => {
	const html = `
		<div id="courseMenuPalette_contents">
			<li><h3>Course Content</h3></li>
			<li><a href="/webapps/blackboard/content/listContent.jsp?content_id=_1_1">Week 1</a></li>
			<li><a href="https://bb.sustech.edu.cn/webapps/blackboard/content/listContent.jsp?content_id=_2_1">Week 2</a></li>
		</div>
	`;

	const sidebar = parseSidebar(html);

	assert.equal(sidebar.length, 1);
	assert.equal(sidebar[0]?.title, 'Course Content');
	assert.equal(sidebar[0]?.pages.length, 2);
	assert.equal(sidebar[0]?.pages[0]?.title, 'Week 1');
	assert.match(sidebar[0]?.pages[0]?.url ?? '', /content_id=_1_1/);
});

void test('parsePage extracts text and files from Blackboard content items', () => {
	const html = `
		<li class="clearfix liItem read">
			<h3>Lecture slides</h3>
			<div class="vtbegenerated_div">Read before class<br/>Bring questions</div>
			<a href="/bbcswebdav/xid-123_1">slides.pdf</a>
			<a href="/bbcswebdav/xid-124_1">source.zip</a>
		</li>
	`;

	const sections = parsePage(html);

	assert.equal(sections.length, 1);
	assert.equal(sections[0]?.title, 'Lecture slides');
	assert.equal(sections[0]?.text, 'Read before class\nBring questions');
	assert.deepEqual(
		sections[0]?.files.map((file) => file.name),
		['slides.pdf', 'source.zip'],
	);
});

void test('createCourseDownloadPlan preserves Blackboard hierarchy under destination folder', () => {
	const snapshot: BlackboardCourseSnapshot = {
		termId: '25spring',
		course: {
			name: 'CS101',
			url: 'https://bb.sustech.edu.cn/course',
		},
		categories: [
			{
				title: 'Course Content',
				pages: [
					{
						title: 'Week 1',
						url: 'https://bb.sustech.edu.cn/page',
						sections: [
							{
								title: 'Lecture slides',
								text: '',
								files: [
									{
										name: 'slides.pdf',
										url: 'https://bb.sustech.edu.cn/file',
									},
								],
							},
						],
					},
				],
			},
		],
	};

	const plan = createCourseDownloadPlan(snapshot, 'Blackboard');

	assert.deepEqual(plan, [
		{
			url: 'https://bb.sustech.edu.cn/file',
			vaultPath: 'Blackboard/25spring/CS101/Course Content/Week 1/slides.pdf',
			fileName: 'slides.pdf',
		},
	]);
});
