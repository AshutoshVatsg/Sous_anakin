import test from "node:test";
import assert from "node:assert/strict";
import { streamPost } from "../app/lib/stream.js";

function fixture(t, text, chunkSize = 1) {
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream({
    start(controller) {
      for (let index = 0; index < bytes.length; index += chunkSize)
        controller.enqueue(bytes.slice(index, index + chunkSize));
      controller.close();
    },
  });
  return t.mock.method(globalThis, "fetch", async () => new Response(body));
}

test("client SSE preserves JSON payload and split UTF-8/CRLF frames", async (t) => {
  const fetchMock = fixture(
    t,
    'data: {"message":"₹200 · paneer"}\r\n\r\ndata: {"type":"done"}\r\n\r\n',
  );
  const events = [];
  await streamPost("/api/find", { craving: "paneer" }, (event) =>
    events.push(event),
  );
  assert.deepEqual(events, [{ message: "₹200 · paneer" }, { type: "done" }]);
  assert.equal(fetchMock.mock.calls[0].arguments[0], "/api/find");
  assert.deepEqual(JSON.parse(fetchMock.mock.calls[0].arguments[1].body), {
    craving: "paneer",
  });
});

test("client SSE handles multiline data, comments and an unterminated final frame", async (t) => {
  fixture(
    t,
    ': keepalive\n\ndata: {\ndata: "type":"plan"\ndata: }\n\ndata: {"type":"done"}',
    7,
  );
  const events = [];
  await streamPost("/api/cook", {}, (event) => events.push(event));
  assert.deepEqual(events, [{ type: "plan" }, { type: "done" }]);
});

test("client SSE ignores malformed data without losing later events", async (t) => {
  fixture(t, 'data: not-json\n\ndata: {"type":"check"}\n\n');
  const events = [];
  await streamPost("/api/basket", {}, (event) => events.push(event));
  assert.deepEqual(events, [{ type: "check" }]);
});

test("client SSE does not swallow an event handler failure", async (t) => {
  fixture(t, 'data: {"type":"check"}\n\n');
  await assert.rejects(
    streamPost("/api/basket", {}, () => {
      throw new Error("handler failure");
    }),
    /handler failure/,
  );
});

test("client SSE exposes HTTP failures", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("Unavailable", { status: 503 }),
  );
  await assert.rejects(
    streamPost("/api/find", {}, () => {}),
    /503/,
  );
});

test("client SSE exposes a missing response stream", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null));
  await assert.rejects(
    streamPost("/api/find", {}, () => {}),
    /connection ended/,
  );
});
