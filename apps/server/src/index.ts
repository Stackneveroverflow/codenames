import { fileURLToPath } from "node:url";

import { createHostInfo } from "./network.js";
import { createAppServer } from "./socketServer.js";

export { createHostInfo, createAppServer };
export type { AppServerOptions, HostInfo } from "./socketServer.js";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3001);
  const hostInfo = createHostInfo(port);
  const { httpServer } = createAppServer({ getHostInfo: () => hostInfo });

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`server listening on ${hostInfo.localUrl}`);
    for (const url of hostInfo.lanUrls) {
      console.log(`lan access ${url}`);
    }
  });
}
