import { expect, it } from "vitest";
import { GameClient, type WorkerPort } from "./client";

class TestPort implements WorkerPort {
  messages: unknown[] = [];
  listeners = new Map<string, ((event: { data?: unknown }) => void)[]>();
  postMessage(message: unknown) { this.messages.push(message); }
  addEventListener(type: string, listener: (event: { data?: unknown }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  terminate() {}
  reply(data: unknown) { this.listeners.get("message")?.forEach((listener) => listener({ data })); }
  fail() { this.listeners.get("error")?.forEach((listener) => listener({})); }
}

it("matches out-of-order responses to their originating requests", async () => {
  const port = new TestPort(); const client = new GameClient(port);
  const first = client.serialize("2026-09-10T00:00:00Z");
  const second = client.serialize("2026-09-11T00:00:00Z");
  const [a, b] = port.messages as { id: number }[];
  port.reply({ id: b.id, ok: true, value: "second save" });
  port.reply({ id: a.id, ok: true, value: "first save" });
  expect(await first).toBe("first save"); expect(await second).toBe("second save");
  client.dispose();
});

it("settles pending requests when the worker fails and rejects later commands", async () => {
  const port = new TestPort(); const client = new GameClient(port);
  const pending = client.serialize("2026-09-10T00:00:00Z");
  const rejected = expect(pending).rejects.toThrow("simulation stopped");
  port.fail(); await rejected;
  await expect(client.advance()).rejects.toThrow("closed");
});

it("disposal rejects in-flight work without waiting for a response", async () => {
  const port = new TestPort(); const client = new GameClient(port);
  const pending = client.choices();
  const rejected = expect(pending).rejects.toThrow("closed");
  client.dispose(); await rejected;
});
