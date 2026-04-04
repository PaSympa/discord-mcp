import type { ToolResult } from "./types.js";
/** Tool definitions for creating, deleting, editing, moving, and cloning channels. */
export declare const definitions: ({
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
            type: {
                type: string;
                enum: string[];
                description: string;
            };
            topic: {
                type: string;
            };
            category_id: {
                type: string;
            };
            channel_id?: undefined;
            reason?: undefined;
            slowmode?: undefined;
            nsfw?: undefined;
            new_name?: undefined;
            position?: undefined;
            source_channel_id?: undefined;
            target_channel_id?: undefined;
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
            guild_id?: undefined;
            name?: undefined;
            type?: undefined;
            topic?: undefined;
            category_id?: undefined;
            slowmode?: undefined;
            nsfw?: undefined;
            new_name?: undefined;
            position?: undefined;
            source_channel_id?: undefined;
            target_channel_id?: undefined;
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
            name: {
                type: string;
            };
            topic: {
                type: string;
            };
            slowmode: {
                type: string;
                description: string;
            };
            nsfw: {
                type: string;
                description: string;
            };
            guild_id?: undefined;
            type?: undefined;
            category_id?: undefined;
            reason?: undefined;
            new_name?: undefined;
            position?: undefined;
            source_channel_id?: undefined;
            target_channel_id?: undefined;
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
            category_id: {
                type: string;
            };
            guild_id?: undefined;
            name?: undefined;
            type?: undefined;
            topic?: undefined;
            reason?: undefined;
            slowmode?: undefined;
            nsfw?: undefined;
            new_name?: undefined;
            position?: undefined;
            source_channel_id?: undefined;
            target_channel_id?: undefined;
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
            new_name: {
                type: string;
            };
            guild_id?: undefined;
            name?: undefined;
            type?: undefined;
            topic?: undefined;
            category_id?: undefined;
            reason?: undefined;
            slowmode?: undefined;
            nsfw?: undefined;
            position?: undefined;
            source_channel_id?: undefined;
            target_channel_id?: undefined;
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
            position: {
                type: string;
            };
            guild_id?: undefined;
            name?: undefined;
            type?: undefined;
            topic?: undefined;
            category_id?: undefined;
            reason?: undefined;
            slowmode?: undefined;
            nsfw?: undefined;
            new_name?: undefined;
            source_channel_id?: undefined;
            target_channel_id?: undefined;
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
                description: string;
            };
            target_channel_id: {
                type: string;
                description: string;
            };
            guild_id?: undefined;
            name?: undefined;
            type?: undefined;
            topic?: undefined;
            category_id?: undefined;
            channel_id?: undefined;
            reason?: undefined;
            slowmode?: undefined;
            nsfw?: undefined;
            new_name?: undefined;
            position?: undefined;
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
            name?: undefined;
            type?: undefined;
            topic?: undefined;
            category_id?: undefined;
            reason?: undefined;
            slowmode?: undefined;
            nsfw?: undefined;
            new_name?: undefined;
            position?: undefined;
            source_channel_id?: undefined;
            target_channel_id?: undefined;
        };
        required: string[];
    };
})[];
/**
 * Handles channel management tools: create (text/voice/category),
 * delete, edit (name/topic/slowmode), move between categories, and clone.
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
                name: {
                    type: string;
                };
                type: {
                    type: string;
                    enum: string[];
                    description: string;
                };
                topic: {
                    type: string;
                };
                category_id: {
                    type: string;
                };
                channel_id?: undefined;
                reason?: undefined;
                slowmode?: undefined;
                nsfw?: undefined;
                new_name?: undefined;
                position?: undefined;
                source_channel_id?: undefined;
                target_channel_id?: undefined;
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
                guild_id?: undefined;
                name?: undefined;
                type?: undefined;
                topic?: undefined;
                category_id?: undefined;
                slowmode?: undefined;
                nsfw?: undefined;
                new_name?: undefined;
                position?: undefined;
                source_channel_id?: undefined;
                target_channel_id?: undefined;
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
                name: {
                    type: string;
                };
                topic: {
                    type: string;
                };
                slowmode: {
                    type: string;
                    description: string;
                };
                nsfw: {
                    type: string;
                    description: string;
                };
                guild_id?: undefined;
                type?: undefined;
                category_id?: undefined;
                reason?: undefined;
                new_name?: undefined;
                position?: undefined;
                source_channel_id?: undefined;
                target_channel_id?: undefined;
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
                category_id: {
                    type: string;
                };
                guild_id?: undefined;
                name?: undefined;
                type?: undefined;
                topic?: undefined;
                reason?: undefined;
                slowmode?: undefined;
                nsfw?: undefined;
                new_name?: undefined;
                position?: undefined;
                source_channel_id?: undefined;
                target_channel_id?: undefined;
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
                new_name: {
                    type: string;
                };
                guild_id?: undefined;
                name?: undefined;
                type?: undefined;
                topic?: undefined;
                category_id?: undefined;
                reason?: undefined;
                slowmode?: undefined;
                nsfw?: undefined;
                position?: undefined;
                source_channel_id?: undefined;
                target_channel_id?: undefined;
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
                position: {
                    type: string;
                };
                guild_id?: undefined;
                name?: undefined;
                type?: undefined;
                topic?: undefined;
                category_id?: undefined;
                reason?: undefined;
                slowmode?: undefined;
                nsfw?: undefined;
                new_name?: undefined;
                source_channel_id?: undefined;
                target_channel_id?: undefined;
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
                    description: string;
                };
                target_channel_id: {
                    type: string;
                    description: string;
                };
                guild_id?: undefined;
                name?: undefined;
                type?: undefined;
                topic?: undefined;
                category_id?: undefined;
                channel_id?: undefined;
                reason?: undefined;
                slowmode?: undefined;
                nsfw?: undefined;
                new_name?: undefined;
                position?: undefined;
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
                name?: undefined;
                type?: undefined;
                topic?: undefined;
                category_id?: undefined;
                reason?: undefined;
                slowmode?: undefined;
                nsfw?: undefined;
                new_name?: undefined;
                position?: undefined;
                source_channel_id?: undefined;
                target_channel_id?: undefined;
            };
            required: string[];
        };
    })[];
    handle: typeof handle;
};
export default _default;
//# sourceMappingURL=channels.d.ts.map