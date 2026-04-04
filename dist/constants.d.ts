/** Shared constants used across tool modules. */
/** Maximum number of items the Discord API returns per fetch. */
export declare const MAX_FETCH_LIMIT = 100;
/** Default fetch limits by context. */
export declare const DEFAULTS: {
    readonly MESSAGES: 20;
    readonly MEMBERS: 50;
    readonly MEMBERS_MAX: 1000;
    readonly LIMIT: 25;
};
/** Valid auto-archive durations in minutes. */
export declare const AUTO_ARCHIVE_DURATIONS: readonly [60, 1440, 4320, 10080];
//# sourceMappingURL=constants.d.ts.map