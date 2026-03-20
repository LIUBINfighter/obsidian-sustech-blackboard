export interface BlackboardEndpoints {
	casLoginUrl: string;
	serviceUrl: string;
	ultraCourseUrl: string;
	meUrl: string;
	tabActionUrl: string;
}

export function createDefaultEndpoints(): BlackboardEndpoints {
	return {
		casLoginUrl: 'https://cas.sustech.edu.cn/cas/login',
		serviceUrl: 'https://bb.sustech.edu.cn/webapps/login/',
		ultraCourseUrl: 'https://bb.sustech.edu.cn/ultra/course',
		meUrl: 'https://bb.sustech.edu.cn/learn/api/public/v1/users/me',
		tabActionUrl: 'https://bb.sustech.edu.cn/webapps/portal/execute/tabs/tabAction',
	};
}
