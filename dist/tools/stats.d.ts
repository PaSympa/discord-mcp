import type { ToolResult } from "./types.js";
/** Tool definitions for server statistics (members, channels, boosts). */
export declare const definitions: {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            guild_id: {
                type: string;
            };
        };
        required: string[];
    };
}[];
/**
 * Handles stats tools: returns a snapshot of server metrics
 * including member counts, channel breakdown, and boost info.
 */
export declare function handle(name: string, args: Record<string, unknown>): Promise<ToolResult | null>;
declare const _default: {
    definitions: {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                guild_id: {
                    type: string;
                };
            };
            required: string[];
        };
    }[];
    handle: typeof handle;
};
export default _default;
//# sourceMappingURL=stats.d.ts.map