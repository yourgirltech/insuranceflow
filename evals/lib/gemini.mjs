// Minimal Gemini REST client. The workflow sends its key as a ?key= query parameter; the harness
// sends the same requests with the key in a header so it never appears in URLs, logs or reports.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const sleep = ms => new Promise(r => setTimeout(r, ms))

export function createGemini({ apiKey, fetchImpl = fetch, maxRetries = 4, timeoutMs = 60_000 }) {
  if (!apiKey) throw new Error('Set GEMINI_API_KEY to run live evals (or use --replay).')

  async function post(url, body) {
    for (let attempt = 0; ; attempt++) {
      const started = Date.now()
      let res
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: typeof body === 'string' ? body : JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (err) {
        if (attempt < maxRetries) { await sleep(1000 * 2 ** attempt); continue }
        throw err
      }
      const text = await res.text()
      if (res.ok) return { json: JSON.parse(text), ms: Date.now() - started }
      const retryable = res.status === 429 || res.status >= 500
      if (retryable && attempt < maxRetries) { await sleep(1000 * 2 ** attempt); continue }
      throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
  }

  return { post }
}

/**
 * Wraps a client so embedding calls are cached on disk. Embeddings are deterministic, so repeat
 * runs only pay for the coverage calls. Generation calls are never cached.
 */
export function withEmbeddingCache(client, cachePath) {
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {}
  let dirty = false
  return {
    async post(url, body) {
      if (!url.includes(':embedContent')) return client.post(url, body)
      const key = createHash('sha256').update(url).update(typeof body === 'string' ? body : JSON.stringify(body)).digest('hex')
      if (cache[key]) return { json: { embedding: { values: cache[key] } }, ms: 0, cached: true }
      const res = await client.post(url, body)
      cache[key] = res.json.embedding.values
      dirty = true
      return res
    },
    save() {
      if (!dirty) return
      mkdirSync(dirname(cachePath), { recursive: true })
      writeFileSync(cachePath, JSON.stringify(cache))
      dirty = false
    },
  }
}
