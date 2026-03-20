import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { BlackboardHttpClient } from '../src/blackboard/http';

void test('BlackboardHttpClient follows redirects and reuses cookies across requests', async () => {
	const server = createServer((request, response) => {
		const url = request.url ?? '/';
		const cookie = request.headers.cookie ?? '';

		if (request.method === 'GET' && url === '/cas') {
			response.setHeader('Set-Cookie', 'CASID=abc; Path=/');
			response.writeHead(200, { 'Content-Type': 'text/html' });
			response.end('<input name="execution" value="token" />');
			return;
		}

		if (request.method === 'POST' && url === '/cas') {
			assert.match(cookie, /CASID=abc/);
			response.setHeader('Set-Cookie', 'BBSESS=token; Path=/');
			response.writeHead(302, { Location: '/ticket' });
			response.end();
			return;
		}

		if (request.method === 'GET' && url === '/ticket') {
			assert.match(cookie, /BBSESS=token/);
			response.writeHead(200, { 'Content-Type': 'text/plain' });
			response.end('ticket accepted');
			return;
		}

		if (request.method === 'GET' && url === '/protected') {
			response.writeHead(cookie.includes('BBSESS=token') ? 200 : 401, {
				'Content-Type': 'text/plain',
			});
			response.end(cookie);
			return;
		}

		response.writeHead(404);
		response.end('missing');
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
	const address = server.address() as AddressInfo;
	const origin = `http://127.0.0.1:${address.port}`;
	const client = new BlackboardHttpClient();

	try {
		const loginPage = await client.get(`${origin}/cas`);
		assert.equal(loginPage.status, 200);
		assert.match(loginPage.text, /execution/);

		const loggedIn = await client.post(
			`${origin}/cas`,
			new URLSearchParams({ username: 'student', password: 'pw' }),
			{ redirect: 'follow' },
		);
		assert.equal(loggedIn.status, 200);
		assert.equal(loggedIn.text, 'ticket accepted');

		const protectedResponse = await client.get(`${origin}/protected`);
		assert.equal(protectedResponse.status, 200);
		assert.match(protectedResponse.text, /BBSESS=token/);
	} finally {
		await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	}
});

void test('BlackboardHttpClient can leave redirects manual when needed', async () => {
	const server = createServer((request, response) => {
		if (request.url === '/manual') {
			response.writeHead(302, { Location: '/next' });
			response.end();
			return;
		}

		response.writeHead(200, { 'Content-Type': 'text/plain' });
		response.end('ok');
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
	const address = server.address() as AddressInfo;
	const client = new BlackboardHttpClient();

	try {
		const response = await client.get(`http://127.0.0.1:${address.port}/manual`, { redirect: 'manual' });
		assert.equal(response.status, 302);
		assert.equal(response.headers.location, '/next');
	} finally {
		await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	}
});
