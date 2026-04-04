import type { ToolResult } from "./types.js";
/** Tool definitions for creating, editing, deleting, and assigning roles. */
export declare const definitions: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            guild_id: {
                type: string;
            };
            name?: undefined;
            color?: undefined;
            hoist?: undefined;
            mentionable?: undefined;
            permissions?: undefined;
            role_id?: undefined;
            reason?: undefined;
            user_id?: undefined;
            position?: undefined;
            icon?: undefined;
            unicode_emoji?: undefined;
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
            name: {
                type: string;
            };
            color: {
                type: string;
                description: string;
            };
            hoist: {
                type: string;
            };
            mentionable: {
                type: string;
            };
            permissions: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            role_id?: undefined;
            reason?: undefined;
            user_id?: undefined;
            position?: undefined;
            icon?: undefined;
            unicode_emoji?: undefined;
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
            role_id: {
                type: string;
            };
            name: {
                type: string;
            };
            color: {
                type: string;
                description?: undefined;
            };
            hoist: {
                type: string;
            };
            mentionable: {
                type: string;
            };
            permissions: {
                type: string;
                items: {
                    type: string;
                };
                description?: undefined;
            };
            reason?: undefined;
            user_id?: undefined;
            position?: undefined;
            icon?: undefined;
            unicode_emoji?: undefined;
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
            role_id: {
                type: string;
            };
            reason: {
                type: string;
            };
            name?: undefined;
            color?: undefined;
            hoist?: undefined;
            mentionable?: undefined;
            permissions?: undefined;
            user_id?: undefined;
            position?: undefined;
            icon?: undefined;
            unicode_emoji?: undefined;
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
            user_id: {
                type: string;
            };
            role_id: {
                type: string;
            };
            reason: {
                type: string;
            };
            name?: undefined;
            color?: undefined;
            hoist?: undefined;
            mentionable?: undefined;
            permissions?: undefined;
            position?: undefined;
            icon?: undefined;
            unicode_emoji?: undefined;
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
            role_id: {
                type: string;
            };
            name?: undefined;
            color?: undefined;
            hoist?: undefined;
            mentionable?: undefined;
            permissions?: undefined;
            reason?: undefined;
            user_id?: undefined;
            position?: undefined;
            icon?: undefined;
            unicode_emoji?: undefined;
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
            role_id: {
                type: string;
            };
            position: {
                type: string;
            };
            name?: undefined;
            color?: undefined;
            hoist?: undefined;
            mentionable?: undefined;
            permissions?: undefined;
            reason?: undefined;
            user_id?: undefined;
            icon?: undefined;
            unicode_emoji?: undefined;
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
            role_id: {
                type: string;
            };
            icon: {
                type: string;
                description: string;
            };
            unicode_emoji: {
                type: string;
                description: string;
            };
            name?: undefined;
            color?: undefined;
            hoist?: undefined;
            mentionable?: undefined;
            permissions?: undefined;
            reason?: undefined;
            user_id?: undefined;
            position?: undefined;
        };
        required: string[];
    };
})[];
/**
 * Handles role tools: list all roles, CRUD operations,
 * assign/remove from members, and list members by role.
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
                name?: undefined;
                color?: undefined;
                hoist?: undefined;
                mentionable?: undefined;
                permissions?: undefined;
                role_id?: undefined;
                reason?: undefined;
                user_id?: undefined;
                position?: undefined;
                icon?: undefined;
                unicode_emoji?: undefined;
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
                name: {
                    type: string;
                };
                color: {
                    type: string;
                    description: string;
                };
                hoist: {
                    type: string;
                };
                mentionable: {
                    type: string;
                };
                permissions: {
                    type: string;
                    items: {
                        type: string;
                    };
                    description: string;
                };
                role_id?: undefined;
                reason?: undefined;
                user_id?: undefined;
                position?: undefined;
                icon?: undefined;
                unicode_emoji?: undefined;
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
                role_id: {
                    type: string;
                };
                name: {
                    type: string;
                };
                color: {
                    type: string;
                    description?: undefined;
                };
                hoist: {
                    type: string;
                };
                mentionable: {
                    type: string;
                };
                permissions: {
                    type: string;
                    items: {
                        type: string;
                    };
                    description?: undefined;
                };
                reason?: undefined;
                user_id?: undefined;
                position?: undefined;
                icon?: undefined;
                unicode_emoji?: undefined;
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
                role_id: {
                    type: string;
                };
                reason: {
                    type: string;
                };
                name?: undefined;
                color?: undefined;
                hoist?: undefined;
                mentionable?: undefined;
                permissions?: undefined;
                user_id?: undefined;
                position?: undefined;
                icon?: undefined;
                unicode_emoji?: undefined;
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
                user_id: {
                    type: string;
                };
                role_id: {
                    type: string;
                };
                reason: {
                    type: string;
                };
                name?: undefined;
                color?: undefined;
                hoist?: undefined;
                mentionable?: undefined;
                permissions?: undefined;
                position?: undefined;
                icon?: undefined;
                unicode_emoji?: undefined;
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
                role_id: {
                    type: string;
                };
                name?: undefined;
                color?: undefined;
                hoist?: undefined;
                mentionable?: undefined;
                permissions?: undefined;
                reason?: undefined;
                user_id?: undefined;
                position?: undefined;
                icon?: undefined;
                unicode_emoji?: undefined;
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
                role_id: {
                    type: string;
                };
                position: {
                    type: string;
                };
                name?: undefined;
                color?: undefined;
                hoist?: undefined;
                mentionable?: undefined;
                permissions?: undefined;
                reason?: undefined;
                user_id?: undefined;
                icon?: undefined;
                unicode_emoji?: undefined;
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
                role_id: {
                    type: string;
                };
                icon: {
                    type: string;
                    description: string;
                };
                unicode_emoji: {
                    type: string;
                    description: string;
                };
                name?: undefined;
                color?: undefined;
                hoist?: undefined;
                mentionable?: undefined;
                permissions?: undefined;
                reason?: undefined;
                user_id?: undefined;
                position?: undefined;
            };
            required: string[];
        };
    })[];
    handle: typeof handle;
};
export default _default;
//# sourceMappingURL=roles.d.ts.map