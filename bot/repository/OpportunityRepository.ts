import { ArbitrageCandidate } from "../scanner/MarketPairScanner.js";

interface RepositoryItem {

    opportunity: ArbitrageCandidate;

    createdAt: number;

}

export class OpportunityRepository {

    private readonly opportunities =
        new Map<string, RepositoryItem>();

    private readonly ttl = 60_000;

    public save(
        opportunity: ArbitrageCandidate
    ) {

        if (!opportunity.id) {
            return;
        }

        this.opportunities.set(
            opportunity.id,
            {
                opportunity,
                createdAt: Date.now()
            }
        );

    }

    public get(
        id: string
    ) {

        return this.opportunities.get(id);

    }

    public has(
        id: string
    ) {

        return this.opportunities.has(id);

    }

    public remove(
        id: string
    ) {

        this.opportunities.delete(id);

    }

    public clear() {

        this.opportunities.clear();

    }

    public cleanup() {

        const now = Date.now();

        for (

            const [id, item]

            of this.opportunities

        ) {

            if (

                now - item.createdAt >

                this.ttl

            ) {

                this.opportunities.delete(id);

            }

        }

    }

    public upsert(

        opportunity: ArbitrageCandidate

    ) {

        if (!opportunity.id) {
            return;
        }

        this.opportunities.set(
            opportunity.id,
            {
                opportunity,
                createdAt: Date.now()
            }
        );

    }

    public values() {

        return [

            ...this.opportunities.values()

        ];

    }

}