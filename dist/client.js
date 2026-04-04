"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discord = void 0;
exports.ensureConnected = ensureConnected;
exports.getTextChannel = getTextChannel;
exports.getGuildChannel = getGuildChannel;
exports.validateId = validateId;
exports.serializePermissions = serializePermissions;
require("dotenv/config");
const discord_js_1 = require("discord.js");
// ─── Discord Client ────────────────────────────────────────────────────────────
// Initializes the Discord.js client with the required gateway intents
// and exposes shared helper functions used across all tool modules.
// ────────────────────────────────────────────────────────────────────────────────
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
exports.discord = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent,
        discord_js_1.GatewayIntentBits.GuildMembers,
        discord_js_1.GatewayIntentBits.GuildModeration,
        discord_js_1.GatewayIntentBits.GuildScheduledEvents,
        discord_js_1.GatewayIntentBits.GuildInvites,
    ],
});
let discordReady = false;
let loginPromise = null;
// ─── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Lazily connects to Discord on first tool call.
 * Allows the MCP server to start and respond to ListTools without a connection.
 */
async function ensureConnected() {
    if (discordReady)
        return;
    if (!DISCORD_TOKEN) {
        throw new Error("DISCORD_TOKEN is required. Set it in your MCP client config or a .env file.");
    }
    if (!loginPromise) {
        loginPromise = new Promise((resolve, reject) => {
            exports.discord.once("ready", () => {
                discordReady = true;
                console.error(`✅  Discord bot connected as ${exports.discord.user?.tag}`);
                resolve();
            });
            exports.discord.login(DISCORD_TOKEN).catch((err) => {
                loginPromise = null;
                reject(new Error(`Discord login failed: ${err.message}`));
            });
        });
    }
    await loginPromise;
}
/**
 * Fetches a channel by ID and guarantees it is a text channel.
 * @param channelId - Discord snowflake ID of the channel.
 * @returns The resolved TextChannel instance.
 * @throws {Error} If the channel does not exist or is not a text channel.
 */
async function getTextChannel(channelId) {
    const channel = await exports.discord.channels.fetch(channelId);
    if (!channel || !(channel instanceof discord_js_1.TextChannel))
        throw new Error(`Channel ${channelId} is not a text channel or doesn't exist.`);
    return channel;
}
/**
 * Fetches a channel by ID and guarantees it is a guild channel (text, voice, or category).
 * @param channelId - Discord snowflake ID of the channel.
 * @returns The resolved GuildChannel instance.
 * @throws {Error} If the channel does not exist or is not a guild channel.
 */
async function getGuildChannel(channelId) {
    const channel = await exports.discord.channels.fetch(channelId);
    if (!channel || !(channel instanceof discord_js_1.GuildChannel))
        throw new Error(`Channel ${channelId} is not a guild channel or doesn't exist.`);
    return channel;
}
/**
 * Validates that a value is a proper Discord snowflake ID (17-20 digit number).
 * @param value - The raw value to validate.
 * @param label - A human-readable label used in the error message (e.g. "guild_id").
 * @returns The validated ID as a string.
 * @throws {Error} If the value is not a valid snowflake.
 */
function validateId(value, label) {
    const id = String(value ?? "");
    if (!/^\d{17,20}$/.test(id))
        throw new Error(`Invalid ${label}: "${id}". Must be a Discord snowflake ID (17-20 digits).`);
    return id;
}
/**
 * Converts a PermissionsBitField into a human-readable array of permission names.
 * @param perms - The bitfield to serialize.
 * @returns Array of permission flag names (e.g. ["SendMessages", "ViewChannel"]).
 */
function serializePermissions(perms) {
    return Object.keys(discord_js_1.PermissionsBitField.Flags).filter((flag) => perms.has(flag));
}
//# sourceMappingURL=client.js.map