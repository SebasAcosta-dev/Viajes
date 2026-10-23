export type BrowserStorageArea = "local" | "session";

function storageFor(area: BrowserStorageArea): Storage {
  if (typeof window === "undefined") throw new Error("El almacenamiento local solo está disponible en el navegador.");
  return area === "local" ? window.localStorage : window.sessionStorage;
}

export const localPersistenceAdapter = {
  getItem(key: string, area: BrowserStorageArea = "local"): string | null {
    return storageFor(area).getItem(key);
  },

  setItem(key: string, value: string, area: BrowserStorageArea = "local"): void {
    storageFor(area).setItem(key, value);
  },

  removeItem(key: string, area: BrowserStorageArea = "local"): void {
    storageFor(area).removeItem(key);
  },

  readJson<T>(key: string, fallback: T, errorMessage: string, area: BrowserStorageArea = "local"): T {
    const serialized = storageFor(area).getItem(key);
    if (!serialized) return fallback;
    try {
      return JSON.parse(serialized) as T;
    } catch {
      throw new Error(errorMessage);
    }
  },

  writeJson<T>(key: string, value: T, area: BrowserStorageArea = "local"): void {
    storageFor(area).setItem(key, JSON.stringify(value));
  },
};

export const LOCAL_DATA_CORRUPTION_MESSAGE = "Los datos locales están dañados y no se han sobrescrito. Borra el almacenamiento de Viajes para reiniciar el modo demo.";
