// The local chat endpoint refuses requests that do not come from the dashboard page itself.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createHandler } from './server.js'

// OLLAMA_URL points to a closed port: a request that gets past the checks answers 503, never 4xx.
async function withServer(fn) {
  const server = http.createServer(createHandler({ OLLAMA_URL: 'http://127.0.0.1:9' }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    await fn(`http://127.0.0.1:${server.address().port}`)
  } finally {
    server.close()
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const BODY = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], view: 'student' })

test('a POST from another website is refused before the model runs', async () => {
  await withServer(async (base) => {
    const r = await fetch(base, { method: 'POST', headers: { ...JSON_HEADERS, Origin: 'https://evil.example' }, body: BODY })
    assert.equal(r.status, 403)
  })
})

test('a POST that is not JSON (a plain form or text post from any page) is refused', async () => {
  await withServer(async (base) => {
    const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: BODY })
    assert.equal(r.status, 415)
  })
})

test('a body over the limit is refused with 413', async () => {
  await withServer(async (base) => {
    const big = JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(70 * 1024) }] })
    const r = await fetch(base, { method: 'POST', headers: JSON_HEADERS, body: big })
    assert.equal(r.status, 413)
  })
})

test('the dashboard page itself gets through the checks', async () => {
  await withServer(async (base) => {
    const r = await fetch(base, { method: 'POST', headers: { ...JSON_HEADERS, Origin: base }, body: BODY })
    assert.equal(r.status, 503) // past the checks; the (closed) model port answers
  })
})
