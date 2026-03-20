import * as cheerio from "cheerio";
import { type BlackboardEndpoints, createDefaultEndpoints } from "./endpoints";
import { type BlackboardHttpClientLike, getHeader } from "./http-types";

export class BlackboardAuthService {
	private readonly endpoints: BlackboardEndpoints;

	constructor(
		private readonly client: BlackboardHttpClientLike,
		endpoints: BlackboardEndpoints = createDefaultEndpoints(),
	) {
		this.endpoints = endpoints;
	}

	async ensureLogin(username: string, password: string): Promise<void> {
		if (await this.quickCheck()) {
			return;
		}

		if (!username.trim() || !password) {
			throw new Error("Enter your Blackboard username and password first.");
		}

		const execution = await this.fetchExecution();
		if (!execution) {
			throw new Error("Could not open the SUSTech CAS login page.");
		}

		const ticketUrl = await this.submitCredentials(
			username,
			password,
			execution,
		);
		if (!ticketUrl) {
			throw new Error("Blackboard rejected the current username or password.");
		}

		const isValid = await this.validateServiceTicket(ticketUrl);
		if (!isValid) {
			throw new Error("Could not complete the Blackboard login flow.");
		}
	}

	async clearSession(): Promise<void> {
		await this.client.clearSession();
	}

	private async quickCheck(): Promise<boolean> {
		const courseResponse = await this.client.get(
			this.endpoints.ultraCourseUrl,
			{ redirect: "manual" },
		);
		if (courseResponse.status === 200) {
			return true;
		}

		if (courseResponse.status === 302) {
			const location = getHeader(courseResponse.headers, "location");
			if (location.includes("cas.sustech.edu.cn")) {
				return false;
			}
		}

		const meResponse = await this.client.get(this.endpoints.meUrl, {
			redirect: "manual",
		});
		if (meResponse.status === 302) {
			const location = getHeader(meResponse.headers, "location");
			if (location.includes("cas.sustech.edu.cn")) {
				return false;
			}
		}

		return meResponse.status === 200;
	}

	private async fetchExecution(): Promise<string | null> {
		const response = await this.client.get(this.getCasLoginUrl(), {
			redirect: "follow",
		});
		if (response.status !== 200) {
			return null;
		}

		const html = response.text;
		const $ = cheerio.load(html);
		const execution = $('input[name="execution"]').val();
		return execution ? String(execution) : null;
	}

	private async submitCredentials(
		username: string,
		password: string,
		execution: string,
	): Promise<string | null> {
		const body = new URLSearchParams({
			username,
			password,
			execution,
			_eventId: "submit",
			geolocation: "",
			submit: "登录",
		});

		const response = await this.client.post(this.getCasLoginUrl(), body, {
			redirect: "manual",
		});
		if (response.status !== 302) {
			return null;
		}

		const location = getHeader(response.headers, "location");
		if (location.includes("authenticationFailure")) {
			return null;
		}

		return location.includes("ticket=")
			? new URL(location, this.getCasLoginUrl()).toString()
			: null;
	}

	private async validateServiceTicket(ticketUrl: string): Promise<boolean> {
		const response = await this.client.get(ticketUrl, { redirect: "follow" });
		return (
			response.status === 200 &&
			new URL(response.url).host === new URL(this.endpoints.serviceUrl).host
		);
	}

	private getCasLoginUrl(): string {
		return `${this.endpoints.casLoginUrl}?service=${encodeURIComponent(this.endpoints.serviceUrl)}`;
	}
}
