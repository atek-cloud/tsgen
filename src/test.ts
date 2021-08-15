import { parse, generateInterfaceSchemas, generate, EnvEnum } from './index.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const hereFolderPath = path.dirname(fileURLToPath(import.meta.url))
const schemasFolderPath = path.join(hereFolderPath, '..', '..', 'schemas')
const names = fs.readdirSync(schemasFolderPath)

;(async () => {
  for (const name of names) {
    if (!name.endsWith('.d.ts')) continue
    // console.log(name)
    const fileText = fs.readFileSync(path.join(schemasFolderPath, name), 'utf8')
    const dts = await parse(fileText)
    if (dts.metadata.type !== 'adb-record') continue
    // generateInterfaceSchemas(dts)
    // console.log(dts.metadata)
    // console.log(dts.primaryInterfaceName)
    const {schema, exportMap} = generateInterfaceSchemas(dts)
    const res = generate(dts, schema, exportMap, {env: EnvEnum.HOST})
    console.log(res.recordFile)
    process.exit(0)
    // for (let k in res) {
    //   console.log('----------')
    //   console.log(name, ':', k)
    //   console.log(res[k].print())
    // }
  }
})()