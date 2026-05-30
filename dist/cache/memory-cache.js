// src/cache/memory-cache.ts - LRU memory cache with TTL
export class MemoryCache {
    cache;
    maxSize;
    ttlSeconds;
    constructor(maxSize = 100, ttlSeconds = 1800) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttlSeconds = ttlSeconds;
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return undefined;
        }
        // Move to end (LRU)
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.value;
    }
    set(key, value) {
        // Remove if exists (to update position)
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        // Evict oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + this.ttlSeconds * 1000,
        });
    }
    delete(key) {
        this.cache.delete(key);
    }
    clear() {
        this.cache.clear();
    }
    size() {
        return this.cache.size;
    }
}
//# sourceMappingURL=memory-cache.js.map