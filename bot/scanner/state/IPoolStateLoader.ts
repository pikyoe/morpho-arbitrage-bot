import { PoolStateCache } from "./PoolStateCache.js";

export interface IPoolStateLoader {

    load(): Promise<void>;

    refresh(): Promise<void>;

    cache(): PoolStateCache;

}