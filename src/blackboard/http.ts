import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import type {
	BlackboardHttpClientLike,
	BlackboardHttpRequestOptions,
	BlackboardHttpResponse,
} from './http-types';

const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
	'(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

interface StoredCookie {
	name: string;
	value: string;
	domain: string;
	path: string;
}

export class BlackboardHttpClient implements BlackboardHttpClientLike {
	private readonly cookies: StoredCookie[] = [];

	async clearSession(): Promise<void> {
		this.cookies.length = 0;
	}

	get(url: string, options: BlackboardHttpRequestOptions = {}): Promise<BlackboardHttpResponse> {
		return this.send('GET', url, undefined, options, 0);
	}

	post(
		url: string,
		body: URLSearchParams | string,
		options: BlackboardHttpRequestOptions = {},
	): Promise<BlackboardHttpResponse> {
		return this.send('POST', url, body.toString(), options, 0);
	}

	private async send(
		method: 'GET' | 'POST',
		url: string,
		body: string | undefined,
		options: BlackboardHttpRequestOptions,
		redirectCount: number,
	): Promise<BlackboardHttpResponse> {
		if (redirectCount > 10) {
			throw new Error('Too many redirects while talking to Blackboard.');
		}

		const target = new URL(url);
		const response = await this.performRequest(method, target, body, options.headers ?? {});
		this.storeResponseCookies(target, response.rawHeaders);

		const location = response.headers.location;
		const shouldFollow = options.redirect === 'follow'
			&& isRedirectStatus(response.status)
			&& typeof location === 'string'
			&& location.length > 0;

		if (!shouldFollow) {
			return response;
		}

		const nextUrl = new URL(location, target).toString();
		const nextMethod = shouldChangeToGet(method, response.status) ? 'GET' : method;
		const nextBody = nextMethod === 'GET' ? undefined : body;
		return this.send(nextMethod, nextUrl, nextBody, options, redirectCount + 1);
	}

	private performRequest(
		method: 'GET' | 'POST',
		target: URL,
		body: string | undefined,
		headers: Record<string, string>,
	): Promise<BlackboardHttpResponse & { rawHeaders: string[] }> {
		return new Promise((resolve, reject) => {
			const cookieHeader = this.buildCookieHeader(target);
			const requestImpl = target.protocol === 'https:' ? httpsRequest : httpRequest;
			const request = requestImpl(target, {
				method,
				headers: {
					'User-Agent': USER_AGENT,
					'Accept-Encoding': 'identity',
					...(cookieHeader ? { Cookie: cookieHeader } : {}),
					...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
					...headers,
				},
			}, (response) => {
				const chunks: Uint8Array[] = [];
				response.on('data', (chunk: unknown) => {
					chunks.push(normalizeBodyChunk(chunk));
				});
				response.on('end', () => {
					const buffer = Buffer.concat(chunks);
					resolve({
						status: response.statusCode ?? 0,
						url: target.toString(),
						headers: flattenHeaders(response.rawHeaders),
						text: buffer.toString('utf8'),
						arrayBuffer: toArrayBuffer(buffer),
						ok: (response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 300,
						rawHeaders: response.rawHeaders,
					});
				});
			});

			request.on('error', reject);
			if (body) {
				request.write(body);
			}
			request.end();
		});
	}

	private buildCookieHeader(target: URL): string {
		const hostname = target.hostname;
		const pathname = target.pathname || '/';

		return this.cookies
			.filter((cookie) => domainMatches(hostname, cookie.domain) && pathname.startsWith(cookie.path))
			.map((cookie) => `${cookie.name}=${cookie.value}`)
			.join('; ');
	}

	private storeResponseCookies(target: URL, rawHeaders: string[]): void {
		for (const cookieValue of collectRawHeaderValues(rawHeaders, 'set-cookie')) {
			const parsed = parseSetCookie(cookieValue, target.hostname);
			if (!parsed) {
				continue;
			}

			const existingIndex = this.cookies.findIndex((cookie) => (
				cookie.name === parsed.name
				&& cookie.domain === parsed.domain
				&& cookie.path === parsed.path
			));

			if (parsed.value === '') {
				if (existingIndex !== -1) {
					this.cookies.splice(existingIndex, 1);
				}
				continue;
			}

			if (existingIndex === -1) {
				this.cookies.push(parsed);
			} else {
				this.cookies[existingIndex] = parsed;
			}
		}
	}
}

function collectRawHeaderValues(rawHeaders: string[], targetName: string): string[] {
	const values: string[] = [];
	for (let index = 0; index < rawHeaders.length; index += 2) {
		if (rawHeaders[index]?.toLowerCase() === targetName) {
			const value = rawHeaders[index + 1];
			if (value) {
				values.push(value);
			}
		}
	}
	return values;
}

function flattenHeaders(rawHeaders: string[]): Record<string, string> {
	const headers: Record<string, string> = {};
	for (let index = 0; index < rawHeaders.length; index += 2) {
		const key = rawHeaders[index]?.toLowerCase();
		const value = rawHeaders[index + 1];
		if (key && value) {
			headers[key] = value;
		}
	}
	return headers;
}

function parseSetCookie(cookieValue: string, fallbackDomain: string): StoredCookie | null {
	const segments = cookieValue.split(';').map((segment) => segment.trim()).filter(Boolean);
	const nameValue = segments.shift();
	if (!nameValue) {
		return null;
	}

	const separatorIndex = nameValue.indexOf('=');
	if (separatorIndex === -1) {
		return null;
	}

	const name = nameValue.slice(0, separatorIndex).trim();
	const value = nameValue.slice(separatorIndex + 1).trim();
	let domain = fallbackDomain;
	let path = '/';

	for (const segment of segments) {
		const [rawKey, ...rest] = segment.split('=');
		const key = rawKey?.trim().toLowerCase();
		const attributeValue = rest.join('=').trim();
		if (key === 'domain' && attributeValue) {
			domain = attributeValue.replace(/^\./, '').toLowerCase();
		}
		if (key === 'path' && attributeValue) {
			path = attributeValue;
		}
	}

	return {
		name,
		value,
		domain,
		path,
	};
}

function domainMatches(hostname: string, domain: string): boolean {
	return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isRedirectStatus(status: number): boolean {
	return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function shouldChangeToGet(method: 'GET' | 'POST', status: number): boolean {
	return method === 'POST' && (status === 301 || status === 302 || status === 303);
}

function normalizeBodyChunk(chunk: unknown): Uint8Array {
	if (typeof chunk === 'string') {
		return Buffer.from(chunk);
	}

	if (chunk instanceof Uint8Array) {
		return chunk;
	}

	if (chunk instanceof ArrayBuffer) {
		return new Uint8Array(chunk);
	}

	if (ArrayBuffer.isView(chunk)) {
		return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
	}

	throw new Error('Unexpected response body chunk type.');
}

function toArrayBuffer(buffer: Uint8Array): ArrayBuffer {
	return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}
