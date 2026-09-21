import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "public");
app.use(express.static(publicDir, { index: "index.html" }));
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api") && req.accepts("html")) {
    res.sendFile(path.join(publicDir, "index.html"), (error) => {
      if (error && !res.headersSent) next(error);
    });
    return;
  }
  next();
});

export default app;
