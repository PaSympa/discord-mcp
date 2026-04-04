import "dotenv/config";
import { Client, TextChannel, GuildChannel, PermissionsBitField } from "discord.js";
export declare const discord: Client<boolean>;
/**
 * Lazily connects to Discord on first tool call.
 * Allows the MCP server to start and respond to ListTools without a connection.
 */
export declare function ensureConnected(): Promise<void>;
/**
 * Fetches a channel by ID and guarantees it is a text channel.
 * @param channelId - Discord snowflake ID of the channel.
 * @returns The resolved TextChannel instance.
 * @throws {Error} If the channel does not exist or is not a text channel.
 */
export declare function getTextChannel(channelId: string): Promise<TextChannel>;
/**
 * Fetches a channel by ID and guarantees it is a guild channel (text, voice, or category).
 * @param channelId - Discord snowflake ID of the channel.
 * @returns The resolved GuildChannel instance.
 * @throws {Error} If the channel does not exist or is not a guild channel.
 */
export declare function getGuildChannel(channelId: string): Promise<GuildChannel>;
/**
 * Validates that a value is a proper Discord snowflake ID (17-20 digit number).
 * @param value - The raw value to validate.
 * @param label - A human-readable label used in the error message (e.g. "guild_id").
 * @returns The validated ID as a string.
 * @throws {Error} If the value is not a valid snowflake.
 */
export declare function validateId(value: unknown, label: string): string;
/**
 * Converts a PermissionsBitField into a human-readable array of permission names.
 * @param perms - The bitfield to serialize.
 * @returns Array of permission flag names (e.g. ["SendMessages", "ViewChannel"]).
 */
export declare function serializePermissions(perms: Readonly<PermissionsBitField>): string[];
//# sourceMappingURL=client.d.ts.map