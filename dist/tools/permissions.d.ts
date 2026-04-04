import type { ToolResult } from "./types.js";
/** Tool definitions for viewing and managing per-channel permission overwrites. */
export declare const definitions: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            channel_id: {
                type: string;
            };
            role_id?: undefined;
            allow?: undefined;
            deny?: undefined;
            reason?: undefined;
            user_id?: undefined;
            source_channel_id?: undefined;
            target_channel_id?: undefined;
            guild_id?: undefined;
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
            role_id: {
                type: string;
            };
            allow: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            deny: {
                type: string;
                items: {
                    type: string;
                };
            };
            reason: {
                type: string;
            };
            user_id?: undefined;
            source_channel_id?: undefined;
            target_channel_id?: undefined;
            guild_id?: undefined;
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
            user_id: {
                type: string;
            };
            allow: {
                type: string;
                items: {
                    type: string;
                };
                description?: undefined;
            };
            deny: {
                type: string;
                items: {
                    type: string;
                };
            };
            reason: {
                type: string;
            };
            role_id?: undefined;
            source_channel_id?: undefined;
            target_channel_id?: undefined;
            guild_id?: undefined;
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
            reason: {
                type: string;
            };
            role_id?: undefined;
            allow?: undefined;
            deny?: undefined;
            user_id?: undefined;
            source_channel_id?: undefined;
            target_channel_id?: undefined;
            guild_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            source_channel_id: {
                type: string;
            };
            target_channel_id: {
                type: string;
            };
            reason: {
                type: string;
            };
            channel_id?: undefined;
            role_id?: undefined;
            allow?: undefined;
            deny?: undefined;
            user_id?: undefined;
            guild_id?: undefined;
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
            channel_id?: undefined;
            role_id?: undefined;
            allow?: undefined;
            deny?: undefined;
            reason?: undefined;
            user_id?: undefined;
            source_channel_id?: undefined;
            target_channel_id?: undefined;
        };
        required: string[];
    };
})[];
/**
 * Handles permission tools: view overwrites, set per-role/per-member permissions,
 * reset to inherited, copy between channels, and full guild audit.
 */
export declare function handle(name: string, args: Record<string, unknown>): Promise<ToolResult | null>;
declare const _default: {
    definitions: ({
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                channel_id: {
                    type: string;
                };
                role_id?: undefined;
                allow?: undefined;
                deny?: undefined;
                reason?: undefined;
                user_id?: undefined;
                source_channel_id?: undefined;
                target_channel_id?: undefined;
                guild_id?: undefined;
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
                role_id: {
                    type: string;
                };
                allow: {
                    type: string;
                    items: {
                        type: string;
                    };
                    description: string;
                };
                deny: {
                    type: string;
                    items: {
                        type: string;
                    };
                };
                reason: {
                    type: string;
                };
                user_id?: undefined;
                source_channel_id?: undefined;
                target_channel_id?: undefined;
                guild_id?: undefined;
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
                user_id: {
                    type: string;
                };
                allow: {
                    type: string;
                    items: {
                        type: string;
                    };
                    description?: undefined;
                };
                deny: {
                    type: string;
                    items: {
                        type: string;
                    };
                };
                reason: {
                    type: string;
                };
                role_id?: undefined;
                source_channel_id?: undefined;
                target_channel_id?: undefined;
                guild_id?: undefined;
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
                reason: {
                    type: string;
                };
                role_id?: undefined;
                allow?: undefined;
                deny?: undefined;
                user_id?: undefined;
                source_channel_id?: undefined;
                target_channel_id?: undefined;
                guild_id?: undefined;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                source_channel_id: {
                    type: string;
                };
                target_channel_id: {
                    type: string;
                };
                reason: {
                    type: string;
                };
                channel_id?: undefined;
                role_id?: undefined;
                allow?: undefined;
                deny?: undefined;
                user_id?: undefined;
                guild_id?: undefined;
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
                channel_id?: undefined;
                role_id?: undefined;
                allow?: undefined;
                deny?: undefined;
                reason?: undefined;
                user_id?: undefined;
                source_channel_id?: undefined;
                target_channel_id?: undefined;
            };
            required: string[];
        };
    })[];
    handle: typeof handle;
};
export default _default;
//# sourceMappingURL=permissions.d.ts.map