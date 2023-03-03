import express from "express";
import expressStaticGzip from "express-static-gzip";
import http from "http";

const host = "localhost";
const port = 8000;

export function startServer(): void {
  const app = express();
  const server = http.createServer(app);
  const contentRouter = express.Router();
  contentRouter.use(expressStaticGzip("genfiles_static", { index: false }));
  app.use(express.static("genfiles_static"));

  server.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
  });
}
