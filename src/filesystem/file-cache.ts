// src/filesystem/file-cache.ts

interface CacheEntry {
  data: string;
  timestamp: number;
}

export class FileCache {
  private cache: Map<string, CacheEntry> = new Map();

  constructor(
    private enabled: boolean,
    private timeout: number
  ) {}

  get(key: string): string | null {
    if (!this.enabled) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.timeout) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: string): void {
    if (!this.enabled) return;

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
