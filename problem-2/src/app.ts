import express from "express";
import swaggerUi from "swagger-ui-express";
import { errorHandler } from "./middleware/errorHandler";
import productsRouter from "./routes/products";
import { swaggerSpec } from "./swagger";

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
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
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`API docs available at http://localhost:${PORT}/api-docs`);
  });
}
