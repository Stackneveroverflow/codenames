import { createAppServer } from "./socketServer";

const port = Number(process.env.PORT ?? 3001);
const { httpServer } = createAppServer();

httpServer.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});

