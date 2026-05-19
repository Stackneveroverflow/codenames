import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createHostInfo } from "./network.js";
import { attachStaticClient, createAppServer } from "./socketServer.js";

export { attachStaticClient, createHostInfo, createAppServer };
export type { AppServerOptions, HostInfo, StaticClientOptions } from "./socketServer.js";

function resolveStaticClient() {
  const serverDist = path.dirname(fileURLToPath(import.meta.url));
  const webDist = path.resolve(serverDist, "../../web/dist");
  const entryDist = path.resolve(serverDist, "../../entry/dist");

  if (!fs.existsSync(path.join(webDist, "index.html")) || !fs.existsSync(path.join(entryDist, "index.html"))) {
    return null;
  }

  return { webDist, entryDist };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3001);
  const hostInfo = createHostInfo(port);
  const { app, httpServer } = createAppServer({ getHostInfo: () => hostInfo });
  const staticClient = resolveStaticClient();
  if (staticClient) {
    attachStaticClient(app, staticClient);
  }

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`server listening on ${hostInfo.localUrl}`);
    for (const url of hostInfo.lanUrls) {
      console.log(`lan access ${url}`);
    }
  });
}
