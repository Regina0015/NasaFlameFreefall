// Downloads a .glb and checks it really is one. A missing file often comes back as the app's
// index.html with status 200, which a loader would report as a confusing parse error.
// Every failure names the URL and the cause. Nothing is retried or replaced silently.
export async function fetchGlb(url, signal) {
  let response
  try {
    response = await fetch(url, { signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new Error(
      `Could not reach ${url} (${error?.message || 'network error'}). Check that the dev server is running and serving this app's public/ folder.`,
    )
  }

  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`)

  const buffer = await response.arrayBuffer()
  const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength)))
  if (magic !== 'glTF') {
    const type = response.headers.get('content-type') || 'unknown type'
    throw new Error(`${url} is not a glTF binary (${type}, ${buffer.byteLength} bytes). The file is missing from this server.`)
  }

  return buffer
}
