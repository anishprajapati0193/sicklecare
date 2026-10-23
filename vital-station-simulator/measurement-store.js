const DATABASE_NAME = 'rx-elevate-local-records';
const STORE_NAME = 'measurements';
const DATABASE_VERSION = 1;
const FALLBACK_KEY = 'rx-elevate-measurements-v1';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('patientId', 'patientId', { unique: false });
        store.createIndex('measuredAt', 'measuredAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local records.'));
  });
}

function fallbackRecords() {
  try {
    const stored = localStorage.getItem(FALLBACK_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function writeFallback(records) {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(records));
}

function transact(mode, operation) {
  return openDatabase().then(database => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = operation(store);
    let result;
    if (request) {
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error || new Error('Local record operation failed.'));
    }
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('Local record operation failed.'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('Local record operation was cancelled.'));
    };
  }));
}

export async function listAllMeasurements() {
  try {
    return await transact('readonly', store => store.getAll());
  } catch {
    return fallbackRecords();
  }
}

export async function saveMeasurement(record) {
  const records = await listAllMeasurements();
  const next = { ...record, id: record.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}` };
  try {
    await transact('readwrite', store => store.put(next));
  } catch {
    const index = records.findIndex(item => item.id === next.id);
    if (index < 0) records.push(next);
    else records[index] = next;
    writeFallback(records);
  }
  return next;
}

export async function deleteMeasurement(id) {
  try {
    await transact('readwrite', store => store.delete(id));
  } catch {
    writeFallback(fallbackRecords().filter(record => record.id !== id));
  }
}

export async function clearPatientMeasurements(patientId) {
  const records = await listAllMeasurements();
  await Promise.all(records.filter(record => record.patientId === patientId).map(record => deleteMeasurement(record.id)));
}

export function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
