const { program } = require('commander');
const http = require('http');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const superagent = require('superagent');

program
  .requiredOption('-h, --host <host>', "серверний хост (обов'язковий)")
  .requiredOption('-p, --port <port>', "порт сервера (обов'язковий)")
  .requiredOption('-c, --cache <dir>', "шлях до директорії кешу (обов'язковий)")
  .parse(process.argv);

(async () => {
  try {
    const opts = program.opts();

    const port = Number(opts.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      console.error(`Помилка: некоректний порт: ${opts.port}`);
      process.exit(1);
    }

    const cacheDir = path.resolve(opts.cache);

    
    if (!fsSync.existsSync(cacheDir)) {
      fsSync.mkdirSync(cacheDir, { recursive: true });
    }

    function parseCodeFromUrl(url) {
      if (!url) return null;
      const clean = url.split('?')[0];
      const parts = clean.split('/').filter(Boolean);
      if (parts.length === 0) return null;
      const code = parts[0];
      if (!/^\d+$/.test(code)) return null;
      return code;
    }

    function filePathForCode(code) {
      return path.join(cacheDir, `${code}.jpg`);
    }

    function readRequestBody(req) {
      return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', err => reject(err));
      });
    }

    const server = http.createServer(async (req, res) => {
      try {
        if (req.method === 'GET' && (req.url === '/' || req.url === '/cache')) {
          const files = await fs.readdir(cacheDir);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ message: 'Cache directory contents', cacheDir, files }, null, 2));
          return;
        }

        const code = parseCodeFromUrl(req.url);
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('400 Bad Request: use /<code> (e.g. /200) or /cache\n');
          return;
        }

        const filepath = filePathForCode(code);

        
        if (req.method === 'GET') {
          try {
            
            const data = await fs.readFile(filepath);
            res.writeHead(200, { 'Content-Type': 'image/jpeg' });
            res.end(data);
          } catch (err) {
            if (err.code === 'ENOENT') {
              
              try {
                const response = await superagent.get(`https://http.cat/${code}`).responseType('blob');
                const buffer = Buffer.from(response.body);
                
                await fs.writeFile(filepath, buffer);
                res.writeHead(200, { 'Content-Type': 'image/jpeg' });
                res.end(buffer);
              } catch (fetchErr) {
                
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('404 Not Found\n');
              }
            } else {
              console.error('GET error:', err);
              res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end('500 Internal Server Error\n');
            }
          }
          return;
        }


        if (req.method === 'PUT') {
          try {
            const body = await readRequestBody(req);
            await fs.writeFile(filepath, body);
            res.writeHead(201, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('201 Created\n');
          } catch (err) {
            console.error('PUT error:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('500 Internal Server Error\n');
          }
          return;
        }

        if (req.method === 'DELETE') {
          try {
            await fs.unlink(filepath);
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('200 OK - deleted\n');
          } catch (err) {
            if (err.code === 'ENOENT') {
              res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end('404 Not Found\n');
            } else {
              console.error('DELETE error:', err);
              res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end('500 Internal Server Error\n');
            }
          }
          return;
        }


        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('405 Method Not Allowed\n');

      } catch (err) {
        console.error('Помилка при обробці запиту:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Internal Server Error\n');
      }
    });

    server.listen(port, opts.host, () => {
      console.log(`Server running at http://${opts.host}:${port}/`);
      console.log(`Cache directory: ${cacheDir}`);
    });

    process.on('SIGINT', () => {
      console.log('Received SIGINT, closing server...');
      server.close(() => process.exit(0));
    });
    process.on('SIGTERM', () => {
      console.log('Received SIGTERM, closing server...');
      server.close(() => process.exit(0));
    });

  } catch (err) {
    console.error('Помилка при запуску програми:', err.message || err);
    process.exit(1);
  }
})();
