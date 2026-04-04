import type { ToolResult } from "./types.js";
/** Tool definitions for managing guild scheduled events. */
export declare const definitions: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            guild_id: {
                type: string;
            };
            event_id?: undefined;
            name?: undefined;
            description?: undefined;
            entity_type?: undefined;
            scheduled_start_time?: undefined;
            scheduled_end_time?: undefined;
            channel_id?: undefined;
            location?: undefined;
            image?: undefined;
            status?: undefined;
            limit?: undefined;
            max_age?: undefined;
            max_uses?: undefined;
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
            event_id: {
                type: string;
            };
            name?: undefined;
            description?: undefined;
            entity_type?: undefined;
            scheduled_start_time?: undefined;
            scheduled_end_time?: undefined;
            channel_id?: undefined;
            location?: undefined;
            image?: undefined;
            status?: undefined;
            limit?: undefined;
            max_age?: undefined;
            max_uses?: undefined;
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
            description: {
                type: string;
            };
            entity_type: {
                type: string;
                description: string;
            };
            scheduled_start_time: {
                type: string;
                description: string;
            };
            scheduled_end_time: {
                type: string;
                description: string;
            };
            channel_id: {
                type: string;
                description: string;
            };
            location: {
                type: string;
                description: string;
            };
            image: {
                type: string;
                description: string;
            };
            event_id?: undefined;
            status?: undefined;
            limit?: undefined;
            max_age?: undefined;
            max_uses?: undefined;
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
            event_id: {
                type: string;
            };
            name: {
                type: string;
            };
            description: {
                type: string;
            };
            scheduled_start_time: {
                type: string;
                description: string;
            };
            scheduled_end_time: {
                type: string;
                description: string;
            };
            channel_id: {
                type: string;
                description?: undefined;
            };
            location: {
                type: string;
                description?: undefined;
            };
            image: {
                type: string;
                description: string;
            };
            status: {
                type: string;
                description: string;
            };
            entity_type?: undefined;
            limit?: undefined;
            max_age?: undefined;
            max_uses?: undefined;
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
            event_id: {
                type: string;
            };
            limit: {
                type: string;
                description: string;
            };
            name?: undefined;
            description?: undefined;
            entity_type?: undefined;
            scheduled_start_time?: undefined;
            scheduled_end_time?: undefined;
            channel_id?: undefined;
            location?: undefined;
            image?: undefined;
            status?: undefined;
            max_age?: undefined;
            max_uses?: undefined;
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
            event_id: {
                type: string;
            };
            channel_id: {
                type: string;
                description: string;
            };
            max_age: {
                type: string;
                description: string;
            };
            max_uses: {
                type: string;
                description: string;
            };
            name?: undefined;
            description?: undefined;
            entity_type?: undefined;
            scheduled_start_time?: undefined;
            scheduled_end_time?: undefined;
            location?: undefined;
            image?: undefined;
            status?: undefined;
            limit?: undefined;
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
                event_id?: undefined;
                name?: undefined;
                description?: undefined;
                entity_type?: undefined;
                scheduled_start_time?: undefined;
                scheduled_end_time?: undefined;
                channel_id?: undefined;
                location?: undefined;
                image?: undefined;
                status?: undefined;
                limit?: undefined;
                max_age?: undefined;
                max_uses?: undefined;
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
                event_id: {
                    type: string;
                };
                name?: undefined;
                description?: undefined;
                entity_type?: undefined;
                scheduled_start_time?: undefined;
                scheduled_end_time?: undefined;
                channel_id?: undefined;
                location?: undefined;
                image?: undefined;
                status?: undefined;
                limit?: undefined;
                max_age?: undefined;
                max_uses?: undefined;
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
                description: {
                    type: string;
                };
                entity_type: {
                    type: string;
                    description: string;
                };
                scheduled_start_time: {
                    type: string;
                    description: string;
                };
                scheduled_end_time: {
                    type: string;
                    description: string;
                };
                channel_id: {
                    type: string;
                    description: string;
                };
                location: {
                    type: string;
                    description: string;
                };
                image: {
                    type: string;
                    description: string;
                };
                event_id?: undefined;
                status?: undefined;
                limit?: undefined;
                max_age?: undefined;
                max_uses?: undefined;
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
                event_id: {
                    type: string;
                };
                name: {
                    type: string;
                };
                description: {
                    type: string;
                };
                scheduled_start_time: {
                    type: string;
                    description: string;
                };
                scheduled_end_time: {
                    type: string;
                    description: string;
                };
                channel_id: {
                    type: string;
                    description?: undefined;
                };
                location: {
                    type: string;
                    description?: undefined;
                };
                image: {
                    type: string;
                    description: string;
                };
                status: {
                    type: string;
                    description: string;
                };
                entity_type?: undefined;
                limit?: undefined;
                max_age?: undefined;
                max_uses?: undefined;
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
                event_id: {
                    type: string;
                };
                limit: {
                    type: string;
                    description: string;
                };
                name?: undefined;
                description?: undefined;
                entity_type?: undefined;
                scheduled_start_time?: undefined;
                scheduled_end_time?: undefined;
                channel_id?: undefined;
                location?: undefined;
                image?: undefined;
                status?: undefined;
                max_age?: undefined;
                max_uses?: undefined;
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
                event_id: {
                    type: string;
                };
                channel_id: {
                    type: string;
                    description: string;
                };
                max_age: {
                    type: string;
                    description: string;
                };
                max_uses: {
                    type: string;
                    description: string;
                };
                name?: undefined;
                description?: undefined;
                entity_type?: undefined;
                scheduled_start_time?: undefined;
                scheduled_end_time?: undefined;
                location?: undefined;
                image?: undefined;
                status?: undefined;
                limit?: undefined;
            };
            required: string[];
        };
    })[];
    handle: typeof handle;
};
export default _default;
//# sourceMappingURL=scheduledEvents.d.ts.map