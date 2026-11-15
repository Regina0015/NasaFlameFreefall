// Chat settings. Runs only in the local Vite server, never in the browser.
// Same local model and parameters as the Auditor (_config/models.md).
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export function createConfig(env = process.env) {
  return {
    ollamaUrl: env.OLLAMA_URL || 'http://localhost:11434',
    model: env.CHAT_MODEL || 'gemma4:e4b-it-qat',
    think: false, // required with Gemma 4, or it "thinks" before answering
    options: { temperature: 0, seed: 42, num_ctx: 8192 },
    keepAlive: '30m', // keep the model on the GPU between questions; the first load is slow
    maxSteps: 4, // model calls per question (tools + final answer)
    maxTurns: 6, // history messages sent to the model (fits in 8192 tokens)
    repoRoot: path.resolve(HERE, '..', '..'), // scripts/chat_tools.py runs from here
    uvCommand: env.UV_COMMAND || 'uv',
    toolTimeoutMs: 30_000,
  }
}
