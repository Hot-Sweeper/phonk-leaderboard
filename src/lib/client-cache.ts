type CacheEntry<T> = {
  expiresAt: number;
  data: T;
};

function safeRead<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || typeof parsed.expiresAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeWrite<T>(key: string, value: CacheEntry<T>) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors (quota/private mode)
  }
}

export async function fetchJsonWithSessionCache<T>(
  key: string,
  url: string,
  ttlMs = 60_000,
  init?: RequestInit
): Promise<T> {
  if (typeof window === "undefined") {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return (await res.json()) as T;
  }

  const entry = safeRead<T>(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data;
  }

  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const data = (await res.json()) as T;
  safeWrite<T>(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

export function clearSessionCacheByPrefix(prefix: string) {
  if (typeof window === "undefined") return;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage errors
  }
}
