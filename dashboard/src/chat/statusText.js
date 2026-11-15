// Plain-language reasons the assistant cannot answer, from GET /api/chat/status. Nothing here pretends it works.
export function assistantProblem(status) {
  if (!status || status.available) return null
  if (status.unreachable) {
    return 'It is offline on this public site by design, for security. The assistant runs an open model (Gemma) on our own GPU, and we do not expose that machine to the internet: no open ports, no API keys in the browser, and questions are never sent to a third-party AI service. You can see it answering in our demo video, or run it locally from the repository.'
  }
  if (status.ollama === false) return 'Ollama is not responding. Start Ollama, then use Retry.'
  return `The local model is missing. Run: ollama pull ${status.model}`
}
