import type { ToolResult } from "./types.js";
/** Tool definitions for managing forum channels, posts, tags, and threads. */
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
            topic?: undefined;
            category_id?: undefined;
            forum_channel_id?: undefined;
            title?: undefined;
            content?: undefined;
            applied_tags?: undefined;
            thread_id?: undefined;
            limit?: undefined;
            tags?: undefined;
            archived?: undefined;
            locked?: undefined;
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
            topic: {
                type: string;
                description: string;
            };
            category_id: {
                type: string;
                description: string;
            };
            forum_channel_id?: undefined;
            title?: undefined;
            content?: undefined;
            applied_tags?: undefined;
            thread_id?: undefined;
            limit?: undefined;
            tags?: undefined;
            archived?: undefined;
            locked?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            forum_channel_id: {
                type: string;
            };
            title: {
                type: string;
                description: string;
            };
            content: {
                type: string;
                description: string;
            };
            applied_tags: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            guild_id?: undefined;
            name?: undefined;
            topic?: undefined;
            category_id?: undefined;
            thread_id?: undefined;
            limit?: undefined;
            tags?: undefined;
            archived?: undefined;
            locked?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            thread_id: {
                type: string;
            };
            limit: {
                type: string;
                description: string;
            };
            guild_id?: undefined;
            name?: undefined;
            topic?: undefined;
            category_id?: undefined;
            forum_channel_id?: undefined;
            title?: undefined;
            content?: undefined;
            applied_tags?: undefined;
            tags?: undefined;
            archived?: undefined;
            locked?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            forum_channel_id: {
                type: string;
            };
            guild_id?: undefined;
            name?: undefined;
            topic?: undefined;
            category_id?: undefined;
            title?: undefined;
            content?: undefined;
            applied_tags?: undefined;
            thread_id?: undefined;
            limit?: undefined;
            tags?: undefined;
            archived?: undefined;
            locked?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            thread_id: {
                type: string;
            };
            content: {
                type: string;
                description?: undefined;
            };
            guild_id?: undefined;
            name?: undefined;
            topic?: undefined;
            category_id?: undefined;
            forum_channel_id?: undefined;
            title?: undefined;
            applied_tags?: undefined;
            limit?: undefined;
            tags?: undefined;
            archived?: undefined;
            locked?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            thread_id: {
                type: string;
            };
            guild_id?: undefined;
            name?: undefined;
            topic?: undefined;
            category_id?: undefined;
            forum_channel_id?: undefined;
            title?: undefined;
            content?: undefined;
            applied_tags?: undefined;
            limit?: undefined;
            tags?: undefined;
            archived?: undefined;
            locked?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            forum_channel_id: {
                type: string;
            };
            tags: {
                type: string;
                description: string;
                items: {
                    type: string;
                    properties: {
                        name: {
                            type: string;
                        };
                        emoji_name: {
                            type: string;
                            description: string;
                        };
                        moderated: {
                            type: string;
                            description: string;
                        };
                    };
                    required: string[];
                };
            };
            guild_id?: undefined;
            name?: undefined;
            topic?: undefined;
            category_id?: undefined;
            title?: undefined;
            content?: undefined;
            applied_tags?: undefined;
            thread_id?: undefined;
            limit?: undefined;
            archived?: undefined;
            locked?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            thread_id: {
                type: string;
            };
            title: {
                type: string;
                description: string;
            };
            archived: {
                type: string;
                description: string;
            };
            locked: {
                type: string;
                description: string;
            };
            applied_tags: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            guild_id?: undefined;
            name?: undefined;
            topic?: undefined;
            category_id?: undefined;
            forum_channel_id?: undefined;
            content?: undefined;
            limit?: undefined;
            tags?: undefined;
        };
        required: string[];
    };
})[];
/**
 * Handles all forum-related tools: list forums, create forum channels,
 * create/get/list/reply/delete/update forum posts, and manage forum tags.
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
                topic?: undefined;
                category_id?: undefined;
                forum_channel_id?: undefined;
                title?: undefined;
                content?: undefined;
                applied_tags?: undefined;
                thread_id?: undefined;
                limit?: undefined;
                tags?: undefined;
                archived?: undefined;
                locked?: undefined;
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
                topic: {
                    type: string;
                    description: string;
                };
                category_id: {
                    type: string;
                    description: string;
                };
                forum_channel_id?: undefined;
                title?: undefined;
                content?: undefined;
                applied_tags?: undefined;
                thread_id?: undefined;
                limit?: undefined;
                tags?: undefined;
                archived?: undefined;
                locked?: undefined;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                forum_channel_id: {
                    type: string;
                };
                title: {
                    type: string;
                    description: string;
                };
                content: {
                    type: string;
                    description: string;
                };
                applied_tags: {
                    type: string;
                    items: {
                        type: string;
                    };
                    description: string;
                };
                guild_id?: undefined;
                name?: undefined;
                topic?: undefined;
                category_id?: undefined;
                thread_id?: undefined;
                limit?: undefined;
                tags?: undefined;
                archived?: undefined;
                locked?: undefined;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                thread_id: {
                    type: string;
                };
                limit: {
                    type: string;
                    description: string;
                };
                guild_id?: undefined;
                name?: undefined;
                topic?: undefined;
                category_id?: undefined;
                forum_channel_id?: undefined;
                title?: undefined;
                content?: undefined;
                applied_tags?: undefined;
                tags?: undefined;
                archived?: undefined;
                locked?: undefined;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                forum_channel_id: {
                    type: string;
                };
                guild_id?: undefined;
                name?: undefined;
                topic?: undefined;
                category_id?: undefined;
                title?: undefined;
                content?: undefined;
                applied_tags?: undefined;
                thread_id?: undefined;
                limit?: undefined;
                tags?: undefined;
                archived?: undefined;
                locked?: undefined;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                thread_id: {
                    type: string;
                };
                content: {
                    type: string;
                    description?: undefined;
                };
                guild_id?: undefined;
                name?: undefined;
                topic?: undefined;
                category_id?: undefined;
                forum_channel_id?: undefined;
                title?: undefined;
                applied_tags?: undefined;
                limit?: undefined;
                tags?: undefined;
                archived?: undefined;
                locked?: undefined;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                thread_id: {
                    type: string;
                };
                guild_id?: undefined;
                name?: undefined;
                topic?: undefined;
                category_id?: undefined;
                forum_channel_id?: undefined;
                title?: undefined;
                content?: undefined;
                applied_tags?: undefined;
                limit?: undefined;
                tags?: undefined;
                archived?: undefined;
                locked?: undefined;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                forum_channel_id: {
                    type: string;
                };
                tags: {
                    type: string;
                    description: string;
                    items: {
                        type: string;
                        properties: {
                            name: {
                                type: string;
                            };
                            emoji_name: {
                                type: string;
                                description: string;
                            };
                            moderated: {
                                type: string;
                                description: string;
                            };
                        };
                        required: string[];
                    };
                };
                guild_id?: undefined;
                name?: undefined;
                topic?: undefined;
                category_id?: undefined;
                title?: undefined;
                content?: undefined;
                applied_tags?: undefined;
                thread_id?: undefined;
                limit?: undefined;
                archived?: undefined;
                locked?: undefined;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                thread_id: {
                    type: string;
                };
                title: {
                    type: string;
                    description: string;
                };
                archived: {
                    type: string;
                    description: string;
                };
                locked: {
                    type: string;
                    description: string;
                };
                applied_tags: {
                    type: string;
                    items: {
                        type: string;
                    };
                    description: string;
                };
                guild_id?: undefined;
                name?: undefined;
                topic?: undefined;
                category_id?: undefined;
                forum_channel_id?: undefined;
                content?: undefined;
                limit?: undefined;
                tags?: undefined;
            };
            required: string[];
        };
    })[];
    handle: typeof handle;
};
export default _default;
//# sourceMappingURL=forums.d.ts.map