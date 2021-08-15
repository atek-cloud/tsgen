#!/usr/bin/env node

import subcommand from 'subcommand'
import { parse, generateInterfaceSchemas, generate, EnvEnum } from './index.js'
import { promises as fsp } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DEFAULT_OUT_DIR = 'gen'

const hereFolderPath = path.dirname(fileURLToPath(import.meta.url))
const schemasFolderPath = path.join(hereFolderPath, '..', '..', 'schemas')

async function doGenerate (args) {
  /*
  TODO
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
    const files = await generate(schema, {env: args.env || 'deno-userland'})

    await fsp.mkdir(path.join(outFolderPath, schemaDomain)).catch(e => undefined)
    for (const k in files) {
      const outFilePath = path.join(outFolderPath, schemaDomain, files[k].getBaseName())
      console.log('Writing', outFilePath)
      await fsp.writeFile(outFilePath, files[k].print())
    }
  }

  console.log('Done')
  */
}
async function doGenerateFolder (args) {
  const execPath = process.cwd()
  if (!args.in) throw new Error('Must specify --in')
  const inFolderPath = path.resolve(execPath, args.in)
  const outFolderPath = path.resolve(execPath, args.out || DEFAULT_OUT_DIR)
  await fsp.mkdir(outFolderPath).catch(e => undefined)

  const apdls = []
  try {
    const names = await fsp.readdir(inFolderPath)
    for (const name of names) {
      if (name.endsWith('.d.ts')) {
        apdls.push({name, text: await fsp.readFile(path.join(inFolderPath, name), 'utf8')})
      }
    }
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
  console.log(apdls.length, 'apdls found in:', inFolderPath)

  const baseUrl = `file://${inFolderPath}${inFolderPath.endsWith('/') ? '' : '/'}`
  for (const apdl of apdls) {
    console.log('Generating code for schema', apdl.name)
    let dts, files
    try {
      dts = await parse(apdl.text, {baseUrl})
      if (!dts.metadata.id || !dts.metadata.id.includes('/')) {
        throw new Error('APDL ID must be set and must fit the "domain/name" form')
      }
      if (dts.metadata.type !== 'api' && dts.metadata.type !== 'adb-record') {
        throw new Error('APDL type must be "api" or "adb-record"')
      }
      const {schema, exportMap} = generateInterfaceSchemas(dts)
      files = generate(dts, schema, exportMap, {env: args.env || EnvEnum.DENO_USERLAND})
    } catch (e) {
      if (args['skip-errors']) {
        console.log('  Skipping due to error')
        console.log(' ', e)
      } else {
        throw e
      }
    }

    const [apdlDomain] = dts.metadata.id.split('/')
    await fsp.mkdir(path.join(outFolderPath, apdlDomain)).catch(e => undefined)
    for (const k in files) {
      const outFilePath = path.join(outFolderPath, apdlDomain, k)
      console.log('  Writing', outFilePath)
      await fsp.writeFile(outFilePath, files[k])
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