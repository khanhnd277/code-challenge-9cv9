import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { config } from "./config";
import { logger } from "./logger";
import { errorHandler } from "./middleware/errorHandler";
import productsRouter from "./routes/products";
import { swaggerSpec } from "./swagger";

const app = express();

// Security headers
app.use(helmet());

// HTTP request logging — only method, url, status, response time
app.use(
  pinoHttp({
    logger,
    serializers: {
      req: (req) => ({ method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
    customSuccessMessage: (req, res) =>
      `${req.method} ${req.url} ${res.statusCode}`,
    customErrorMessage: (req, res) =>
      `${req.method} ${req.url} ${res.statusCode}`,
  })
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", env: config.env });
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/api-docs.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

app.use("/api/products", productsRouter);

app.use(errorHandler);

export default app;

if (require.main === module) {
  app.listen(config.port, () => {
    logger.info(`Server running on http://localhost:${config.port}`);
    logger.info(`API docs available at http://localhost:${config.port}/api-docs`);
  });
}
