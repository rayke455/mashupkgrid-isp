import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server, type Socket } from "node:net";
import { RouterOSClient, RouterOSApiError } from "../routeros-client.js";

// Regression test for a real production crash: a router that resets the connection mid-session
// used to emit an unhandled "error" event with no listener attached, which is a fatal, uncaught
// exception in Node — it took down the entire API process on a single flaky router. This spins
// up a real TCP server so the test exercises actual socket event timing, not a mock.
describe("RouterOSClient", () => {
  let server: Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  });

  it("rejects talk() cleanly (without crashing the process) when the connection resets mid-session", async () => {
    const serverSocketReady = new Promise<Socket>((resolveSocket) => {
      server = createServer((socket) => {
        // A local error on the server side of this loopback pair is not what's under test —
        // silence it so only the client-side crash-or-not is being asserted.
        socket.on("error", () => {});
        resolveSocket(socket);
        // Never reply — the client's talk() call will be left waiting until the reset below.
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const port = (server!.address() as { port: number }).port;

    const client = new RouterOSClient({ host: "127.0.0.1", port, useTls: false, timeoutMs: 5000 });
    await client.connect();

    const talkPromise = client.talk(["/system/resource/print"]);

    // Send a real TCP RST out from under it — this is what a router power-cycling or a flaky
    // link looks like on the wire, and is what actually produces a client-side "error" event (a
    // plain destroy() often just looks like a clean close to the peer).
    const serverSocket = await serverSocketReady;
    serverSocket.resetAndDestroy();

    await expect(talkPromise).rejects.toThrow(RouterOSApiError);
  });

  it("rejects connect() cleanly against a port nothing is listening on", async () => {
    // Port 1 is a well-known reserved port with nothing listening — connection is refused
    // immediately, exercising the pre-connect onError path.
    const client = new RouterOSClient({ host: "127.0.0.1", port: 1, useTls: false, timeoutMs: 2000 });
    await expect(client.connect()).rejects.toThrow(RouterOSApiError);
  });
});
