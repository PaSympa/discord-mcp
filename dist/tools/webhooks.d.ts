import type { ToolResult } from "./types.js";
/** Tool definitions for creating, sending via, editing, deleting, and listing webhooks. */
export declare const definitions: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            channel_id: {
                type: string;
                description?: undefined;
            };
            name: {
                type: string;
                description: string;
            };
            avatar: {
                type: string;
                description: string;
            };
            webhook_id?: undefined;
            webhook_token?: undefined;
            content?: undefined;
            username?: undefined;
            avatar_url?: undefined;
            embeds?: undefined;
            guild_id?: undefined;
            message_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            webhook_id: {
                type: string;
            };
            webhook_token: {
                type: string;
            };
            content: {
                type: string;
                description: string;
            };
            username: {
                type: string;
                description: string;
            };
            avatar_url: {
                type: string;
                description: string;
            };
            embeds: {
                type: string;
                description: string;
                items: {
                    type: string;
                    properties: {
                        title: {
                            type: string;
                        };
                        url: {
                            type: string;
                        };
                        description: {
                            type: string;
                        };
                        color: {
                            type: string;
                            description: string;
                        };
                        fields: {
                            type: string;
                            items: {
                                type: string;
                                properties: {
                                    name: {
                                        type: string;
                                    };
                                    value: {
                                        type: string;
                                    };
                                    inline: {
                                        type: string;
                                    };
                                };
                                required: string[];
                            };
                        };
                        footer: {
                            type: string;
                        };
                        image_url: {
                            type: string;
                        };
                        thumbnail_url: {
                            type: string;
                        };
                        timestamp: {
                            type: string;
                        };
                    };
                };
            };
            channel_id?: undefined;
            name?: undefined;
            avatar?: undefined;
            guild_id?: undefined;
            message_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            webhook_id: {
                type: string;
            };
            name: {
                type: string;
                description: string;
            };
            avatar: {
                type: string;
                description: string;
            };
            channel_id: {
                type: string;
                description: string;
            };
            webhook_token?: undefined;
            content?: undefined;
            username?: undefined;
            avatar_url?: undefined;
            embeds?: undefined;
            guild_id?: undefined;
            message_id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            webhook_id: {
                type: string;
            };
            channel_id?: undefined;
            name?: undefined;
            avatar?: undefined;
            webhook_token?: undefined;
            content?: undefined;
            username?: undefined;
            avatar_url?: undefined;
            embeds?: undefined;
            guild_id?: undefined;
            message_id?: undefined;
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
                description: string;
            };
            guild_id: {
                type: string;
                description: string;
            };
            name?: undefined;
            avatar?: undefined;
            webhook_id?: undefined;
            webhook_token?: undefined;
            content?: undefined;
            username?: undefined;
            avatar_url?: undefined;
            embeds?: undefined;
            message_id?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            webhook_id: {
                type: string;
            };
            webhook_token: {
                type: string;
            };
            message_id: {
                type: string;
            };
            content: {
                type: string;
                description?: undefined;
            };
            embeds: {
                type: string;
                description: string;
                items: {
                    type: string;
                    properties: {
                        title: {
                            type: string;
                        };
                        url: {
                            type: string;
                        };
                        description: {
                            type: string;
                        };
                        color: {
                            type: string;
                            description: string;
                        };
                        fields: {
                            type: string;
                            items: {
                                type: string;
                                properties: {
                                    name: {
                                        type: string;
                                    };
                                    value: {
                                        type: string;
                                    };
                                    inline: {
                                        type: string;
                                    };
                                };
                                required: string[];
                            };
                        };
                        footer: {
                            type: string;
                        };
                        image_url: {
                            type: string;
                        };
                        thumbnail_url: {
                            type: string;
                        };
                        timestamp: {
                            type: string;
                        };
                    };
                };
            };
            channel_id?: undefined;
            name?: undefined;
            avatar?: undefined;
            username?: undefined;
            avatar_url?: undefined;
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
            webhook_id: {
                type: string;
            };
            webhook_token: {
                type: string;
            };
            message_id: {
                type: string;
            };
            channel_id?: undefined;
            name?: undefined;
            avatar?: undefined;
            content?: undefined;
            username?: undefined;
            avatar_url?: undefined;
            embeds?: undefined;
            guild_id?: undefined;
        };
        required: string[];
    };
})[];
/**
 * Handles webhook tools: create, send message via webhook,
 * edit, delete, and list webhooks.
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
                    description?: undefined;
                };
                name: {
                    type: string;
                    description: string;
                };
                avatar: {
                    type: string;
                    description: string;
                };
                webhook_id?: undefined;
                webhook_token?: undefined;
                content?: undefined;
                username?: undefined;
                avatar_url?: undefined;
                embeds?: undefined;
                guild_id?: undefined;
                message_id?: undefined;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                webhook_id: {
                    type: string;
                };
                webhook_token: {
                    type: string;
                };
                content: {
                    type: string;
                    description: string;
                };
                username: {
                    type: string;
                    description: string;
                };
                avatar_url: {
                    type: string;
                    description: string;
                };
                embeds: {
                    type: string;
                    description: string;
                    items: {
                        type: string;
                        properties: {
                            title: {
                                type: string;
                            };
                            url: {
                                type: string;
                            };
                            description: {
                                type: string;
                            };
                            color: {
                                type: string;
                                description: string;
                            };
                            fields: {
                                type: string;
                                items: {
                                    type: string;
                                    properties: {
                                        name: {
                                            type: string;
                                        };
                                        value: {
                                            type: string;
                                        };
                                        inline: {
                                            type: string;
                                        };
                                    };
                                    required: string[];
                                };
                            };
                            footer: {
                                type: string;
                            };
                            image_url: {
                                type: string;
                            };
                            thumbnail_url: {
                                type: string;
                            };
                            timestamp: {
                                type: string;
                            };
                        };
                    };
                };
                channel_id?: undefined;
                name?: undefined;
                avatar?: undefined;
                guild_id?: undefined;
                message_id?: undefined;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                webhook_id: {
                    type: string;
                };
                name: {
                    type: string;
                    description: string;
                };
                avatar: {
                    type: string;
                    description: string;
                };
                channel_id: {
                    type: string;
                    description: string;
                };
                webhook_token?: undefined;
                content?: undefined;
                username?: undefined;
                avatar_url?: undefined;
                embeds?: undefined;
                guild_id?: undefined;
                message_id?: undefined;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                webhook_id: {
                    type: string;
                };
                channel_id?: undefined;
                name?: undefined;
                avatar?: undefined;
                webhook_token?: undefined;
                content?: undefined;
                username?: undefined;
                avatar_url?: undefined;
                embeds?: undefined;
                guild_id?: undefined;
                message_id?: undefined;
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
                    description: string;
                };
                guild_id: {
                    type: string;
                    description: string;
                };
                name?: undefined;
                avatar?: undefined;
                webhook_id?: undefined;
                webhook_token?: undefined;
                content?: undefined;
                username?: undefined;
                avatar_url?: undefined;
                embeds?: undefined;
                message_id?: undefined;
            };
            required?: undefined;
        };
    } | {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                webhook_id: {
                    type: string;
                };
                webhook_token: {
                    type: string;
                };
                message_id: {
                    type: string;
                };
                content: {
                    type: string;
                    description?: undefined;
                };
                embeds: {
                    type: string;
                    description: string;
                    items: {
                        type: string;
                        properties: {
                            title: {
                                type: string;
                            };
                            url: {
                                type: string;
                            };
                            description: {
                                type: string;
                            };
                            color: {
                                type: string;
                                description: string;
                            };
                            fields: {
                                type: string;
                                items: {
                                    type: string;
                                    properties: {
                                        name: {
                                            type: string;
                                        };
                                        value: {
                                            type: string;
                                        };
                                        inline: {
                                            type: string;
                                        };
                                    };
                                    required: string[];
                                };
                            };
                            footer: {
                                type: string;
                            };
                            image_url: {
                                type: string;
                            };
                            thumbnail_url: {
                                type: string;
                            };
                            timestamp: {
                                type: string;
                            };
                        };
                    };
                };
                channel_id?: undefined;
                name?: undefined;
                avatar?: undefined;
                username?: undefined;
                avatar_url?: undefined;
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
                webhook_id: {
                    type: string;
                };
                webhook_token: {
                    type: string;
                };
                message_id: {
                    type: string;
                };
                channel_id?: undefined;
                name?: undefined;
                avatar?: undefined;
                content?: undefined;
                username?: undefined;
                avatar_url?: undefined;
                embeds?: undefined;
                guild_id?: undefined;
            };
            required: string[];
        };
    })[];
    handle: typeof handle;
};
export default _default;
//# sourceMappingURL=webhooks.d.ts.map