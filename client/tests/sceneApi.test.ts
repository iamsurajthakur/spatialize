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
