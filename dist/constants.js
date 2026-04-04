"use strict";
/** Shared constants used across tool modules. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTO_ARCHIVE_DURATIONS = exports.DEFAULTS = exports.MAX_FETCH_LIMIT = void 0;
/** Maximum number of items the Discord API returns per fetch. */
exports.MAX_FETCH_LIMIT = 100;
/** Default fetch limits by context. */
exports.DEFAULTS = {
    MESSAGES: 20,
    MEMBERS: 50,
    MEMBERS_MAX: 1000,
    LIMIT: 25,
};
/** Valid auto-archive durations in minutes. */
exports.AUTO_ARCHIVE_DURATIONS = [60, 1440, 4320, 10080];
//# sourceMappingURL=constants.js.map