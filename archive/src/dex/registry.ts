import { Uniswap } from "./uniswap/index.js";

import { Aerodrome } from "./aerodrome/index.js";

import type { Dex } from "./types.js";

export const DEXES: Dex[] = [

    Uniswap,

    Aerodrome

];