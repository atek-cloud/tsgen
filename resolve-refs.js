import pointerlib from 'json-pointer'
import fetch from 'node-fetch'

export async function resolveRefs (node, root) {
  root = root || node
  if (!node || typeof node !== 'object') return
  for (const k in node) {
    if (node[k].$ref) {
      console.log('Resolving $ref', node[k].$ref)
      const $ref = node[k].$ref
      let jsonPointer = ''
      let obj = root
      if ($ref.startsWith('#')) {
        jsonPointer = $ref.slice(1)
      } else if ($ref.startsWith('/')) {
        jsonPointer = $ref
      } else {
        const [url, ptr] = $ref.split('#')
        obj = await fetchSchema(url)
        jsonPointer = ptr || ''
      }
      node[k] = pointerlib.get(obj, jsonPointer)
    } else {
      await resolveRefs(node[k], root)
    }
  }
}

async function fetchSchema (url) {
  let schema
  try {
    schema = await (await fetch(url)).json()
  } catch (e) {
    console.error(`Failed to resolve reference to ${url}`)
    throw e
  }
  await resolveRefs(schema, schema, console.log)
  return schema
}