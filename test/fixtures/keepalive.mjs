// Stands in for discord.js's gateway socket: a referenced handle that keeps the
// event loop alive, which is what turns a missed stdin EOF into a lingering
// orphan process. A timer needs no network permissions, unlike a listening socket.
import { setInterval } from "node:timers";

setInterval(() => {}, 60_000);
