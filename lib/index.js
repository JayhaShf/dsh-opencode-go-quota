import z from '@deepseek-ai/schemastery'

export const Config = z.object({
  baseUrl: z.string().default('https://opencode.ai'),
  pollIntervalSec: z.number().min(10).default(300),
  requestTimeoutMs: z.number().min(1000).max(120000).default(20000),
})

const CREDENTIAL_REF = 'OPENCODE_GO_QUOTA_CONFIG'

function normalizeUrl(value) {
  const raw = String(value || 'https://opencode.ai').trim().replace(/\/+$/, '')
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('baseUrl 不是合法 URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('baseUrl 仅支持 http/https')
  }
  if (url.username || url.password) {
    throw new Error('baseUrl 不能包含用户名或密码')
  }
  return raw
}

function maskKey(key) {
  if (!key) return null
  if (key.length <= 8) return '****'
  return `${key.slice(0, 4)}****${key.slice(-4)}`
}

function normalizeWindow(value) {
  const source = value || {}
  return {
    percent: Number(source.percent) || 0,
    used: typeof source.used === 'number' ? source.used : null,
    limit: typeof source.limit === 'number' ? source.limit : null,
    resetsAt: typeof source.resetsAt === 'string' ? source.resetsAt : null,
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 256 * 1024) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!chunks.length) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function snapshotState(state) {
  return {
    configured: Boolean(state.apiKey),
    keyMasked: maskKey(state.apiKey),
    baseUrl: state.baseUrl,
    pollIntervalSec: state.pollIntervalSec,
    snapshot: state.snapshot,
    lastError: state.lastError,
    lastCheckedAt: state.lastCheckedAt,
  }
}

