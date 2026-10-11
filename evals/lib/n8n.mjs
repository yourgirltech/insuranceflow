// Runs code and expressions straight from an exported n8n workflow, so the evals exercise
// the exact validation, prompt and guardrail logic that production runs, not a copy of it.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

export function loadWorkflow(path) {
  const wf = JSON.parse(readFileSync(path, 'utf8'))
  const nodes = new Map(wf.nodes.map(n => [n.name, n]))
  return {
    name: wf.name,
    node(name) {
      const n = nodes.get(name)
      if (!n) throw new Error(`Node "${name}" not found in ${path}. Was it renamed in n8n?`)
      return n
    },
  }
}

/** Values of a Set node, e.g. the pipeline's Config node. */
export function readSetNode(node) {
  return Object.fromEntries(node.parameters.assignments.assignments.map(a => [a.name, a.value]))
}

/**
 * Stand-ins for the n8n globals the workflow uses: $('Node').first().json, $input, $json and $now.
 * `outputs` maps node names to the items that node produced in this run.
 */
function n8nGlobals({ outputs = {}, input = [], json, now = new Date() }) {
  const $ = name => {
    if (!(name in outputs)) throw new Error(`Workflow referenced node "${name}", which the harness has not run yet.`)
    const items = outputs[name]
    return { first: () => ({ json: items[0] }), all: () => items.map(j => ({ json: j })), item: { json: items[0] } }
  }
  const iso = now.toISOString()
  const $now = {
    toISO: () => iso,
    toFormat: fmt => fmt.replace('yyyy', iso.slice(0, 4)).replace('MM', iso.slice(5, 7)).replace('dd', iso.slice(8, 10)),
  }
  const $input = { all: () => input.map(j => ({ json: j })), first: () => ({ json: input[0] }) }
  return { $, $input, $json: json, $now }
}

// Copies a value out of the sandbox realm into plain objects and arrays.
const plain = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

/** Runs a Code node and returns the `json` of each item it outputs. */
export function runCodeNode(node, ctx = {}) {
  const items = vm.runInNewContext(`(() => {\n${node.parameters.jsCode}\n})()`, n8nGlobals(ctx), {
    timeout: 2000,
    filename: `n8n:${node.name}`,
  })
  return plain(items).map(i => i.json)
}

function evaluate(expr, ctx) {
  return vm.runInNewContext(`(${expr})`, n8nGlobals(ctx), { timeout: 2000 })
}

/**
 * Resolves an n8n parameter. Values starting with "=" are expressions: "={{ expr }}" returns the
 * expression's value, and "=text {{ expr }} text" interpolates into a string.
 */
export function evalParam(value, ctx = {}) {
  if (typeof value !== 'string' || !value.startsWith('=')) return value
  const tpl = value.slice(1)
  const whole = tpl.trim().match(/^\{\{([\s\S]*)\}\}$/)
  if (whole) return plain(evaluate(whole[1], ctx))
  return tpl.replace(/\{\{([\s\S]*?)\}\}/g, (_, e) => String(evaluate(e, ctx)))
}
