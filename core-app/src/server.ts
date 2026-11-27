import { createServer } from 'node:http';
import { createApp } from './app.ts';

/** Optional local HTTP server: `node src/server.ts` then `curl localhost:3100/api/orders/ord_1001`. */
const app = createApp();
const port = Number(process.env.PORT ?? 3100);

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    body = raw;
  }
  const response = await app.handle({ method: req.method ?? 'GET', path: req.url ?? '/', body });
  res.writeHead(response.status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(response.body));
}).listen(port, '127.0.0.1', () => {
  console.log(`ShopFlow listening on http://127.0.0.1:${port}`);
});
