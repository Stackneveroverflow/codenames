import os from "node:os";

import type { HostInfo } from "./socketServer.js";

export function getLanUrls(port: number): string[] {
  const urls = new Set<string>();
  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal) {
        continue;
      }
      urls.add(`http://${address.address}:${port}`);
    }
  }

  return [...urls].sort();
}

export function createHostInfo(port: number): HostInfo {
  return {
    port,
    localUrl: `http://localhost:${port}`,
    lanUrls: getLanUrls(port),
  };
}
