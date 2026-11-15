// Plain-language reasons the assistant cannot answer, from GET /api/chat/status. Nothing here pretends it works.
export function assistantProblem(status) {
  if (!status || status.available) return null
  if (status.unreachable) {
    return 'Its backend is not reachable from this page. The assistant runs only locally, with npm run dev, Ollama and the repository data; it is not part of this deployment.'
  }
  if (status.ollama === false) return 'Ollama is not responding. Start Ollama, then use Retry.'
  return `The local model is missing. Run: ollama pull ${status.model}`
}
