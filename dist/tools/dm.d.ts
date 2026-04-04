import type { ToolResult } from "./types.js";
/** Tool definitions for sending direct messages to users. */
export declare const definitions: {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            user_id: {
                type: string;
                description: string;
            };
            content: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
}[];
/** Handles direct message tools. */
declare function handle(name: string, args: Record<string, unknown>): Promise<ToolResult | null>;
declare const _default: {
    definitions: {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                user_id: {
                    type: string;
                    description: string;
                };
                content: {
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
//# sourceMappingURL=dm.d.ts.map