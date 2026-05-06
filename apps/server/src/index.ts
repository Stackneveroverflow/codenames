import { createAppServer } from "./socketServer";

const port = Number(process.env.PORT ?? 3001);
const { httpServer } = createAppServer();

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`server listening on http://localhost:${port}`);
});
