import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from 'vite'
import type { Plugin } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
  'host',
  'proxy-connection',
])

/** Strip headers that confuse Cloud Run / extensions when proxying register. */
function shouldDropForRegister(kl: string): boolean {
  if (kl === 'authorization') return true
  if (kl === 'cookie') return true
  if (kl === 'origin') return true
  if (kl === 'referer') return true
  if (kl.startsWith('sec-')) return true
  return false
}

let idTokenCache: { token: string; until: number } | null = null

async function getServiceAccountIdToken(targetUrl: string, keyfile: string, projectId: string): Promise<string> {
  if (idTokenCache && Date.now() < idTokenCache.until) {
    return idTokenCache.token
  }
  const { GoogleAuth } = await import('google-auth-library')
  const keyPath = path.isAbsolute(keyfile) ? keyfile : path.resolve(process.cwd(), keyfile)
  const auth = new GoogleAuth({
    keyFile: keyPath,
    projectId,
  })
  const client = await auth.getIdTokenClient(targetUrl)
  const headers = await client.getRequestHeaders()
  let raw = ''
  if (headers instanceof globalThis.Headers) {
    raw = headers.get('Authorization') ?? headers.get('authorization') ?? ''
  } else {
    const h = headers as unknown as Record<string, string>
    raw = h.Authorization ?? h.authorization ?? ''
  }
  const m = String(raw || '').match(/^Bearer\s+(.+)$/i)
  const token = m?.[1]?.trim() ?? ''
  if (!token) throw new Error('Empty ID token from service account')
  idTokenCache = { token, until: Date.now() + 50 * 60 * 1000 }
  return token
}

type ProxyEnv = {
  manualBearer: string
  keyfile: string
  projectId: string
  registerAttachSaToken: boolean
}

type ProxyOpts = { targetOrigin: string; env: ProxyEnv }

function createFunctionsProxyMiddleware(opts: ProxyOpts) {
  return async function functionsProxy(req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) {
    const raw = req.url ?? ''
    if (!raw.startsWith('/api/call/')) return next()

    const pathname = raw.split('?')[0] ?? ''
    const fnName = pathname.slice('/api/call/'.length)
    if (!fnName) return next()

    if (req.method !== 'POST' && req.method !== 'OPTIONS') return next()

    const qs = raw.includes('?') ? `?${raw.split('?')[1]}` : ''
    const targetUrl = `${opts.targetOrigin}/${fnName}${qs}`

    try {
      const out = new globalThis.Headers()
      const isRegister = fnName === 'registerWithProfile'

      for (const [k, v] of Object.entries(req.headers)) {
        const kl = k.toLowerCase()
        if (HOP_BY_HOP.has(kl)) continue
        if (v === undefined) continue
        if (isRegister && shouldDropForRegister(kl)) continue
        const val = Array.isArray(v) ? v.join(', ') : v
        out.set(k, val)
      }

      if (isRegister) {
        let bearer = opts.env.manualBearer.trim()
        if (!bearer && opts.env.registerAttachSaToken && opts.env.keyfile) {
          try {
            bearer = await getServiceAccountIdToken(targetUrl, opts.env.keyfile, opts.env.projectId)
          } catch (e) {
            console.warn('[vite] FUNCTIONS_PROXY_KEYFILE ID token failed:', e)
          }
        }
        if (bearer) {
          out.set('Authorization', `Bearer ${bearer}`)
        }
      }

      if (req.method === 'OPTIONS') {
        const r = await fetch(targetUrl, { method: 'OPTIONS', headers: out })
        res.statusCode = r.status
        r.headers.forEach((value, key) => {
          const kl = key.toLowerCase()
          if (kl === 'transfer-encoding' || kl === 'connection') return
          res.setHeader(key, value)
        })
        res.end()
        return
      }

      const body = await readBody(req)
      const r = await fetch(targetUrl, {
        method: 'POST',
        headers: out,
        body,
      })

      if (r.status >= 400) {
        const errText = await r.clone().text().catch(() => '')
        console.warn(`[vite] functions proxy ${fnName} → ${r.status}`, errText.slice(0, 500))
      }

      res.statusCode = r.status
      r.headers.forEach((value, key) => {
        const kl = key.toLowerCase()
        if (kl === 'transfer-encoding' || kl === 'connection') return
        res.setHeader(key, value)
      })
      res.end(Buffer.from(await r.arrayBuffer()))
    } catch (e) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'functions proxy failed', detail: String(e) }))
    }
  }
}

/**
 * Dev **and** preview: `/api/call/:name` → Cloud Functions (callable client uses same-origin in DEV;
 * `vite preview` needs this too or `/api/call/*` is 404).
 */
function functionsDevProxyPlugin(opts: ProxyOpts): Plugin {
  const mw = createFunctionsProxyMiddleware(opts)
  return {
    name: 'richpay-functions-dev-proxy',
    configureServer(server) {
      server.middlewares.use(mw)
    },
    configurePreviewServer(server) {
      server.middlewares.use(mw)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const projectId = env.VITE_FIREBASE_PROJECT_ID || 'richpay-live-fe3f1'
  const region = env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1'
  const functionsOrigin =
    (env.FUNCTIONS_PROXY_ORIGIN || '').trim() || `https://${region}-${projectId}.cloudfunctions.net`
  const manualBearer = (env.FUNCTIONS_PROXY_BEARER || '').trim()
  const keyfile = (env.FUNCTIONS_PROXY_KEYFILE || '').trim()
  const registerAttachSaToken = env.FUNCTIONS_PROXY_REGISTER_SA_TOKEN === 'true'

  return {
    plugins: [
      functionsDevProxyPlugin({
        targetOrigin: functionsOrigin,
        env: {
          manualBearer,
          keyfile,
          projectId,
          registerAttachSaToken,
        },
      }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // `vite preview` behind Nginx: Host header must be allowed or Vite responds with “Blocked request”.
    preview: {
      host: true,
      allowedHosts: ['richpay.live', 'www.richpay.live', 'localhost', '127.0.0.1'],
    },
  }
})
