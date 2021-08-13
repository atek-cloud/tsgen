import { generate } from './index.js'
import { promises as fsp } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const hereFolderPath = path.dirname(fileURLToPath(import.meta.url))
const schemasFolderPath = path.join(hereFolderPath, '..', 'schemas')
const names = await fsp.readdir(schemasFolderPath)

for (let name of names) {
  const schema = JSON.parse(await fsp.readFile(path.join(schemasFolderPath, name), 'utf8'))
  const res = generate(schema)
  for (let k in res) {
    console.log('----------')
    console.log(name, ':', k)
    console.log(res[k].print())
  }
}