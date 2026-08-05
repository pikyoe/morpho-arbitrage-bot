export class AdapterRegistry {

    private adapters = new Map<string, string>();

    register(
        dex: string,
        adapter: string
    ) {
        this.adapters.set(
            dex.toUpperCase(),
            adapter
        );
    }

    get(
        dex: string
    ): string {

        const adapter =
            this.adapters.get(
                dex.toUpperCase()
            );

        if (!adapter) {

            throw new Error(
                `Adapter not found: ${dex}`
            );

        }

        return adapter;
    }

}

