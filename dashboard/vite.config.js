import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Mounts the local chat at /api/chat (only in `npm run dev` and `npm run preview`).
// The chat calls the Ollama model from here, never from the browser. See chat/server.js.
function localChat(env) {
  const mount = async (server) => {
    const { createHandler } = await import('./chat/server.js')
    server.middlewares.use('/api/chat', createHandler(env))
  }
  return { name: 'local-chat', configureServer: mount, configurePreviewServer: mount }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), localChat(loadEnv(mode, process.cwd(), ''))],
}))
