import { Client } from "discord.js";

// Stands in for an open Discord connection.
setInterval(() => console.error("tick"), 200);

Client.prototype.login = async () => {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  throw new Error("simulated login failure");
};
