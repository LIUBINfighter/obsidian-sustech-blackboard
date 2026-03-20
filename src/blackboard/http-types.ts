export interface BlackboardHttpRequestOptions {
	headers?: Record<string, string>;
	redirect?: 'follow' | 'manual';
}

export interface BlackboardHttpResponse {
	status: number;
	url: string;
	headers: Record<string, string>;
	text: string;
	arrayBuffer: ArrayBuffer;
	ok: boolean;
}

export interface BlackboardHttpClientLike {
	clearSession(): Promise<void>;
	get(url: string, options?: BlackboardHttpRequestOptions): Promise<BlackboardHttpResponse>;
	post(url: string, body: URLSearchParams | string, options?: BlackboardHttpRequestOptions): Promise<BlackboardHttpResponse>;
}

export function getHeader(headers: Record<string, string>, name: string): string {
	const target = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === target) {
			return value;
		}
	}

	return '';
}
