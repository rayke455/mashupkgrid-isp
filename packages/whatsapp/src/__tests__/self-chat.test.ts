import { describe, expect, it } from "vitest";
import type { WASocket } from "@whiskeysockets/baileys";
import { isSelfChat } from "../client.js";

const sock = {
  user: { id: "254700000001:12@s.whatsapp.net", lid: "111222333444:12@lid" },
  authState: { creds: { me: { id: "254700000001:12@s.whatsapp.net", lid: "111222333444:12@lid" } } },
} as unknown as WASocket;

describe("isSelfChat", () => {
  it("recognises the account's own number and own LID", () => {
    expect(isSelfChat(sock, "254700000001@s.whatsapp.net")).toBe(true);
    expect(isSelfChat(sock, "111222333444@lid")).toBe(true);
  });

  it("does not treat another contact's LID chat as the self chat", () => {
    // The bug: every @lid chat counted as "Message yourself", so the bot answered the owner's
    // own messages inside customers' and business contacts' chats.
    expect(isSelfChat(sock, "987654321000@lid")).toBe(false);
    expect(isSelfChat(sock, "254711111111@s.whatsapp.net")).toBe(false);
  });
});
