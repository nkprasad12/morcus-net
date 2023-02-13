import http from 'http';

const host = 'localhost';
const port = 8000;

function requestListener(message: string) {
    return (_req: http.IncomingMessage, res: http.ServerResponse) => {
        res.writeHead(200);
        res.end(message);
    }
}
export function startServer(message: string): void {
    const server = http.createServer(requestListener(message));
    server.listen(port, host, () => {
        console.log(`Server is running on http://${host}:${port}`);
    });
}
