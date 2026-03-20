import { createServer } from 'node:http';

import { BlackboardHttpClient } from '../src/blackboard/http';
import { BlackboardService } from '../src/blackboard/service';
import type { BlackboardEndpoints } from '../src/blackboard/endpoints';

class MemoryVault {
	folders = new Set<string>();
	files = new Map<string, ArrayBuffer>();

	getAbstractFileByPath(path: string): { path: string } | null {
		return this.folders.has(path) || this.files.has(path) ? { path } : null;
	}

	getFileByPath(path: string): { path: string } | null {
		return this.files.has(path) ? { path } : null;
	}

	async createFolder(path: string): Promise<void> {
		this.folders.add(path);
	}

	async createBinary(path: string, data: ArrayBuffer): Promise<void> {
		this.files.set(path, data);
	}

	async modifyBinary(file: { path: string }, data: ArrayBuffer): Promise<void> {
		this.files.set(file.path, data);
	}
}

async function main(): Promise<void> {
	const server = createServer((request, response) => {
		const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
		const cookie = request.headers.cookie ?? '';

		if (request.method === 'GET' && url.pathname === '/ultra/course') {
			if (cookie.includes('BBSESS=token')) {
				response.writeHead(200, { 'Content-Type': 'text/plain' });
				response.end('ok');
			} else {
				response.writeHead(302, { Location: `${url.origin}/cas/login` });
				response.end();
			}
			return;
		}

		if (request.method === 'GET' && url.pathname === '/learn/api/public/v1/users/me') {
			response.writeHead(cookie.includes('BBSESS=token') ? 200 : 401, { 'Content-Type': 'application/json' });
			response.end('{}');
			return;
		}

		if (request.method === 'GET' && url.pathname === '/cas/login') {
			response.setHeader('Set-Cookie', 'CASID=abc; Path=/');
			response.writeHead(200, { 'Content-Type': 'text/html' });
			response.end('<input name="execution" value="token" />');
			return;
		}

		if (request.method === 'POST' && url.pathname === '/cas/login') {
			response.setHeader('Set-Cookie', 'BBSESS=token; Path=/');
			response.writeHead(302, { Location: `${url.origin}/webapps/login/?ticket=mock-ticket` });
			response.end();
			return;
		}

		if (request.method === 'GET' && url.pathname === '/webapps/login/') {
			response.writeHead(cookie.includes('BBSESS=token') ? 200 : 401, { 'Content-Type': 'text/plain' });
			response.end('login complete');
			return;
		}

		if (request.method === 'POST' && url.pathname === '/webapps/portal/execute/tabs/tabAction') {
			response.writeHead(200, { 'Content-Type': 'application/xml' });
			response.end(`
				<contents><![CDATA[
					<h3 class="termHeading-coursefakeclass"><a id="termCourses__2025_1">（Spring 2025）</a></h3>
					<div id="_3_1termCourses__2025_1">
						<li><a href="${url.origin}/webapps/blackboard/content/listContent.jsp?course_id=_1_1">CS101</a></li>
					</div>
				]]></contents>
			`);
			return;
		}

		if (request.method === 'GET' && url.searchParams.get('course_id') === '_1_1') {
			response.writeHead(200, { 'Content-Type': 'text/html' });
			response.end(`
				<div id="courseMenuPalette_contents">
					<li><h3>Course Content</h3></li>
					<li><a href="${url.origin}/webapps/blackboard/content/listContent.jsp?content_id=_11_1">Week 1</a></li>
				</div>
			`);
			return;
		}

		if (request.method === 'GET' && url.searchParams.get('content_id') === '_11_1') {
			response.writeHead(200, { 'Content-Type': 'text/html' });
			response.end(`
				<li class="clearfix liItem read">
					<h3>Lecture slides</h3>
					<div class="vtbegenerated_div">Read before class<br/>Bring questions</div>
					<a href="${url.origin}/files/slides.pdf">slides.pdf</a>
				</li>
			`);
			return;
		}

		if (request.method === 'GET' && url.pathname === '/files/slides.pdf') {
			response.writeHead(200, { 'Content-Type': 'application/pdf' });
			response.end('fake-pdf');
			return;
		}

		response.writeHead(404);
		response.end('missing');
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
	const address = server.address();
	if (!address || typeof address === 'string') {
		throw new Error('Could not determine manual QA server address.');
	}

	const origin = `http://127.0.0.1:${address.port}`;
	const endpoints: BlackboardEndpoints = {
		casLoginUrl: `${origin}/cas/login`,
		serviceUrl: `${origin}/webapps/login/`,
		ultraCourseUrl: `${origin}/ultra/course`,
		meUrl: `${origin}/learn/api/public/v1/users/me`,
		tabActionUrl: `${origin}/webapps/portal/execute/tabs/tabAction`,
	};
	const vault = new MemoryVault();
	const service = new BlackboardService({ vault } as never, new BlackboardHttpClient(), endpoints);

	try {
		const terms = await service.loadTerms('student', 'password');
		const term = terms[0];
		if (!term) {
			throw new Error('Expected at least one term.');
		}

		const course = term.courses[0];
		if (!course) {
			throw new Error('Expected at least one course.');
		}

		const snapshot = await service.loadCourseSnapshot(term, course, 'student', 'password');
		const summary = await service.downloadCourse(snapshot, 'Blackboard', 'student', 'password');

		console.log(JSON.stringify({
			terms: terms.map((item) => item.id),
			course: snapshot.course.name,
			categories: snapshot.categories.map((item) => item.title),
			writtenFiles: Array.from(vault.files.keys()).sort(),
			summary,
		}, null, 2));
	} finally {
		await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	}
}

void main();
