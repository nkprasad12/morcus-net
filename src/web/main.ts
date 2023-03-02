import fs from "fs";
import http from "http";

const host = "localhost";
const port = 8000;

function requestListener(contents: Buffer) {
  return (_req: http.IncomingMessage, res: http.ServerResponse) => {
    res.setHeader("Content-Type", "text/html");
    res.writeHead(200);
    res.end(contents);
  };
}

export function startServer(): void {
  const contents = fs.readFileSync("public/index.html");
  const server = http.createServer(requestListener(contents));
  server.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
  });
}
