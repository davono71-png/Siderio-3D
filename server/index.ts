import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { existsSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
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
    serve: false,
  });
  const webRoot = resolve(webDir);
  app.get("/*", (request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send({ error: "Non trovato." });
    }
    const urlPath = decodeURIComponent(request.url.split("?")[0]).replace(/^\/+/, "");
    if (urlPath) {
      const abs = resolve(webDir, urlPath);
      const rel = relative(webRoot, abs);
      if (rel && !rel.startsWith("..") && !rel.startsWith("/") && existsSync(abs) && statSync(abs).isFile()) {
        return reply.sendFile(rel.split("\\").join("/"));
      }
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
