import { ROUTES } from "./paths.js";

import { TOKENS } from "../config/tokens.js";

export function buildPaths() {

    return ROUTES.map(route => ({

        name:

            route.name,

        addresses:

            route.tokens.map(

                token =>

                    TOKENS[token as keyof typeof TOKENS]

            )

    }));

}