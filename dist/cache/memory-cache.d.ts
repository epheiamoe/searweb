export declare class MemoryCache<T> {
    private cache;
    private maxSize;
    private ttlSeconds;
    constructor(maxSize?: number, ttlSeconds?: number);
    get(key: string): T | undefined;
    set(key: string, value: T): void;
    delete(key: string): void;
    clear(): void;
    size(): number;
}
//# sourceMappingURL=memory-cache.d.ts.map