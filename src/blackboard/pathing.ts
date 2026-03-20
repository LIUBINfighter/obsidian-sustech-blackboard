export function sanitizePathSegment(value: string): string {
	const withoutControls = Array.from(value.trim(), (char) => {
		const code = char.charCodeAt(0);
		return code < 32 ? '_' : char;
	}).join('');
	let sanitized = withoutControls.replace(/[<>:"/\\|?*]/g, '_');
	const reservedNames = new Set([
		'CON',
		'PRN',
		'AUX',
		'NUL',
		'COM1',
		'COM2',
		'COM3',
		'COM4',
		'COM5',
		'COM6',
		'COM7',
		'COM8',
		'COM9',
		'LPT1',
		'LPT2',
		'LPT3',
		'LPT4',
		'LPT5',
		'LPT6',
		'LPT7',
		'LPT8',
		'LPT9',
	]);

	sanitized = sanitized.replace(/^[ .]+|[ .]+$/g, '');
	if (!sanitized) {
		return '_';
	}

	if (reservedNames.has(sanitized.toUpperCase())) {
		sanitized = `_${sanitized}`;
	}

	return sanitized.slice(0, 255);
}

export function joinVaultPath(...segments: string[]): string {
	return segments
		.flatMap((segment) => segment.split('/'))
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0)
		.join('/');
}
