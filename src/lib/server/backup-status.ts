import fs from 'node:fs';
import path from 'node:path';

export type BackupStatus = {
	at: string;
	snapshotOk: boolean;
	snapshotFile: string;
	snapshotBytes: number;
	drive: 'ok' | 'failed' | 'off';
	stale: boolean; // ostatnia kopia starsza niż 36 h
};

const STALE_MS = 36 * 60 * 60 * 1000;

/** Stan ostatniej kopii zapisany przez backup.sh (data/backup/status.json). Brak/błędny plik → null. */
export function readBackupStatus(dataDir = process.env.DATA_DIR ?? path.resolve('data')): BackupStatus | null {
	try {
		const file = path.join(dataDir, 'backup', 'status.json');
		const st = fs.lstatSync(file);
		if (!st.isFile() || st.size > 4096) return null;
		const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
		const at = typeof raw.at === 'string' ? raw.at : '';
		const time = Date.parse(at);
		if (!Number.isFinite(time)) return null;
		const drive = raw.drive === 'ok' || raw.drive === 'failed' ? raw.drive : 'off';
		return {
			at: new Date(time).toISOString(),
			snapshotOk: raw.snapshotOk === true,
			snapshotFile: typeof raw.snapshotFile === 'string' ? raw.snapshotFile.slice(0, 80) : '',
			snapshotBytes: Number.isFinite(raw.snapshotBytes) ? Number(raw.snapshotBytes) : 0,
			drive,
			stale: Date.now() - time > STALE_MS
		};
	} catch {
		return null;
	}
}
