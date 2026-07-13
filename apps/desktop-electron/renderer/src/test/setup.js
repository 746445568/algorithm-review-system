import "@testing-library/jest-dom/vitest";

window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const storage = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  },
});
