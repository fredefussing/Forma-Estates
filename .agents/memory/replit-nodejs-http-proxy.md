---
name: Replit dev Node.js HTTP intercepted
description: Node.js fetch() and https.get() are intercepted by Replit's dev network layer and return the local Vite HTML page. Use spawn("curl") as workaround.
---

## Rule
In Replit's dev environment, outbound HTTP/HTTPS requests made via Node.js (`fetch()`, `https.get()`, `http.get()`) are intercepted by Replit's network proxy and return the local Vite dev server's HTML page instead of the actual remote resource.

**Why:** Replit routes outbound Node.js TCP connections through an internal proxy that serves the app's own HTML for unknown domains.

**How to apply:** When a server-side route needs to fetch an external URL (image proxy, webhook test, etc.), use `spawn("curl", ["-sL", "--max-time", "30", "--fail", url])` and stream stdout into the response. curl uses OS-level networking and bypasses the interception.

```ts
import { spawn } from "child_process";

app.get("/api/proxy-image", (req, res) => {
  const url = req.query.url as string;
  const curl = spawn("curl", ["-sL", "--max-time", "30", "--fail", url]);
  const chunks: Buffer[] = [];
  curl.stdout.on("data", (c: Buffer) => chunks.push(c));
  curl.on("close", async (code) => {
    if (code !== 0) { res.status(502).send("fetch failed"); return; }
    res.setHeader("Content-Type", "image/jpeg");
    res.end(Buffer.concat(chunks));
  });
  curl.on("error", (e) => res.status(502).send(e.message));
});
```

Also: auto-restart doesn't always pick up server file changes reliably — use `restart_workflow("Start application")` explicitly after server edits when testing.
