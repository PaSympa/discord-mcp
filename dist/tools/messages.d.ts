import type { ToolResult } from "./types.js";
/** Tool definitions for reading, sending, replying, editing, reacting, threading, embedding, deleting, pinning, and searching messages. */
export declare const definitions: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            channel_id: {
                type: string;
            };
            limit: {
                type: string;
                description: string;
            };
            content?: undefined;
            message_id?: undefined;
            emoji?: undefined;
            name?: undefined;
            auto_archive_duration?: undefined;
            count?: undefined;
            title?: undefined;
            url?: undefined;
            description?: undefined;
            color?: undefined;
            fields?: undefined;
            author?: undefined;
            thumbnail_url?: undefined;
            footer?: undefined;
            image_url?: undefined;
            timestamp?: undefined;
            embeds?: undefined;
            reason?: undefined;
            pin?: undefined;
            keyword?: undefined;
            user_id?: undefined;
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
            content: {
                type: string;
                description?: undefined;
            };
            limit?: undefined;
            message_id?: undefined;
            emoji?: undefined;
            name?: undefined;
            auto_archive_duration?: undefined;
            count?: undefined;
            title?: undefined;
            url?: undefined;
            description?: undefined;
            color?: undefined;
            fields?: undefined;
            author?: undefined;
            thumbnail_url?: undefined;
            footer?: undefined;
            image_url?: undefined;
            timestamp?: undefined;
            embeds?: undefined;
            reason?: undefined;
            pin?: undefined;
            keyword?: undefined;
            user_id?: undefined;
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
            message_id: {
                type: string;
                description: string;
            };
            content: {
                type: string;
                description?: undefined;
            };
            limit?: undefined;
            emoji?: undefined;
            name?: undefined;
            auto_archive_duration?: undefined;
            count?: undefined;
            title?: undefined;
            url?: undefined;
            description?: undefined;
            color?: undefined;
            fields?: undefined;
            author?: undefined;
            thumbnail_url?: undefined;
            footer?: undefined;
            image_url?: undefined;
            timestamp?: undefined;
            embeds?: undefined;
            reason?: undefined;
            pin?: undefined;
            keyword?: undefined;
            user_id?: undefined;
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
            message_id: {
                type: string;
                description: string;
            };
            content: {
                type: string;
                description: string;
            };
            limit?: undefined;
            emoji?: undefined;
            name?: undefined;
            auto_archive_duration?: undefined;
            count?: undefined;
            title?: undefined;
            url?: undefined;
            description?: undefined;
            color?: undefined;
            fields?: undefined;
            author?: undefined;
            thumbnail_url?: undefined;
            footer?: undefined;
            image_url?: undefined;
            timestamp?: undefined;
            embeds?: undefined;
            reason?: undefined;
            pin?: undefined;
            keyword?: undefined;
            user_id?: undefined;
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
            message_id: {
                type: string;
                description?: undefined;
            };
            emoji: {
                type: string;
                description: string;
            };
            limit?: undefined;
            content?: undefined;
            name?: undefined;
            auto_archive_duration?: undefined;
            count?: undefined;
            title?: undefined;
            url?: undefined;
            description?: undefined;
            color?: undefined;
            fields?: undefined;
            author?: undefined;
            thumbnail_url?: undefined;
            footer?: undefined;
            image_url?: undefined;
            timestamp?: undefined;
            embeds?: undefined;
            reason?: undefined;
            pin?: undefined;
            keyword?: undefined;
            user_id?: undefined;
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
                description: string;
            };
            message_id: {
                type: string;
                description: string;
            };
            auto_archive_duration: {
                type: string;
                description: string;
            };
            limit?: undefined;
            content?: undefined;
            emoji?: undefined;
            count?: undefined;
            title?: undefined;
            url?: undefined;
            description?: undefined;
            color?: undefined;
            fields?: undefined;
            author?: undefined;
            thumbnail_url?: undefined;
            footer?: undefined;
            image_url?: undefined;
            timestamp?: undefined;
            embeds?: undefined;
            reason?: undefined;
            pin?: undefined;
            keyword?: undefined;
            user_id?: undefined;
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
            count: {
                type: string;
                description: string;
            };
            limit?: undefined;
            content?: undefined;
            message_id?: undefined;
            emoji?: undefined;
            name?: undefined;
            auto_archive_duration?: undefined;
            title?: undefined;
            url?: undefined;
            description?: undefined;
            color?: undefined;
            fields?: undefined;
            author?: undefined;
            thumbnail_url?: undefined;
            footer?: undefined;
            image_url?: undefined;
            timestamp?: undefined;
            embeds?: undefined;
            reason?: undefined;
            pin?: undefined;
            keyword?: undefined;
            user_id?: undefined;
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
            title: {
                type: string;
            };
            url: {
                type: string;
                description: string;
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
            author: {
                type: string;
                description: string;
                properties: {
                    name: {
                        type: string;
                    };
                    icon_url: {
                        type: string;
                    };
                    url: {
                        type: string;
                    };
                };
                required: string[];
            };
            thumbnail_url: {
                type: string;
                description: string;
            };
            footer: {
                type: string;
            };
            image_url: {
                type: string;
            };
            timestamp: {
                type: string;
                description: string;
            };
            limit?: undefined;
            content?: undefined;
            message_id?: undefined;
            emoji?: undefined;
            name?: undefined;
            auto_archive_duration?: undefined;
            count?: undefined;
            embeds?: undefined;
            reason?: undefined;
            pin?: undefined;
            keyword?: undefined;
            user_id?: undefined;
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
            message_id: {
                type: string;
                description: string;
            };
            title: {
                type: string;
            };
            url: {
                type: string;
                description: string;
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
            author: {
                type: string;
                properties: {
                    name: {
                        type: string;
                    };
                    icon_url: {
                        type: string;
                    };
                    url: {
                        type: string;
                    };
                };
                required: string[];
                description?: undefined;
            };
            thumbnail_url: {
                type: string;
                description?: undefined;
            };
            footer: {
                type: string;
            };
            image_url: {
                type: string;
            };
            timestamp: {
                type: string;
                description: string;
            };
            limit?: undefined;
            content?: undefined;
            emoji?: undefined;
            name?: undefined;
            auto_archive_duration?: undefined;
            count?: undefined;
            embeds?: undefined;
            reason?: undefined;
            pin?: undefined;
            keyword?: undefined;
            user_id?: undefined;
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
            content: {
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
                        author: {
                            type: string;
                            properties: {
                                name: {
                                    type: string;
                                };
                                icon_url: {
                                    type: string;
                                };
                                url: {
                                    type: string;
                                };
                            };
                            required: string[];
                        };
                        thumbnail_url: {
                            type: string;
                        };
                        footer: {
                            type: string;
                        };
                        image_url: {
                            type: string;
                        };
                        timestamp: {
                            type: string;
                        };
                    };
                };
            };
            limit?: undefined;
            message_id?: undefined;
            emoji?: undefined;
            name?: undefined;
            auto_archive_duration?: undefined;
            count?: undefined;
            title?: undefined;
            url?: undefined;
            description?: undefined;
            color?: undefined;
            fields?: undefined;
            author?: undefined;
            thumbnail_url?: undefined;
            footer?: undefined;
            image_url?: undefined;
            timestamp?: undefined;
            reason?: undefined;
            pin?: undefined;
            keyword?: undefined;
            user_id?: undefined;
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
            message_id: {
                type: string;
                description?: undefined;
            };
            reason: {
                type: string;
            };
            limit?: undefined;
            content?: undefined;
            emoji?: undefined;
            name?: undefined;
            auto_archive_duration?: undefined;
            count?: undefined;
            title?: undefined;
            url?: undefined;
            description?: undefined;
            color?: undefined;
            fields?: undefined;
            author?: undefined;
            thumbnail_url?: undefined;
            footer?: undefined;
            image_url?: undefined;
            timestamp?: undefined;
            embeds?: undefined;
            pin?: undefined;
            keyword?: undefined;
            user_id?: undefined;
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
            message_id: {
                type: string;
                description?: undefined;
            };
            pin: {
                type: string;
                description: string;
            };
            limit?: undefined;
            content?: undefined;
            emoji?: undefined;
            name?: undefined;
            auto_archive_duration?: undefined;
            count?: undefined;
            title?: undefined;
            url?: undefined;
            description?: undefined;
            color?: undefined;
            fields?: undefined;
            author?: undefined;
            thumbnail_url?: undefined;
            footer?: undefined;
            image_url?: undefined;
            timestamp?: undefined;
            embeds?: undefined;
            reason?: undefined;
            keyword?: undefined;
            user_id?: undefined;
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
            keyword: {
                type: string;
            };
            limit: {
                type: string;
                description: string;
            };
            content?: undefined;
            message_id?: undefined;
            emoji?: undefined;
            name?: undefined;
            auto_archive_duration?: undefined;
            count?: undefined;
            title?: undefined;
            url?: undefined;
            description?: undefined;
            color?: undefined;
            fields?: undefined;
            author?: undefined;
            thumbnail_url?: undefined;
            footer?: undefined;
            image_url?: undefined;
            timestamp?: undefined;
            embeds?: undefined;
            reason?: undefined;
            pin?: undefined;
            user_id?: undefined;
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
            message_id: {
                type: string;
                description?: undefined;
            };
            limit?: undefined;
            content?: undefined;
            emoji?: undefined;
            name?: undefined;
            auto_archive_duration?: undefined;
            count?: undefined;
            title?: undefined;
            url?: undefined;
            description?: undefined;
            color?: undefined;
            fields?: undefined;
            author?: undefined;
            thumbnail_url?: undefined;
            footer?: undefined;
            image_url?: undefined;
            timestamp?: undefined;
            embeds?: undefined;
            reason?: undefined;
            pin?: undefined;
            keyword?: undefined;
            user_id?: undefined;
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
            message_id: {
                type: string;
                description?: undefined;
            };
            emoji: {
                type: string;
                description: string;
            };
            user_id: {
                type: string;
                description: string;
            };
            limit?: undefined;
            content?: undefined;
            name?: undefined;
            auto_archive_duration?: undefined;
            count?: undefined;
            title?: undefined;
            url?: undefined;
            description?: undefined;
            color?: undefined;
            fields?: undefined;
            author?: undefined;
            thumbnail_url?: undefined;
            footer?: undefined;
            image_url?: undefined;
            timestamp?: undefined;
            embeds?: undefined;
            reason?: undefined;
            pin?: undefined;
            keyword?: undefined;
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
            message_id: {
                type: string;
                description?: undefined;
            };
            emoji: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            content?: undefined;
            name?: undefined;
            auto_archive_duration?: undefined;
            count?: undefined;
            title?: undefined;
            url?: undefined;
            description?: undefined;
            color?: undefined;
            fields?: undefined;
            author?: undefined;
            thumbnail_url?: undefined;
            footer?: undefined;
            image_url?: undefined;
            timestamp?: undefined;
            embeds?: undefined;
            reason?: undefined;
            pin?: undefined;
            keyword?: undefined;
            user_id?: undefined;
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
            limit?: undefined;
            content?: undefined;
            message_id?: undefined;
            emoji?: undefined;
            name?: undefined;
            auto_archive_duration?: undefined;
            count?: undefined;
            title?: undefined;
            url?: undefined;
            description?: undefined;
            color?: undefined;
            fields?: undefined;
            author?: undefined;
            thumbnail_url?: undefined;
            footer?: undefined;
            image_url?: undefined;
            timestamp?: undefined;
            embeds?: undefined;
            reason?: undefined;
            pin?: undefined;
            keyword?: undefined;
            user_id?: undefined;
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
            message_id: {
                type: string;
                description?: undefined;
            };
            target_channel_id: {
                type: string;
            };
            limit?: undefined;
            content?: undefined;
            emoji?: undefined;
            name?: undefined;
            auto_archive_duration?: undefined;
            count?: undefined;
            title?: undefined;
            url?: undefined;
            description?: undefined;
            color?: undefined;
            fields?: undefined;
            author?: undefined;
            thumbnail_url?: undefined;
            footer?: undefined;
            image_url?: undefined;
            timestamp?: undefined;
            embeds?: undefined;
            reason?: undefined;
            pin?: undefined;
            keyword?: undefined;
            user_id?: undefined;
        };
        required: string[];
    };
})[];
/**
 * Handles all message-related tools: read, send, reply, edit, react,
 * thread, bulk delete, embed, delete, pin/unpin, and keyword search.
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
                limit: {
                    type: string;
                    description: string;
                };
                content?: undefined;
                message_id?: undefined;
                emoji?: undefined;
                name?: undefined;
                auto_archive_duration?: undefined;
                count?: undefined;
                title?: undefined;
                url?: undefined;
                description?: undefined;
                color?: undefined;
                fields?: undefined;
                author?: undefined;
                thumbnail_url?: undefined;
                footer?: undefined;
                image_url?: undefined;
                timestamp?: undefined;
                embeds?: undefined;
                reason?: undefined;
                pin?: undefined;
                keyword?: undefined;
                user_id?: undefined;
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
                content: {
                    type: string;
                    description?: undefined;
                };
                limit?: undefined;
                message_id?: undefined;
                emoji?: undefined;
                name?: undefined;
                auto_archive_duration?: undefined;
                count?: undefined;
                title?: undefined;
                url?: undefined;
                description?: undefined;
                color?: undefined;
                fields?: undefined;
                author?: undefined;
                thumbnail_url?: undefined;
                footer?: undefined;
                image_url?: undefined;
                timestamp?: undefined;
                embeds?: undefined;
                reason?: undefined;
                pin?: undefined;
                keyword?: undefined;
                user_id?: undefined;
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
                message_id: {
                    type: string;
                    description: string;
                };
                content: {
                    type: string;
                    description?: undefined;
                };
                limit?: undefined;
                emoji?: undefined;
                name?: undefined;
                auto_archive_duration?: undefined;
                count?: undefined;
                title?: undefined;
                url?: undefined;
                description?: undefined;
                color?: undefined;
                fields?: undefined;
                author?: undefined;
                thumbnail_url?: undefined;
                footer?: undefined;
                image_url?: undefined;
                timestamp?: undefined;
                embeds?: undefined;
                reason?: undefined;
                pin?: undefined;
                keyword?: undefined;
                user_id?: undefined;
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
                message_id: {
                    type: string;
                    description: string;
                };
                content: {
                    type: string;
                    description: string;
                };
                limit?: undefined;
                emoji?: undefined;
                name?: undefined;
                auto_archive_duration?: undefined;
                count?: undefined;
                title?: undefined;
                url?: undefined;
                description?: undefined;
                color?: undefined;
                fields?: undefined;
                author?: undefined;
                thumbnail_url?: undefined;
                footer?: undefined;
                image_url?: undefined;
                timestamp?: undefined;
                embeds?: undefined;
                reason?: undefined;
                pin?: undefined;
                keyword?: undefined;
                user_id?: undefined;
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
                message_id: {
                    type: string;
                    description?: undefined;
                };
                emoji: {
                    type: string;
                    description: string;
                };
                limit?: undefined;
                content?: undefined;
                name?: undefined;
                auto_archive_duration?: undefined;
                count?: undefined;
                title?: undefined;
                url?: undefined;
                description?: undefined;
                color?: undefined;
                fields?: undefined;
                author?: undefined;
                thumbnail_url?: undefined;
                footer?: undefined;
                image_url?: undefined;
                timestamp?: undefined;
                embeds?: undefined;
                reason?: undefined;
                pin?: undefined;
                keyword?: undefined;
                user_id?: undefined;
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
                    description: string;
                };
                message_id: {
                    type: string;
                    description: string;
                };
                auto_archive_duration: {
                    type: string;
                    description: string;
                };
                limit?: undefined;
                content?: undefined;
                emoji?: undefined;
                count?: undefined;
                title?: undefined;
                url?: undefined;
                description?: undefined;
                color?: undefined;
                fields?: undefined;
                author?: undefined;
                thumbnail_url?: undefined;
                footer?: undefined;
                image_url?: undefined;
                timestamp?: undefined;
                embeds?: undefined;
                reason?: undefined;
                pin?: undefined;
                keyword?: undefined;
                user_id?: undefined;
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
                count: {
                    type: string;
                    description: string;
                };
                limit?: undefined;
                content?: undefined;
                message_id?: undefined;
                emoji?: undefined;
                name?: undefined;
                auto_archive_duration?: undefined;
                title?: undefined;
                url?: undefined;
                description?: undefined;
                color?: undefined;
                fields?: undefined;
                author?: undefined;
                thumbnail_url?: undefined;
                footer?: undefined;
                image_url?: undefined;
                timestamp?: undefined;
                embeds?: undefined;
                reason?: undefined;
                pin?: undefined;
                keyword?: undefined;
                user_id?: undefined;
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
                title: {
                    type: string;
                };
                url: {
                    type: string;
                    description: string;
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
                author: {
                    type: string;
                    description: string;
                    properties: {
                        name: {
                            type: string;
                        };
                        icon_url: {
                            type: string;
                        };
                        url: {
                            type: string;
                        };
                    };
                    required: string[];
                };
                thumbnail_url: {
                    type: string;
                    description: string;
                };
                footer: {
                    type: string;
                };
                image_url: {
                    type: string;
                };
                timestamp: {
                    type: string;
                    description: string;
                };
                limit?: undefined;
                content?: undefined;
                message_id?: undefined;
                emoji?: undefined;
                name?: undefined;
                auto_archive_duration?: undefined;
                count?: undefined;
                embeds?: undefined;
                reason?: undefined;
                pin?: undefined;
                keyword?: undefined;
                user_id?: undefined;
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
                message_id: {
                    type: string;
                    description: string;
                };
                title: {
                    type: string;
                };
                url: {
                    type: string;
                    description: string;
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
                author: {
                    type: string;
                    properties: {
                        name: {
                            type: string;
                        };
                        icon_url: {
                            type: string;
                        };
                        url: {
                            type: string;
                        };
                    };
                    required: string[];
                    description?: undefined;
                };
                thumbnail_url: {
                    type: string;
                    description?: undefined;
                };
                footer: {
                    type: string;
                };
                image_url: {
                    type: string;
                };
                timestamp: {
                    type: string;
                    description: string;
                };
                limit?: undefined;
                content?: undefined;
                emoji?: undefined;
                name?: undefined;
                auto_archive_duration?: undefined;
                count?: undefined;
                embeds?: undefined;
                reason?: undefined;
                pin?: undefined;
                keyword?: undefined;
                user_id?: undefined;
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
                content: {
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
                            author: {
                                type: string;
                                properties: {
                                    name: {
                                        type: string;
                                    };
                                    icon_url: {
                                        type: string;
                                    };
                                    url: {
                                        type: string;
                                    };
                                };
                                required: string[];
                            };
                            thumbnail_url: {
                                type: string;
                            };
                            footer: {
                                type: string;
                            };
                            image_url: {
                                type: string;
                            };
                            timestamp: {
                                type: string;
                            };
                        };
                    };
                };
                limit?: undefined;
                message_id?: undefined;
                emoji?: undefined;
                name?: undefined;
                auto_archive_duration?: undefined;
                count?: undefined;
                title?: undefined;
                url?: undefined;
                description?: undefined;
                color?: undefined;
                fields?: undefined;
                author?: undefined;
                thumbnail_url?: undefined;
                footer?: undefined;
                image_url?: undefined;
                timestamp?: undefined;
                reason?: undefined;
                pin?: undefined;
                keyword?: undefined;
                user_id?: undefined;
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
                message_id: {
                    type: string;
                    description?: undefined;
                };
                reason: {
                    type: string;
                };
                limit?: undefined;
                content?: undefined;
                emoji?: undefined;
                name?: undefined;
                auto_archive_duration?: undefined;
                count?: undefined;
                title?: undefined;
                url?: undefined;
                description?: undefined;
                color?: undefined;
                fields?: undefined;
                author?: undefined;
                thumbnail_url?: undefined;
                footer?: undefined;
                image_url?: undefined;
                timestamp?: undefined;
                embeds?: undefined;
                pin?: undefined;
                keyword?: undefined;
                user_id?: undefined;
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
                message_id: {
                    type: string;
                    description?: undefined;
                };
                pin: {
                    type: string;
                    description: string;
                };
                limit?: undefined;
                content?: undefined;
                emoji?: undefined;
                name?: undefined;
                auto_archive_duration?: undefined;
                count?: undefined;
                title?: undefined;
                url?: undefined;
                description?: undefined;
                color?: undefined;
                fields?: undefined;
                author?: undefined;
                thumbnail_url?: undefined;
                footer?: undefined;
                image_url?: undefined;
                timestamp?: undefined;
                embeds?: undefined;
                reason?: undefined;
                keyword?: undefined;
                user_id?: undefined;
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
                keyword: {
                    type: string;
                };
                limit: {
                    type: string;
                    description: string;
                };
                content?: undefined;
                message_id?: undefined;
                emoji?: undefined;
                name?: undefined;
                auto_archive_duration?: undefined;
                count?: undefined;
                title?: undefined;
                url?: undefined;
                description?: undefined;
                color?: undefined;
                fields?: undefined;
                author?: undefined;
                thumbnail_url?: undefined;
                footer?: undefined;
                image_url?: undefined;
                timestamp?: undefined;
                embeds?: undefined;
                reason?: undefined;
                pin?: undefined;
                user_id?: undefined;
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
                message_id: {
                    type: string;
                    description?: undefined;
                };
                limit?: undefined;
                content?: undefined;
                emoji?: undefined;
                name?: undefined;
                auto_archive_duration?: undefined;
                count?: undefined;
                title?: undefined;
                url?: undefined;
                description?: undefined;
                color?: undefined;
                fields?: undefined;
                author?: undefined;
                thumbnail_url?: undefined;
                footer?: undefined;
                image_url?: undefined;
                timestamp?: undefined;
                embeds?: undefined;
                reason?: undefined;
                pin?: undefined;
                keyword?: undefined;
                user_id?: undefined;
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
                message_id: {
                    type: string;
                    description?: undefined;
                };
                emoji: {
                    type: string;
                    description: string;
                };
                user_id: {
                    type: string;
                    description: string;
                };
                limit?: undefined;
                content?: undefined;
                name?: undefined;
                auto_archive_duration?: undefined;
                count?: undefined;
                title?: undefined;
                url?: undefined;
                description?: undefined;
                color?: undefined;
                fields?: undefined;
                author?: undefined;
                thumbnail_url?: undefined;
                footer?: undefined;
                image_url?: undefined;
                timestamp?: undefined;
                embeds?: undefined;
                reason?: undefined;
                pin?: undefined;
                keyword?: undefined;
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
                message_id: {
                    type: string;
                    description?: undefined;
                };
                emoji: {
                    type: string;
                    description: string;
                };
                limit: {
                    type: string;
                    description: string;
                };
                content?: undefined;
                name?: undefined;
                auto_archive_duration?: undefined;
                count?: undefined;
                title?: undefined;
                url?: undefined;
                description?: undefined;
                color?: undefined;
                fields?: undefined;
                author?: undefined;
                thumbnail_url?: undefined;
                footer?: undefined;
                image_url?: undefined;
                timestamp?: undefined;
                embeds?: undefined;
                reason?: undefined;
                pin?: undefined;
                keyword?: undefined;
                user_id?: undefined;
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
                limit?: undefined;
                content?: undefined;
                message_id?: undefined;
                emoji?: undefined;
                name?: undefined;
                auto_archive_duration?: undefined;
                count?: undefined;
                title?: undefined;
                url?: undefined;
                description?: undefined;
                color?: undefined;
                fields?: undefined;
                author?: undefined;
                thumbnail_url?: undefined;
                footer?: undefined;
                image_url?: undefined;
                timestamp?: undefined;
                embeds?: undefined;
                reason?: undefined;
                pin?: undefined;
                keyword?: undefined;
                user_id?: undefined;
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
                message_id: {
                    type: string;
                    description?: undefined;
                };
                target_channel_id: {
                    type: string;
                };
                limit?: undefined;
                content?: undefined;
                emoji?: undefined;
                name?: undefined;
                auto_archive_duration?: undefined;
                count?: undefined;
                title?: undefined;
                url?: undefined;
                description?: undefined;
                color?: undefined;
                fields?: undefined;
                author?: undefined;
                thumbnail_url?: undefined;
                footer?: undefined;
                image_url?: undefined;
                timestamp?: undefined;
                embeds?: undefined;
                reason?: undefined;
                pin?: undefined;
                keyword?: undefined;
                user_id?: undefined;
            };
            required: string[];
        };
    })[];
    handle: typeof handle;
};
export default _default;
//# sourceMappingURL=messages.d.ts.map