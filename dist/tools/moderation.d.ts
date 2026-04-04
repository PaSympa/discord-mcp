import type { ToolResult } from "./types.js";
/** Tool definitions for server moderation (audit log). */
export declare const definitions: {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            guild_id: {
                type: string;
            };
            limit: {
                type: string;
                description: string;
            };
            action_type: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
}[];
/**
 * Handles moderation tools: fetches the guild audit log
 * with optional filtering by action type.
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
                limit: {
                    type: string;
                    description: string;
                };
                action_type: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
    }[];
    handle: typeof handle;
};
export default _default;
//# sourceMappingURL=moderation.d.ts.map