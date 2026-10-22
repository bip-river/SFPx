export const STORAGE_KEY = 'sfp-demo-state';

export function createSelectionStorage(getStorage = () => sessionStorage) {
  return {
    read() {
      try { return JSON.parse(getStorage().getItem(STORAGE_KEY) || 'null'); }
      catch { return null; }
    },
    write(value) {
      try { getStorage().setItem(STORAGE_KEY, JSON.stringify(value)); }
      catch { /* Resume is optional when storage is unavailable. */ }
    },
    clear() {
      try { getStorage().removeItem(STORAGE_KEY); }
      catch { /* Storage can be unavailable in private contexts. */ }
    },
    clearLegacyTransaction() {
      try { getStorage().removeItem('sfp-demo-transaction-ref'); }
      catch { /* Old transaction IDs must never be reused. */ }
    }
  };
}
