import { buildApp, getPort } from "./app.js";
import { env } from "@mashupkgrid/config";

async function main() {
  const app = await buildApp();
  try {
    await app.listen({ port: getPort(), host: env.API_HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully`);
      await app.close();
      process.exit(0);
    });
  }
}

main();
