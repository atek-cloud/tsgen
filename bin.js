#!/usr/bin/env node

import subcommand from 'subcommand'
import { generate } from './index.js'
import { promises as fsp } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import YAML from 'js-yaml'

const DEFAULT_OUT_DIR = 'gen'

const hereFolderPath = path.dirname(fileURLToPath(import.meta.url))
const schemasFolderPath = path.join(hereFolderPath, '..', 'schemas')

async function doGenerate (args) {
  const execPath = process.cwd()
  const outFolderPath = path.resolve(execPath, args.out || DEFAULT_OUT_DIR)
  await fsp.mkdir(outFolderPath).catch(e => undefined)

  let manifest
  try {
    manifest = JSON.parse(await fsp.readFile(path.join(execPath, 'app.json'), 'utf8'))
  } catch (e) {
    console.error('Failed to load app.json manifest')
    console.error(e)
    process.exit(1)
  }

  const apis = manifest?.protocols?.apis || []
  const tables = manifest?.protocols?.tables || []
  for (const schemaId of [...apis, ...tables]) {
    let [schemaDomain, schemaName] = schemaId.split('/')
    schemaName = schemaName.split('@')[0]

    console.log('Fetching schema', schemaId)
    const schema = await fetchSchema(schemaDomain, schemaName)

    console.log('Generating code for schema', schemaId)
    const files = await generate(schema)

    await fsp.mkdir(path.join(outFolderPath, schemaDomain)).catch(e => undefined)
    for (const k in files) {
      const outFilePath = path.join(outFolderPath, schemaDomain, files[k].getBaseName())
      console.log('Writing', outFilePath)
      await fsp.writeFile(outFilePath, files[k].print())
    }
  }

  console.log('Done')
}
async function doGenerateFolder (args) {
  const execPath = process.cwd()
  if (!args.in) throw new Error('Must specify --in')
  const inFolderPath = path.resolve(execPath, args.in)
  const outFolderPath = path.resolve(execPath, args.out || DEFAULT_OUT_DIR)
  await fsp.mkdir(outFolderPath).catch(e => undefined)

  const schemas = []
  try {
    const names = await fsp.readdir(inFolderPath)
    for (const name of names) {
      if (name.endsWith('.json')) {
        schemas.push(JSON.parse(await fsp.readFile(path.join(inFolderPath, name), 'utf8')))
      } else if (name.endsWith('.yaml')) {
        schemas.push(YAML.load(await fsp.readFile(path.join(inFolderPath, name), 'utf8')))
      }
    }
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
  console.log(schemas.length, 'schemas found in:', inFolderPath)

  for (const schema of schemas) {
    if (!schema.id) continue
    console.log('Generating code for schema', schema.id)
    const [schemaDomain] = schema.id.split('/')
    let files
    try {
      files = await generate(schema)
    } catch (e) {
      if (args['skip-errors']) {
        console.log('  Skipping due to error')
        console.log(' ', e)
      } else {
        throw e
      }
    }

    await fsp.mkdir(path.join(outFolderPath, schemaDomain)).catch(e => undefined)
    for (const k in files) {
      const outFilePath = path.join(outFolderPath, schemaDomain, files[k].getBaseName())
      console.log('  Writing', outFilePath)
      await fsp.writeFile(outFilePath, files[k].print())
    }
  }

  console.log('Done')
}

async function fetchSchema (schemaDomain, schemaName) {
  // TODO
  return JSON.parse(await fsp.readFile(path.join(schemasFolderPath, schemaName + '.json'), 'utf8'))
}

const match = subcommand({
  commands: [
    {
      name: 'gen',
      command: doGenerate
    },
    {
      name: 'gen-folder',
      command: doGenerateFolder
    }
  ],
  root: {
    command: doGenerate
  }
})
const cmd = match(process.argv.slice(2))