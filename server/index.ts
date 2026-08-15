import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PORT, ROOT_DIR } from "./config";
import { registerRoutes } from "./routes";
import { seedDemoIfEmpty } from "./seed";

const app = Fastify({
  logger: true,
  bodyLimit: 512 * 1024 * 1024,
  requestTimeout: 0,
  connectionTimeout: 0,
});

await app.register(cors, { origin: true });
await app.register(multipart, {
  limits: {
    fileSize: 512 * 1024 * 1024,
    files: 1,
  },
});
await registerRoutes(app);

const webDir = join(ROOT_DIR, "dist");
if (existsSync(webDir)) {
  await app.register(fastifyStatic, {
    root: webDir,
    wildcard: false,
  });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send({ error: "Non trovato." });
    }
    return reply.sendFile("index.html");
  });
}

try {
  await seedDemoIfEmpty();
} catch (error) {
  app.log.warn({ err: error }, "Seed demo non riuscito");
}

await app.listen({ port: PORT, host: "0.0.0.0" });
app.log.info(`Siderio 3D in ascolto su http://0.0.0.0:${PORT}`);
