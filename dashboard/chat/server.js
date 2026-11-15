// Local chat endpoint, mounted by vite.config.js at /api/chat (npm run dev and npm run preview).
//   POST /api/chat         { messages: [{role, content}], view: 'student' | 'professional' }
//   GET  /api/chat/status  is Ollama up, and does it have the model?
// It does not exist on Vercel: there the chat panel hides itself.

import { stat } from 'node:fs/promises'
import path from 'node:path'
import { createConfig } from './config.js'
import { createTools } from './tools.js'
import { respond } from './agent.js'

const BODY_LIMIT = 64 * 1024

function send(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = ''
    req.on('data', (part) => {
      text += part
      if (text.length > BODY_LIMIT) reject(new Error('Message too large.'))
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(text || '{}'))
      } catch {
        reject(new Error('The request body is not JSON.'))
      }
    })
    req.on('error', reject)
  })
}

// When the local snapshot the tools read was last written (null if it is missing).
async function snapshotUpdated(config) {
  try {
    const file = path.join(config.repoRoot, 'data', 'snapshot', 'tests.csv')
    return (await stat(file)).mtime.toISOString()
  } catch {
    return null
  }
}

async function ollamaStatus(config) {
  try {
    const r = await fetch(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
    const { models = [] } = await r.json()
    const installed = models.some((m) => m.name === config.model || m.model === config.model)
    // Preload the model on the GPU when the dashboard opens, so the first question does not wait.
    if (installed) {
      fetch(`${config.ollamaUrl}/api/generate`, {
        method: 'POST',
        body: JSON.stringify({ model: config.model, keep_alive: config.keepAlive }),
      }).catch(() => {})
    }
    return { ollama: true, model: config.model, model_installed: installed }
  } catch {
    return { ollama: false, model: config.model, model_installed: false }
  }
}

// The dashboard's switch says 'cientifico'; the chat calls that view 'professional'.
const VIEWS = { student: 'student', estudiante: 'student', professional: 'professional', cientifico: 'professional' }

export function createHandler(env) {
  const config = createConfig(env)
  const tools = createTools(config)

  return async function handler(req, res) {
    try {
      if (req.method === 'GET' && req.url.startsWith('/status')) {
        const s = await ollamaStatus(config)
        return send(res, 200, {
          ...s,
          available: s.ollama && s.model_installed,
          snapshot_updated: await snapshotUpdated(config),
        })
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' })

      const { messages, view } = await readBody(req)
      const output = await respond({ messages, view: VIEWS[view] ?? 'student' }, { config, tools })
      return send(res, 200, output)
    } catch (e) {
      if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND'].includes(e.cause?.code) || e.message === 'fetch failed') {
        return send(res, 503, { error: `Ollama is not responding at ${config.ollamaUrl}. Is it running?` })
      }
      if (e.status === 404) return send(res, 503, { error: `The model is missing. Run: ollama pull ${config.model}` })
      return send(res, 400, { error: e.message })
    }
  }
}
