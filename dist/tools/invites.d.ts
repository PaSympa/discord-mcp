import type { ToolResult } from "./types.js";
/** Tool definitions for managing guild invites. */
export declare const definitions: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            guild_id: {
                type: string;
            };
            invite_code?: undefined;
            channel_id?: undefined;
            max_age?: undefined;
            max_uses?: undefined;
            unique?: undefined;
            temporary?: undefined;
            reason?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            invite_code: {
                type: string;
                description: string;
            };
            guild_id?: undefined;
            channel_id?: undefined;
            max_age?: undefined;
            max_uses?: undefined;
            unique?: undefined;
            temporary?: undefined;
            reason?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            channel_id: {
                type: string;
            };
            max_age: {
                type: string;
                description: string;
            };
            max_uses: {
                type: string;
                description: string;
            };
            unique: {
                type: string;
                description: string;
            };
            temporary: {
                type: string;
                description: string;
            };
            guild_id?: undefined;
            invite_code?: undefined;
            reason?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            invite_code: {
                type: string;
                description: string;
            };
            reason: {
                type: string;
            };
            guild_id?: undefined;
            channel_id?: undefined;
            max_age?: undefined;
            max_uses?: undefined;
            unique?: undefined;
            temporary?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            channel_id: {
                type: string;
            };
            guild_id?: undefined;
            invite_code?: undefined;
            max_age?: undefined;
            max_uses?: undefined;
            unique?: undefined;
            temporary?: undefined;
            reason?: undefined;
        };
        required: string[];
    };
})[];
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
                invite_code?: undefined;
                channel_id?: undefined;
                max_age?: undefined;
                max_uses?: undefined;
                unique?: undefined;
                temporary?: undefined;
                reason?: undefined;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                invite_code: {
                    type: string;
                    description: string;
                };
                guild_id?: undefined;
                channel_id?: undefined;
                max_age?: undefined;
                max_uses?: undefined;
                unique?: undefined;
                temporary?: undefined;
                reason?: undefined;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                channel_id: {
                    type: string;
                };
                max_age: {
                    type: string;
                    description: string;
                };
                max_uses: {
                    type: string;
                    description: string;
                };
                unique: {
                    type: string;
                    description: string;
                };
                temporary: {
                    type: string;
                    description: string;
                };
                guild_id?: undefined;
                invite_code?: undefined;
                reason?: undefined;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                invite_code: {
                    type: string;
                    description: string;
                };
                reason: {
                    type: string;
                };
                guild_id?: undefined;
                channel_id?: undefined;
                max_age?: undefined;
                max_uses?: undefined;
                unique?: undefined;
                temporary?: undefined;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                channel_id: {
                    type: string;
                };
                guild_id?: undefined;
                invite_code?: undefined;
                max_age?: undefined;
                max_uses?: undefined;
                unique?: undefined;
                temporary?: undefined;
                reason?: undefined;
            };
            required: string[];
        };
    })[];
    handle: typeof handle;
};
export default _default;
//# sourceMappingURL=invites.d.ts.map