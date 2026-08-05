import { IPoolStateLoader } from "./IPoolStateLoader.js";
import { PoolStateCache } from "./PoolStateCache.js";

export class PoolStateLoader
    implements IPoolStateLoader
{

    constructor(

        private readonly loaders:
            IPoolStateLoader[]

    ) {}

    async load(): Promise<void> {

        await this.refresh();

    }

    async refresh(): Promise<void> {

        await Promise.all(

            this.loaders.map(

                loader =>

                    loader.refresh()

            )

        );

    }

    cache(): PoolStateCache {

        return this.loaders[0].cache();

    }

}