export default {
  name: 'opencode-go-quota',
  Config,
  apply(ctx, config) {
    const state = {
      apiKey: '',
      baseUrl: normalizeUrl(config.baseUrl),
      pollIntervalSec: config.pollIntervalSec,
      requestTimeoutMs: config.requestTimeoutMs,
      snapshot: null,
      lastError: null,
      lastCheckedAt: null,
    }

    let pollTimer = null

    async function fetchQuota(key, baseUrl, signal) {
      const url = normalizeUrl(baseUrl) + '/zen/go/v1/usage'
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(new Error('timeout')), state.requestTimeoutMs)
      if (signal) {
        if (signal.aborted) controller.abort()
        else signal.addEventListener('abort', () => controller.abort(), { once: true })
      }

      let response
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: {
            authorization: `Bearer ${key}`,
            accept: 'application/json',
          },
          redirect: 'follow',
          signal: controller.signal,
        })
      } catch (error) {
        throw new Error(`请求失败：${error && error.message ? error.message : String(error)}`)
      } finally {
        clearTimeout(timeout)
      }

      const text = await response.text()
      if (response.status !== 200) {
        const hint = response.status === 401
          ? 'API Key 无效'
          : response.status === 403
            ? '该 Key 未开通 OpenCode Go'
            : `HTTP ${response.status}`
        throw new Error(`${hint}${text.trim() ? `：${text.trim().slice(0, 200)}` : ''}`)
      }

      let data
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error('返回内容不是 JSON')
      }

      const usage = data && data.usage
      if (!usage || !usage.rolling || !usage.weekly || !usage.monthly) {
        throw new Error('响应中缺少 usage.rolling/weekly/monthly')
      }

      return {
        usage: {
          rolling: normalizeWindow(usage.rolling),
          weekly: normalizeWindow(usage.weekly),
          monthly: normalizeWindow(usage.monthly),
        },
        fetchedAt: Date.now(),
      }
    }

    async function refresh(force) {
      if (!state.apiKey) return { ok: false, error: '尚未配置 API Key' }
      try {
        if (force || !state.snapshot) {
          state.snapshot = await fetchQuota(state.apiKey, state.baseUrl)
          state.lastError = null
        }
        state.lastCheckedAt = Date.now()
        return { ok: true, snapshot: state.snapshot }
      } catch (error) {
        state.lastError = error && error.message ? error.message : String(error)
        state.lastCheckedAt = Date.now()
        return { ok: false, error: state.lastError }
      }
    }

    function startPolling() {
      if (pollTimer) {
        pollTimer()
        pollTimer = null
      }
      if (ctx.timer && state.apiKey && state.pollIntervalSec > 0) {
        pollTimer = ctx.timer.interval(() => refresh(false), state.pollIntervalSec * 1000)
      }
    }

    async function applyConfig(body) {
      if (typeof body.apiKey === 'string') {
        state.apiKey = body.apiKey.trim()
      }
      if (typeof body.baseUrl === 'string' && body.baseUrl.trim()) {
        state.baseUrl = normalizeUrl(body.baseUrl)
      }
      if (typeof body.pollIntervalSec === 'number' && body.pollIntervalSec >= 10) {
        state.pollIntervalSec = Math.floor(body.pollIntervalSec)
      }
      if (ctx.get('credentials')) {
        try {
          if (state.apiKey) {
            await ctx.get('credentials').set(CREDENTIAL_REF, JSON.stringify({
              apiKey: state.apiKey,
              baseUrl: state.baseUrl,
              pollIntervalSec: state.pollIntervalSec,
            }))
          } else {
            await ctx.get('credentials').unset(CREDENTIAL_REF)
          }
        } catch (error) {
          console.log('[opencode-go-quota] persist config failed:', error && error.message ? error.message : error)
        }
      }
      startPolling()
      if (state.apiKey) {
        await refresh(true)
      } else {
        state.snapshot = null
        state.lastError = null
      }
    }

    async function restoreFromCredentials() {
      const credentials = ctx.get('credentials')
      if (!credentials) return
      try {
        const resolved = await credentials.resolve(CREDENTIAL_REF)
        if (resolved && resolved.value) {
          const saved = JSON.parse(resolved.value)
          if (typeof saved.apiKey === 'string') state.apiKey = saved.apiKey.trim()
          if (typeof saved.baseUrl === 'string' && saved.baseUrl.trim()) {
            try {
              state.baseUrl = normalizeUrl(saved.baseUrl)
            } catch {
              // keep current value
            }
          }
          if (typeof saved.pollIntervalSec === 'number' && saved.pollIntervalSec >= 10) {
            state.pollIntervalSec = saved.pollIntervalSec
          }
          if (state.apiKey) {
            startPolling()
            refresh(true)
          }
        }
      } catch (error) {
        console.log('[opencode-go-quota] restore config failed:', error && error.message ? error.message : error)
      }
    }

    if (ctx.webServer) {
      ctx.effect(() => ctx.webServer.register({
        kind: 'prefix',
        path: '/ocgo-quota',
        handler: async (req, res) => {
          const send = (status, payload) => {
            res.writeHead(status, {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store',
            })
            res.end(JSON.stringify(payload))
          }

          try {
            const url = new URL(req.url || '/', 'http://localhost')
            const path = url.pathname
            const method = req.method || 'GET'

            if (method === 'GET' && path === '/ocgo-quota/status') {
              send(200, snapshotState(state))
              return
            }

            if (method === 'POST' && path === '/ocgo-quota/refresh') {
              send(200, await refresh(true))
              return
            }

            if (method === 'POST' && path === '/ocgo-quota/config') {
              const body = await readBody(req)
              try {
                await applyConfig(body)
                send(200, { ok: true })
              } catch (error) {
                send(200, { ok: false, error: error && error.message ? error.message : String(error) })
              }
              return
            }

            if (method === 'POST' && path === '/ocgo-quota/test') {
              const body = await readBody(req)
              const key = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
              const base = typeof body.baseUrl === 'string' && body.baseUrl.trim()
                ? body.baseUrl
                : state.baseUrl
              if (!key) {
                send(200, { ok: false, error: '请填写要测试的 API Key' })
                return
              }
              try {
                send(200, { ok: true, snapshot: await fetchQuota(key, base) })
              } catch (error) {
                send(200, { ok: false, error: error && error.message ? error.message : String(error) })
              }
              return
            }

            send(404, { ok: false, error: 'not found' })
          } catch (error) {
            try {
              send(500, { ok: false, error: error && error.message ? error.message : String(error) })
            } catch {
              // response already closed
            }
          }
        },
      }), 'opencode-go-quota web routes')
    }

    restoreFromCredentials()
  },
}
