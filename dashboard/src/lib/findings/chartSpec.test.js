import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chartRows, checkSpec, prepareSpec } from './chartSpec.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

test('the stored chart of a real finding is supported and keeps its data', async () => {
  const finding = JSON.parse(await readFile(path.resolve(HERE, '../../../../stages/04_calcular/output/findings/F-001.json'), 'utf8'))
  assert.equal(checkSpec(finding.chart), null)
  const prepared = prepareSpec(finding.chart, { text: '#eee' })
  assert.ok(prepared.ok)
  assert.deepEqual(prepared.spec.data, finding.chart.data) // data untouched
  const labels = prepared.spec.layer.filter((l) => l.mark?.type === 'rule' || l.mark?.type === 'text')
  assert.ok(labels.every((l) => l.mark.color === '#eee'))
  assert.equal(finding.chart.layer[1].mark.color, '#444') // the original object is not modified
})

test('external data, unknown marks and non-Vega-Lite specs are refused', () => {
  const base = { $schema: 'https://vega.github.io/schema/vega-lite/v6.json', data: { values: [{ a: 1 }] }, mark: 'bar' }
  assert.equal(checkSpec(base), null)
  assert.match(checkSpec({ ...base, data: { url: 'https://example.com/x.csv' } }), /external|inline/)
  assert.match(checkSpec({ ...base, layer: [{ data: { url: 'x' } }] }), /external/)
  assert.match(checkSpec({ ...base, mark: 'geoshape' }), /unsupported mark/)
  assert.match(checkSpec({ ...base, $schema: 'https://example.com/other.json' }), /not a Vega-Lite/)
  assert.match(checkSpec(null), /not a specification/)
})

test('chartRows lists the columns of the data table', () => {
  assert.deepEqual(chartRows({ data: { values: [{ a: 1, b: 2 }, { a: 3, c: 4 }] } }).columns, ['a', 'b', 'c'])
})
