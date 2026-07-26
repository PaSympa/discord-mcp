// src/client.ts captures DISCORD_TOKEN at import time. Login-path tests import this
// first so they reach that code in CI, where no token exists; they all stub login.
process.env.DISCORD_TOKEN ??= "test-token-login-is-stubbed";
