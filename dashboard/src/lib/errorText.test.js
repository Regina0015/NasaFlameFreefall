import test from 'node:test'
import assert from 'node:assert/strict'
import { errorText } from './errorText.js'
import { loadFindings } from './findings/adapters.js'

// Exactly what Vercel answers for a missing /api/* path when the request asks for JSON.
const VERCEL_404 = { error: { code: '404', message: 'The page could not be found' } }

test('errorText always gives text or null', () => {
  assert.equal(errorText({ error: 'Use POST.' }), 'Use POST.')
  assert.equal(errorText(VERCEL_404), 'The page could not be found (404)')
  assert.equal(errorText({ error: { message: 'x' } }), 'x')
  for (const body of [null, undefined, 'text', {}, { error: '' }, { error: 42 }, { error: { code: 'X' } }]) {
    assert.equal(errorText(body), null)
  }
})

test('on a deployed site the findings sources report text, never an object', async () => {
  const fetchImpl = async () => Response.json(VERCEL_404, { status: 404 })
  const result = await loadFindings({ fetchImpl })
  assert.equal(result.source, null)
  for (const attempt of result.attempts) assert.equal(typeof attempt.message, 'string', `${attempt.id}: ${attempt.message}`)
})
