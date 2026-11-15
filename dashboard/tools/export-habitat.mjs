// Exports the conceptual habitat to public/models/flametrace-habitat-concept.glb.
// Usage (from dashboard/): npm run export:habitat
// It builds the same geometry the viewer uses (src/lib/habitat/build.js) and writes it with three's GLTFExporter.
// The file is generated output: change the generator, then export again.

import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { buildHabitat } from '../src/lib/habitat/build.js'

// GLTFExporter's binary mode expects the browser's FileReader; this is the small part of it that it uses.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result
      this.onloadend?.()
    })
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`
      this.onloadend?.()
    })
  }
}

const habitat = buildHabitat()
habitat.root.updateMatrixWorld(true)

const glb = await new GLTFExporter().parseAsync(habitat.root, { binary: true, onlyVisible: false })

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models', 'flametrace-habitat-concept.glb')
await mkdir(path.dirname(out), { recursive: true })
await writeFile(out, Buffer.from(glb))
habitat.dispose()
console.log(`Wrote ${out} (${glb.byteLength} bytes)`)
