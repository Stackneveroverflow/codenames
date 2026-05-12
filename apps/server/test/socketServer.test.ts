import { afterEach, describe, expect, it } from "vitest";

import { createAppServer } from "../src/socketServer";

describe("socketServer", () => {
  const servers: ReturnType<typeof createAppServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.io.close();
            server.httpServer.close(() => resolve());
          }),
      ),
    );
    servers.length = 0;
  });

  it("serves generated card images from the in-memory image store", async () => {
    const server = createAppServer();
    servers.push(server);
    const imageUrl = server.imageStore.urlFor("ROOM1", "DEAL1", "card-1");
    server.imageStore.put(imageUrl, { contentType: "image/png", data: Buffer.from("png-data") });

    const baseUrl = await listen(server);
    const response = await fetch(`${baseUrl}${imageUrl}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("png-data");
  });
});

function listen(server: ReturnType<typeof createAppServer>): Promise<string> {
  return new Promise((resolve) => {
    server.httpServer.listen(0, "127.0.0.1", () => {
      const address = server.httpServer.address();
      if (address && typeof address === "object") {
        resolve(`http://127.0.0.1:${address.port}`);
      }
    });
  });
}
