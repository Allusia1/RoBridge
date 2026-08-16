#!/usr/bin/env node
// Test harness: pretends to be the Studio plugin. Polls for jobs and echoes them back.
const BASE = `http://127.0.0.1:${process.env.ROBRIDGE_PORT ?? 3737}`;
const sessionId = "fake-" + Math.random().toString(36).slice(2);

console.log("Fake Studio polling", BASE);
for (;;) {
  try {
    const res = await fetch(BASE + "/api/plugin/poll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        placeName: "FakePlace",
        placeId: 12345,
        gameId: 999,
        mode: "edit",
        pluginVersion: "0.1.0-fake",
      }),
    });
    const { job } = await res.json();
    if (job) {
      console.log("Got job:", job.tool, job.id);
      await fetch(BASE + "/api/plugin/result", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          jobId: job.id,
          ok: true,
          result: { echoedTool: job.tool, echoedArgs: job.args, codeLength: job.code.length },
        }),
      });
    }
  } catch (err) {
    console.log("poll error:", err.message);
    await new Promise((r) => setTimeout(r, 1000));
  }
}
