import type { Ref } from 'vue';

export function usePersistentRef<T>(key: string, defaultValue: T): Ref<T> {
  const state = ref<T>(readFromStorage(key, defaultValue));

  watch(
    state,
    (value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      }
      catch {
      }
    },
    { deep: true },
  );

  return state as Ref<T>;
}

function readFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return structuredClone(defaultValue);
    }
    const parsed = JSON.parse(raw) as T;
    if (isPlainObject(defaultValue) && isPlainObject(parsed)) {
      return { ...defaultValue, ...parsed };
    }
    return parsed;
  }
  catch {
    return structuredClone(defaultValue);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
