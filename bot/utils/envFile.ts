/**
 * Minimal .env loader — drop-in replacement for `dotenv` without its
 * advertising/telemetry output (dotenv v17 prints a third-party promo line to
 * stdout on every load, which pollutes logs and breaks stdio protocols).
 *
 * Semantics match dotenv's defaults:
 * - existing process.env keys are NOT overridden (no `override` option)
 * - supports comments (#), blank lines, optional `export ` prefix
 * - values may be single/double quoted; \n \r \t \\ are expanded in double quotes
 * - optional inline comments after unquoted values
 *
 * No dependency, no network, no stdout/stderr output.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface EnvLoadResult {
    /** Key/value pairs that were applied to process.env. */
    parsed: Record<string, string>;
    /** Set when the file could not be read or parsed. */
    error?: Error;
}

/**
 * Expand escapes in a double-quoted value in a single left-to-right pass.
 * `\\` is consumed as a literal backslash before any single-char escape, so an
 * escaped sequence like `\\n` (backslash + n) stays literal instead of becoming
 * a newline. Recognized escapes: \n \r \t \\; any other `\x` stays as-is.
 */
function unescapeDoubleQuoted(value: string): string {
    let out = "";
    for (let i = 0; i < value.length; i++) {
        const c = value[i];
        if (c !== "\\" || i === value.length - 1) { out += c; continue; }
        const next = value[++i];
        if (next === "n") out += "\n";
        else if (next === "r") out += "\r";
        else if (next === "t") out += "\t";
        else if (next === "\\") out += "\\";
        else out += "\\" + next; // unknown escape: keep both chars
    }
    return out;
}

/** Parse .env content into a key/value map (pure, no side effects). */
export function parseEnv(src: string): Record<string, string> {
    const out: Record<string, string> = {};
    // dotenv treats \r\n and \r as newlines too.
    const lines = src.replace(/\r\n?/g, "\n").split("\n");

    for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        if (line.startsWith("export ")) line = line.slice(7).trim();

        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        if (!key) continue;

        let value = line.slice(eq + 1).trim();
        const first = value[0];
        if (first === '"' || first === "'") {
            const quote = first;
            // Take up to the matching closing quote.
            const end = value.indexOf(quote, 1);
            value = end === -1 ? value.slice(1) : value.slice(1, end);
            if (quote === '"') {
                value = unescapeDoubleQuoted(value);
            }
        } else {
            // Strip an optional inline comment preceded by whitespace.
            const hash = value.search(/\s#/);
            if (hash !== -1) value = value.slice(0, hash).trim();
        }
        out[key] = value;
    }
    return out;
}

/**
 * Load a .env file into process.env. Does not override existing keys.
 * Silently no-ops when `path` is undefined. Never writes to stdout/stderr.
 */
export function loadEnvFile(path?: string): EnvLoadResult {
    if (!path) return { parsed: {} };
    const full = resolve(path);
    try {
        const src = readFileSync(full, "utf8");
        const parsed = parseEnv(src);
        for (const [k, v] of Object.entries(parsed)) {
            if (process.env[k] === undefined) process.env[k] = v;
        }
        return { parsed };
    } catch (e) {
        return { parsed: {}, error: e instanceof Error ? e : new Error(String(e)) };
    }
}
