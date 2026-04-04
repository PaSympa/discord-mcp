import type { ToolResult } from "./types.js";
/** Tool definitions for reading and updating the guild membership screening form. */
export declare const definitions: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            guild_id: {
                type: string;
            };
            description?: undefined;
            form_fields?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            guild_id: {
                type: string;
            };
            description: {
                type: string;
                description: string;
            };
            form_fields: {
                type: string;
                description: string;
                items: {
                    type: string;
                    properties: {
                        label: {
                            type: string;
                            description: string;
                        };
                        values: {
                            type: string;
                            items: {
                                type: string;
                            };
                            description: string;
                        };
                        required: {
                            type: string;
                            description: string;
                        };
                    };
                    required: string[];
                };
            };
        };
        required: string[];
    };
})[];
/**
 * Handles membership screening tools: fetch the current verification form
 * and update it with new descriptions/rules via the Discord REST API.
 */
export declare function handle(name: string, args: Record<string, unknown>): Promise<ToolResult | null>;
declare const _default: {
    definitions: ({
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                guild_id: {
                    type: string;
                };
                description?: undefined;
                form_fields?: undefined;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                guild_id: {
                    type: string;
                };
                description: {
                    type: string;
                    description: string;
                };
                form_fields: {
                    type: string;
                    description: string;
                    items: {
                        type: string;
                        properties: {
                            label: {
                                type: string;
                                description: string;
                            };
                            values: {
                                type: string;
                                items: {
                                    type: string;
                                };
                                description: string;
                            };
                            required: {
                                type: string;
                                description: string;
                            };
                        };
                        required: string[];
                    };
                };
            };
            required: string[];
        };
    })[];
    handle: typeof handle;
};
export default _default;
//# sourceMappingURL=screening.d.ts.map