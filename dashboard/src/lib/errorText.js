// The error message of a JSON response body, always as text (or null).
// Our local endpoints answer { error: 'text' }, but a host can answer differently: on Vercel a missing /api/* path
// asked for JSON answers { error: { code: '404', message: '...' } }. Rendering that object would crash React.
export function errorText(body) {
  const error = body && typeof body === 'object' ? body.error : null
  if (typeof error === 'string') return error || null
  if (error && typeof error === 'object' && typeof error.message === 'string') {
    return typeof error.code === 'string' || typeof error.code === 'number' ? `${error.message} (${error.code})` : error.message
  }
  return null
}
