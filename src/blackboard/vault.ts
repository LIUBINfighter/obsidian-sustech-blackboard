interface VaultFileLike {
	path: string;
}

interface VaultLike {
	getAbstractFileByPath(path: string): unknown;
	getFileByPath(path: string): VaultFileLike | null;
	createFolder(path: string): Promise<unknown>;
	createBinary(path: string, data: ArrayBuffer): Promise<unknown>;
	modifyBinary(file: VaultFileLike, data: ArrayBuffer): Promise<unknown>;
}

interface AppLike {
	vault: VaultLike;
}

export async function writeBinaryToVault(app: AppLike, vaultPath: string, data: ArrayBuffer): Promise<void> {
	const normalizedPath = normalizeVaultPath(vaultPath);
	await ensureVaultFolder(app, parentFolderPath(normalizedPath));

	const existing = app.vault.getFileByPath(normalizedPath);
	if (existing) {
		await app.vault.modifyBinary(existing, data);
		return;
	}

	await app.vault.createBinary(normalizedPath, data);
}

async function ensureVaultFolder(app: AppLike, folderPath: string): Promise<void> {
	if (!folderPath) {
		return;
	}

	const segments = normalizeVaultPath(folderPath).split('/').filter(Boolean);
	let currentPath = '';

	for (const segment of segments) {
		currentPath = currentPath ? `${currentPath}/${segment}` : segment;
		if (!app.vault.getAbstractFileByPath(currentPath)) {
			await app.vault.createFolder(currentPath);
		}
	}
}

function parentFolderPath(vaultPath: string): string {
	const lastSlashIndex = vaultPath.lastIndexOf('/');
	return lastSlashIndex === -1 ? '' : vaultPath.slice(0, lastSlashIndex);
}

function normalizeVaultPath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
}
