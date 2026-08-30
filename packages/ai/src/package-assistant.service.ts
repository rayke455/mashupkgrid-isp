import Anthropic from "@anthropic-ai/sdk";
import {
  listHotspotPackages,
  createHotspotPackage,
  updateHotspotPackage,
  deleteHotspotPackage,
  getHotspotPackageOrThrow,
} from "@mashupkgrid/radius";
import { ValidationError, NotFoundError, ConflictError } from "@mashupkgrid/shared";

/** Model id current as of this build — an assistant feature should track whatever Anthropic's
 *  latest generally-available model is; update this if it's renamed/retired. */
const MODEL = "claude-sonnet-5";
const MAX_TOOL_ROUNDS = 6;

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantResult {
  reply: string;
  actionsTaken: string[];
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_packages",
    description:
      "List every hotspot WiFi package for this ISP, including inactive/deactivated ones. Call this first if you need to find a package by name before updating or deleting it.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_package",
    description: "Create a new purchasable hotspot WiFi package (e.g. \"2 Hours\", \"Daily Unlimited\").",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short display name, e.g. \"2 Hour Pass\"" },
        description: { type: "string" },
        priceMinor: {
          type: "integer",
          description: "Price in the smallest currency unit (e.g. KES cents — 5000 = KES 50.00).",
        },
        currency: { type: "string", description: "3-letter currency code, defaults to KES." },
        durationMinutes: { type: "integer", description: "How long access lasts once activated." },
        dataCapMb: { type: "integer", description: "Optional data cap in megabytes." },
        downloadKbps: { type: "integer", description: "Optional download speed limit in kbps." },
        uploadKbps: { type: "integer", description: "Optional upload speed limit in kbps." },
      },
      required: ["name", "priceMinor", "durationMinutes"],
    },
  },
  {
    name: "update_package",
    description: "Update one or more fields of an existing hotspot package, found by its id (use list_packages first to find it).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        priceMinor: { type: "integer" },
        currency: { type: "string" },
        durationMinutes: { type: "integer" },
        dataCapMb: { type: "integer" },
        downloadKbps: { type: "integer" },
        uploadKbps: { type: "integer" },
        isActive: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_package",
    description: "Deactivate a hotspot package by id (soft delete — existing vouchers sold under it keep working).",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
];

async function executeTool(
  tenantId: string,
  name: string,
  input: Record<string, unknown>,
  actionsTaken: string[]
): Promise<unknown> {
  try {
    switch (name) {
      case "list_packages":
        return await listHotspotPackages(tenantId);
      case "create_package": {
        const pkg = await createHotspotPackage(tenantId, input as never);
        actionsTaken.push(`Created package "${pkg.name}"`);
        return pkg;
      }
      case "update_package": {
        const { id, ...patch } = input as { id: string } & Record<string, unknown>;
        const before = await getHotspotPackageOrThrow(tenantId, id);
        const pkg = await updateHotspotPackage(tenantId, id, patch as never);
        actionsTaken.push(`Updated package "${before.name}"`);
        return pkg;
      }
      case "delete_package": {
        const { id } = input as { id: string };
        const before = await getHotspotPackageOrThrow(tenantId, id);
        await deleteHotspotPackage(tenantId, id);
        actionsTaken.push(`Deactivated package "${before.name}"`);
        return { success: true };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    if (err instanceof ValidationError || err instanceof NotFoundError) {
      return { error: err.message };
    }
    throw err;
  }
}

/** Runs one turn of the hotspot-package assistant: Claude decides, via tool use, which real
 *  create/update/delete/list operations to perform against this tenant's actual packages, then
 *  summarizes what it did. Every tool call goes through the same service functions the
 *  dashboard's own package UI uses — nothing here is a simulated or preview action. Capped at
 *  MAX_TOOL_ROUNDS tool-use round trips so a confused request can't loop forever. */
export async function runPackageAssistant(
  tenantId: string,
  apiKey: string,
  message: string,
  history: AssistantMessage[] = []
): Promise<AssistantResult> {
  const client = new Anthropic({ apiKey });
  const actionsTaken: string[] = [];

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: message },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system:
          "You manage hotspot WiFi packages for an ISP admin, via the tools provided. " +
          "priceMinor is always the smallest currency unit (e.g. cents) — confirm the real-world " +
          "price back to the admin in major units (e.g. \"KES 50\") so it's unambiguous. " +
          "Ask a clarifying question instead of guessing if the request is genuinely ambiguous " +
          "(e.g. which existing package to change, when several could match). Keep replies brief.",
        tools: TOOLS,
        messages,
      });
    } catch (err) {
      // Anthropic.APIError carries a real HTTP status + message from the API itself (bad key,
      // no credit, rate limited, ...) — surfacing it as a clean ConflictError instead of letting
      // it fall through to an opaque 500 is the same fix this build has made repeatedly for
      // every other external-API integration (M-Pesa, Paystack, SMS).
      if (err instanceof Anthropic.APIError) {
        throw new ConflictError(`Anthropic API error (${err.status ?? "unknown"}): ${err.message}`);
      }
      throw err;
    }

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return { reply: text, actionsTaken };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const result = await executeTool(tenantId, block.name, block.input as Record<string, unknown>, actionsTaken);
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return {
    reply: "That took more steps than expected — try breaking your request into smaller ones.",
    actionsTaken,
  };
}
