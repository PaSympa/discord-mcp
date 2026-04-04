import type { ToolResult } from "./types.js";
/** Tool definitions for listing, inspecting, and moderating guild members. */
export declare const definitions: ({
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
            user_id?: undefined;
            reason?: undefined;
            delete_message_days?: undefined;
            duration_minutes?: undefined;
            query?: undefined;
            nickname?: undefined;
            user_ids?: undefined;
            delete_message_seconds?: undefined;
            days?: undefined;
            roles?: undefined;
            dry_run?: undefined;
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
            limit?: undefined;
            reason?: undefined;
            delete_message_days?: undefined;
            duration_minutes?: undefined;
            query?: undefined;
            nickname?: undefined;
            user_ids?: undefined;
            delete_message_seconds?: undefined;
            days?: undefined;
            roles?: undefined;
            dry_run?: undefined;
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
            reason: {
                type: string;
            };
            limit?: undefined;
            delete_message_days?: undefined;
            duration_minutes?: undefined;
            query?: undefined;
            nickname?: undefined;
            user_ids?: undefined;
            delete_message_seconds?: undefined;
            days?: undefined;
            roles?: undefined;
            dry_run?: undefined;
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
            reason: {
                type: string;
            };
            delete_message_days: {
                type: string;
                description: string;
            };
            limit?: undefined;
            duration_minutes?: undefined;
            query?: undefined;
            nickname?: undefined;
            user_ids?: undefined;
            delete_message_seconds?: undefined;
            days?: undefined;
            roles?: undefined;
            dry_run?: undefined;
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
            duration_minutes: {
                type: string;
            };
            reason: {
                type: string;
            };
            limit?: undefined;
            delete_message_days?: undefined;
            query?: undefined;
            nickname?: undefined;
            user_ids?: undefined;
            delete_message_seconds?: undefined;
            days?: undefined;
            roles?: undefined;
            dry_run?: undefined;
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
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            user_id?: undefined;
            reason?: undefined;
            delete_message_days?: undefined;
            duration_minutes?: undefined;
            nickname?: undefined;
            user_ids?: undefined;
            delete_message_seconds?: undefined;
            days?: undefined;
            roles?: undefined;
            dry_run?: undefined;
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
            nickname: {
                type: string;
                description: string;
            };
            reason: {
                type: string;
            };
            limit?: undefined;
            delete_message_days?: undefined;
            duration_minutes?: undefined;
            query?: undefined;
            user_ids?: undefined;
            delete_message_seconds?: undefined;
            days?: undefined;
            roles?: undefined;
            dry_run?: undefined;
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
            user_ids: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            delete_message_seconds: {
                type: string;
                description: string;
            };
            reason: {
                type: string;
            };
            limit?: undefined;
            user_id?: undefined;
            delete_message_days?: undefined;
            duration_minutes?: undefined;
            query?: undefined;
            nickname?: undefined;
            days?: undefined;
            roles?: undefined;
            dry_run?: undefined;
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
            days: {
                type: string;
                description: string;
            };
            roles: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            dry_run: {
                type: string;
                description: string;
            };
            reason: {
                type: string;
            };
            limit?: undefined;
            user_id?: undefined;
            delete_message_days?: undefined;
            duration_minutes?: undefined;
            query?: undefined;
            nickname?: undefined;
            user_ids?: undefined;
            delete_message_seconds?: undefined;
        };
        required: string[];
    };
})[];
/**
 * Handles member tools: list with roles, detailed info,
 * kick, ban, unban, and timeout management.
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
                limit: {
                    type: string;
                    description: string;
                };
                user_id?: undefined;
                reason?: undefined;
                delete_message_days?: undefined;
                duration_minutes?: undefined;
                query?: undefined;
                nickname?: undefined;
                user_ids?: undefined;
                delete_message_seconds?: undefined;
                days?: undefined;
                roles?: undefined;
                dry_run?: undefined;
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
                limit?: undefined;
                reason?: undefined;
                delete_message_days?: undefined;
                duration_minutes?: undefined;
                query?: undefined;
                nickname?: undefined;
                user_ids?: undefined;
                delete_message_seconds?: undefined;
                days?: undefined;
                roles?: undefined;
                dry_run?: undefined;
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
                reason: {
                    type: string;
                };
                limit?: undefined;
                delete_message_days?: undefined;
                duration_minutes?: undefined;
                query?: undefined;
                nickname?: undefined;
                user_ids?: undefined;
                delete_message_seconds?: undefined;
                days?: undefined;
                roles?: undefined;
                dry_run?: undefined;
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
                reason: {
                    type: string;
                };
                delete_message_days: {
                    type: string;
                    description: string;
                };
                limit?: undefined;
                duration_minutes?: undefined;
                query?: undefined;
                nickname?: undefined;
                user_ids?: undefined;
                delete_message_seconds?: undefined;
                days?: undefined;
                roles?: undefined;
                dry_run?: undefined;
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
                duration_minutes: {
                    type: string;
                };
                reason: {
                    type: string;
                };
                limit?: undefined;
                delete_message_days?: undefined;
                query?: undefined;
                nickname?: undefined;
                user_ids?: undefined;
                delete_message_seconds?: undefined;
                days?: undefined;
                roles?: undefined;
                dry_run?: undefined;
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
                query: {
                    type: string;
                    description: string;
                };
                limit: {
                    type: string;
                    description: string;
                };
                user_id?: undefined;
                reason?: undefined;
                delete_message_days?: undefined;
                duration_minutes?: undefined;
                nickname?: undefined;
                user_ids?: undefined;
                delete_message_seconds?: undefined;
                days?: undefined;
                roles?: undefined;
                dry_run?: undefined;
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
                nickname: {
                    type: string;
                    description: string;
                };
                reason: {
                    type: string;
                };
                limit?: undefined;
                delete_message_days?: undefined;
                duration_minutes?: undefined;
                query?: undefined;
                user_ids?: undefined;
                delete_message_seconds?: undefined;
                days?: undefined;
                roles?: undefined;
                dry_run?: undefined;
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
                user_ids: {
                    type: string;
                    items: {
                        type: string;
                    };
                    description: string;
                };
                delete_message_seconds: {
                    type: string;
                    description: string;
                };
                reason: {
                    type: string;
                };
                limit?: undefined;
                user_id?: undefined;
                delete_message_days?: undefined;
                duration_minutes?: undefined;
                query?: undefined;
                nickname?: undefined;
                days?: undefined;
                roles?: undefined;
                dry_run?: undefined;
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
                days: {
                    type: string;
                    description: string;
                };
                roles: {
                    type: string;
                    items: {
                        type: string;
                    };
                    description: string;
                };
                dry_run: {
                    type: string;
                    description: string;
                };
                reason: {
                    type: string;
                };
                limit?: undefined;
                user_id?: undefined;
                delete_message_days?: undefined;
                duration_minutes?: undefined;
                query?: undefined;
                nickname?: undefined;
                user_ids?: undefined;
                delete_message_seconds?: undefined;
            };
            required: string[];
        };
    })[];
    handle: typeof handle;
};
export default _default;
//# sourceMappingURL=members.d.ts.map