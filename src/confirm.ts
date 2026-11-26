import {
  inputRequired,
  inputResponse,
  type CallToolResult,
  type ElicitRequestFormParams,
  type InputRequiredResult,
  type InputResponseView,
  type RequestId,
  type Result,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { parseSwitch } from "./tools/index.js";
import type { ToolContext } from "./tools/types.js";

/**
 * How long the human has to answer. The SDK waits 600 s by default, but an MCP SDK
 * client gives up on the whole call after 60 s: below that, the call ends with this
 * server's own result rather than a client timeout.
 */
export const CONFIRM_TIMEOUT_MS = 45_000;

/** A literal JSON Schema: one built from zod would carry a `$schema` key into the request. */
const CONFIRM_SCHEMA: ElicitRequestFormParams["requestedSchema"] = {
  type: "object",
  properties: { confirm: { type: "boolean", title: "Confirm" } },
  required: ["confirm"],
};

/** Parses `DISCORD_MCP_CONFIRM`, on when unset. */
export function confirmMode(): boolean {
  return parseSwitch("DISCORD_MCP_CONFIRM", process.env.DISCORD_MCP_CONFIRM, true);
}

/** Thrown by a tool's `confirm`: the call returns `result` instead of going on. */
export class ConfirmationStop extends Error {
  constructor(readonly result: CallToolResult | InputRequiredResult) {
    super("The call stopped for a confirmation.");
  }
}

function unchanged(text: string): CallToolResult {
  return { content: [{ type: "text", text: `${text} Nothing was changed.` }], isError: true };
}

/** Why an answer does not confirm, or undefined when it does. The SDK does not check the content. */
function refusal(answer: InputResponseView): string | undefined {
  if (answer.kind !== "elicit") return "no answer";
  if (answer.action === "decline") return "declined";
  if (answer.action === "cancel") return "cancelled";
  if (answer.content?.confirm !== true) return "confirm was not true";
  return undefined;
}

function firstText(result: Result): string {
  const [block] = Array.isArray(result.content) ? result.content : [];
  return typeof block?.text === "string" ? block.text : "no reason given";
}

/**
 * The confirmations of one server's tools/call requests. A request whose handler asked
 * stays in `asking` until the SDK runs the handler again with the answer. When the SDK
 * gives up first, because no answer came in time or the client answered with an error,
 * it returns a result of its own that does not say that nothing changed.
 */
export class Confirmations {
  private readonly asking = new Set<RequestId>();

  /**
   * The `confirm` of one run of the handler of request `req`, built when the run starts.
   * Only an answer to a question this server asked counts: a client can put
   * `inputResponses` in its own tools/call. At level B a retry is a new request, so this
   * check must then move to the request state.
   */
  gate(req: ServerContext["mcpReq"]): NonNullable<ToolContext["confirm"]> {
    const asked = this.asking.delete(req.id);
    return async (message) => {
      if (!asked) {
        const confirm = inputRequired.elicit({
          message: await message(),
          requestedSchema: CONFIRM_SCHEMA,
        });
        this.asking.add(req.id);
        throw new ConfirmationStop(inputRequired({ inputRequests: { confirm } }));
      }
      const why = refusal(inputResponse(req.inputResponses, "confirm"));
      if (why !== undefined)
        throw new ConfirmationStop(unchanged(`The user did not confirm (${why}).`));
      if (req.signal.aborted)
        throw new ConfirmationStop(unchanged("The call was cancelled before the change."));
    };
  }

  /** Runs one whole tools/call, the SDK's rounds for its input requests included. */
  async settle(id: RequestId, call: () => Promise<Result>): Promise<Result> {
    try {
      const result = await call();
      if (!this.asking.has(id)) return result;
      return unchanged(`No confirmation came back (${firstText(result)}).`);
    } finally {
      this.asking.delete(id);
    }
  }
}
