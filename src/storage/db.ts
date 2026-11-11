/**
 * IndexedDB 저장소. 학생 개인정보는 저장하지 않습니다.
 * - sessions: 게임별 이용 기록(시작 시각, 체험 시간, 완료 여부, 요약 수치)
 * - logs: 오류 로그
 * - data: 누적 학습 데이터 등 키-값
 */
const DB_NAME = 'ai-future-lab';
const DB_VERSION = 1;

export interface SessionRecord {
  id?: number;
  game: string;
  startedAt: number;
  durationSec: number;
  completed: boolean;
  metric?: string;
}

export interface LogRecord {
  id?: number;
  time: number;
  level: 'error' | 'warn' | 'info';
  message: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB 없음'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('logs')) db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function addSession(r: SessionRecord) {
  try {
    await tx('sessions', 'readwrite', (s) => s.add(r));
  } catch (e) {
    console.warn('세션 기록 실패', e);
  }
}

export async function listSessions(): Promise<SessionRecord[]> {
  try {
    return await tx<SessionRecord[]>('sessions', 'readonly', (s) => s.getAll());
  } catch {
    return [];
  }
}

const MAX_LOGS = 500;

export async function addLog(level: LogRecord['level'], message: string) {
  try {
    await tx('logs', 'readwrite', (s) => s.add({ time: Date.now(), level, message: message.slice(0, 2000) }));
    const count = await tx<number>('logs', 'readonly', (s) => s.count());
    if (count > MAX_LOGS) {
      const keys = await tx<IDBValidKey[]>('logs', 'readonly', (s) => s.getAllKeys(null, count - MAX_LOGS));
      await Promise.all(keys.map((k) => tx('logs', 'readwrite', (s) => s.delete(k))));
    }
  } catch {
    /* 로그 저장 실패는 무시 */
  }
}

export async function listLogs(): Promise<LogRecord[]> {
  try {
    return await tx<LogRecord[]>('logs', 'readonly', (s) => s.getAll());
  } catch {
    return [];
  }
}

export async function clearStore(store: 'sessions' | 'logs' | 'data') {
  try {
    await tx(store, 'readwrite', (s) => s.clear());
  } catch (e) {
    console.warn(e);
  }
}

export async function getData<T>(key: string): Promise<T | undefined> {
  try {
    return await tx<T>('data', 'readonly', (s) => s.get(key));
  } catch {
    return undefined;
  }
}

export async function setData(key: string, value: unknown) {
  try {
    await tx('data', 'readwrite', (s) => s.put(value, key));
  } catch (e) {
    console.warn(e);
  }
}

export async function deleteData(key: string) {
  try {
    await tx('data', 'readwrite', (s) => s.delete(key));
  } catch (e) {
    console.warn(e);
  }
}
