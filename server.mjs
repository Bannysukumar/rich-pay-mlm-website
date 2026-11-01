/**
 * Production server for aaPanel / PM2 (Node 18+).
 * - Serves `dist/` (SPA)
 * - Proxies POST/OPTIONS `/api/call/:name` → Cloud Functions
 *   (fixes "Response is not valid JSON object" when SPA fallback returns HTML)
 *
 * Usage:
 *   PORT=4173 node server.mjs
 */
import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, 'dist')
const PORT = Number(process.env.PORT || 4173)
const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'richpay-live-fe3f1'
const REGION = process.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1'
const FUNCTIONS_ORIGIN =
  (process.env.FUNCTIONS_PROXY_ORIGIN || '').trim() ||
  `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
  'host',
  'proxy-connection',
])

function readReqBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body ?? '')
  // Drop any upstream content-length (any casing). Setting it twice makes nginx 502:
  // "upstream sent duplicate header line: content-length"
  const out = {}
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'content-length') continue
    out[key] = value
  }
  out['Content-Length'] = buf.length
  res.writeHead(status, out)
  res.end(buf)
}

function proxyRequest(targetUrl, method, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl)
    const lib = u.protocol === 'http:' ? http : https
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: `${u.pathname}${u.search}`,
        method,
        headers,
      },
      (up) => {
        const chunks = []
        up.on('data', (c) => chunks.push(c))
        up.on('end', () => {
          resolve({
            status: up.statusCode || 502,
            headers: up.headers,
            body: Buffer.concat(chunks),
          })
        })
      },
    )
    req.on('error', reject)
    if (body && body.length) req.write(body)
    req.end()
  })
}

async function proxyCallable(req, res, fnName) {
  const qs = req.url.includes('?') ? `?${req.url.split('?')[1]}` : ''
  const targetUrl = `${FUNCTIONS_ORIGIN}/${fnName}${qs}`
  const outHeaders = {}
  for (const [k, v] of Object.entries(req.headers)) {
    const kl = k.toLowerCase()
    if (HOP_BY_HOP.has(kl) || v == null) continue
    outHeaders[k] = Array.isArray(v) ? v.join(', ') : v
  }

  try {
    const body = req.method === 'OPTIONS' ? Buffer.alloc(0) : await readReqBody(req)
    if (body.length) outHeaders['content-length'] = String(body.length)
    const r = await proxyRequest(targetUrl, req.method, outHeaders, body)
    if (r.status >= 400) {
      console.warn(`[proxy] ${fnName} → ${r.status}`, r.body.toString('utf8').slice(0, 400))
    }
    const headers = {}
    for (const [key, value] of Object.entries(r.headers)) {
      if (value == null) continue
      const kl = key.toLowerCase()
      if (kl === 'transfer-encoding' || kl === 'connection') continue
      headers[key] = Array.isArray(value) ? value.join(', ') : value
    }
    send(res, r.status, r.body, headers)
  } catch (e) {
    console.error('[proxy] failed', fnName, e)
    send(res, 502, JSON.stringify({ error: 'functions proxy failed', detail: String(e) }), {
      'Content-Type': 'application/json',
    })
  }
}

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0])
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '')
  const full = path.join(root, cleaned)
  if (!full.startsWith(root)) return null
  return full
}

function serveStatic(req, res) {
  const urlPath = (req.url || '/').split('?')[0]
  let filePath = safeJoin(DIST, urlPath === '/' ? '/index.html' : urlPath)
  if (!filePath) {
    send(res, 400, 'Bad path')
    return
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html')
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    filePath = path.join(DIST, 'index.html')
  }
  if (!fs.existsSync(filePath)) {
    send(res, 503, 'dist/ missing — run npm run build')
    return
  }
  const ext = path.extname(filePath).toLowerCase()
  const type = MIME[ext] || 'application/octet-stream'
  const headers = { 'Content-Type': type }
  if (urlPath.startsWith('/assets/')) {
    headers['Cache-Control'] = 'public,max-age=31536000,immutable'
  }
  send(res, 200, fs.readFileSync(filePath), headers)
}

const server = http.createServer(async (req, res) => {
  const raw = req.url || '/'
  if (raw.startsWith('/api/call/')) {
    if (req.method !== 'POST' && req.method !== 'OPTIONS') {
      send(res, 405, 'Method Not Allowed')
      return
    }
    const fnName = (raw.split('?')[0] || '').slice('/api/call/'.length)
    if (!fnName || fnName.includes('/') || fnName.includes('..')) {
      send(res, 404, 'Not found')
      return
    }
    await proxyCallable(req, res, fnName)
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed')
    return
  }
  serveStatic(req, res)
})

// Listen on all interfaces (IPv6 + IPv4). Binding only 0.0.0.0 breaks nginx when
// proxy_pass uses localhost → ::1 (classic 502 while curl 127.0.0.1 still works).
server.listen(PORT, '::', () => {
  console.log(`[richpay] listening on :${PORT} (IPv6/IPv4)`)
  console.log(`[richpay] dist=${DIST}`)
  console.log(`[richpay] functions proxy → ${FUNCTIONS_ORIGIN}`)
})
