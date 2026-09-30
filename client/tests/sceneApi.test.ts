import { it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

it("uploads, retrieves, and saves using the configured backend origin", () => {
  // A fresh process models Next's module initialization without polluting other tests.
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
    const requests = [];
    globalThis.fetch = async (url, options) => {
      requests.push({ url, method: options?.method ?? "GET" });
      return new Response(JSON.stringify({ id: 7 }), { status: 200 });
    };
    const api = await import("./lib/sceneApi.ts");
    await api.uploadScene(new File(["image"], "room.png"));
    await api.fetchScene(7);
    await api.saveOverrides(7, {});
    console.log(JSON.stringify(requests));
  `,
    ],
    {
      cwd: new URL("../", import.meta.url),
      env: { ...process.env, NEXT_PUBLIC_API_BASE_URL: "https://api.example.com/" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    { url: "https://api.example.com/api/scenes/", method: "POST" },
    { url: "https://api.example.com/api/scenes/7/", method: "GET" },
    { url: "https://api.example.com/api/scenes/7/", method: "PATCH" },
  ]);
});

it("shows safe AI failure details and handles non-JSON server errors", () => {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
      const { uploadScene } = await import("./lib/sceneApi.ts");
      const cases = [
        [503, JSON.stringify({ code: "ai_unavailable", detail: "AI analysis is temporarily unavailable. Please try again shortly." })],
        [502, JSON.stringify({ code: "ai_request_failed", detail: "Check server configuration." })],
        [500, "<html>Proxy failure</html>"],
        [500, JSON.stringify({ detail: "private internal error" })],
        [500, JSON.stringify({ code: "ai_unavailable", detail: { invalid: true } })],
      ];
      const messages = [];
      for (const [status, body] of cases) {
        globalThis.fetch = async () => new Response(body, { status });
        try { await uploadScene(new File(["image"], "room.png")); }
        catch (error) { messages.push(error.message); }
      }
      console.log(JSON.stringify(messages));
    `,
    ],
    { cwd: new URL("../", import.meta.url), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    "AI analysis is temporarily unavailable. Please try again shortly.",
    "Check server configuration.",
    "Could not generate the scene. Please try again.",
    "Could not generate the scene. Please try again.",
    "Could not generate the scene. Please try again.",
  ]);
});
