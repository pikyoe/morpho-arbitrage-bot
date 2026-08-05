import type { Opportunity } from "../types/opportunity.js";

export function selectBest(

    list: Opportunity[]

): Opportunity | null {

    if (list.length === 0)

        return null;

    return list.reduce(

        (best, current) =>

            current.netProfit >

            best.netProfit

                ? current

                : best

    );

}