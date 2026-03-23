const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const BASE_PATH = normalizeBasePath(process.env.BASE_PATH || '');
const KEYCLOAK_VENDOR_FILE = path.resolve(__dirname, 'node_modules', 'keycloak-js', 'lib', 'keycloak.js');
const KEYCLOAK_URL = process.env.PUBLIC_KEYCLOAK_URL || 'http://localhost:8080';
const KEYCLOAK_ADMIN_URL = process.env.PUBLIC_KEYCLOAK_ADMIN_URL || `${KEYCLOAK_URL}/admin/master/console/`;
const PASSKEY_DEFAULT_NAME = process.env.PUBLIC_PASSKEY_DEFAULT_NAME || 'My App';

const PUBLIC_CONFIG = {
    keycloak: {
        url: KEYCLOAK_URL,
        realm: 'demo',
        clientId: 'demo-app'
    },
    urls: {
        admin: KEYCLOAK_ADMIN_URL
    },
    passkey: {
        defaultName: PASSKEY_DEFAULT_NAME
    }
};

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function normalizeBasePath(rawPath) {
    if (!rawPath || rawPath === '/') {
        return '';
    }

    return `/${rawPath}`.replace(/\/+/g, '/').replace(/\/$/, '');
}

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff'
    });
    res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
    res.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff'
    });
    res.end(text);
}

function sendFile(res, filePath) {
    fs.stat(filePath, (statError, stats) => {
        if (statError || !stats.isFile()) {
            sendText(res, 404, 'Not found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'X-Content-Type-Options': 'nosniff'
        });

        const stream = fs.createReadStream(filePath);
        stream.on('error', () => {
            if (!res.headersSent) {
                sendText(res, 500, 'Internal Server Error');
            } else {
                res.destroy();
            }
        });
        stream.pipe(res);
    });
}

function resolveRequestPath(reqUrl) {
    const requestUrl = new URL(reqUrl, 'http://localhost');
    let pathname = decodeURIComponent(requestUrl.pathname);

    if (BASE_PATH && pathname === BASE_PATH) {
        return {
            type: 'redirect',
            location: `${BASE_PATH}/${requestUrl.search}`
        };
    }

    if (BASE_PATH && pathname.startsWith(`${BASE_PATH}/`)) {
        pathname = pathname.slice(BASE_PATH.length);
    }

    if (pathname === '' || pathname === '/') {
        return {type: 'path', pathname: '/index.html'};
    }

    return {type: 'path', pathname};
}

function isInsidePublicDir(candidatePath) {
    const rel = path.relative(PUBLIC_DIR, candidatePath);
    return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

const server = http.createServer((req, res) => {
    if (!req.url) {
        sendText(res, 400, 'Bad Request');
        return;
    }

    const resolved = resolveRequestPath(req.url);
    if (resolved.type === 'redirect') {
        res.writeHead(308, {Location: resolved.location});
        res.end();
        return;
    }

    const pathname = resolved.pathname;

    if (pathname === '/health') {
        sendJson(res, 200, {ok: true});
        return;
    }

    if (pathname === '/config.json') {
        sendJson(res, 200, PUBLIC_CONFIG);
        return;
    }

    if (pathname === '/vendor/keycloak.js') {
        sendFile(res, KEYCLOAK_VENDOR_FILE);
        return;
    }

    const normalizedPath = path.posix.normalize(pathname).replace(/^\/+/, '');
    const absoluteFilePath = path.resolve(PUBLIC_DIR, normalizedPath);

    if (!isInsidePublicDir(absoluteFilePath)) {
        sendText(res, 403, 'Forbidden');
        return;
    }

    sendFile(res, absoluteFilePath);
});

server.listen(PORT, () => {
    const mount = BASE_PATH || '/';
    console.log(`Demo app running on port ${PORT} (base path: ${mount})`);
});
