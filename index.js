import { Project, VariableDeclarationKind, ScriptTarget, IndentationText, NewLineKind, QuoteKind } from "ts-morph"
// import { jsonSchemaToInterface } from './json-schema.js'
import jsonSchemaToDts from '@atek-cloud/json-schema-to-dts'
import { resolveRefs } from './resolve-refs.js'

const DEFAULT_JSONRPCMODULE_URL = 'https://raw.githubusercontent.com/pfrazee/deno-schema-rpc/master/mod.ts'

const PRELUDE = `
// Generated file
`

export async function generate (schema) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ScriptTarget.Latest
    },
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      useTrailingCommas: true,
      newLineKind: NewLineKind.LineFeed,
      quoteKind: QuoteKind.Single,
      insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
    }
  });

  await resolveRefs(schema)
  // console.log(JSON.stringify(schema, undefined, 2))

  if (schema.type === 'api') {
    const clientFile = project.createSourceFile(`${schema.id}.ts`, PRELUDE)
    generateApiClient(clientFile, schema)
    const serverFile = project.createSourceFile(`${schema.id}.server.ts`, PRELUDE)
    generateApiServer(serverFile, schema)
    return {clientFile, serverFile}
  }
  if (schema.type === 'adb-record') {
    const typeFile = project.createSourceFile(`${schema.id}.ts`, PRELUDE)
    const clientFile = project.createSourceFile(`${schema.id}.client.ts`, PRELUDE)
    const serverFile = project.createSourceFile(`${schema.id}.server.ts`, PRELUDE)
    jsonSchemaGenerateTypes(toSafeString(schema.title || schema.id), schema.definition, {
      sourceFile: typeFile,
      topLevel: { isExported: true },
      lifted: { isExported: true },
      anyType: 'any'
    })
    return {typeFile}
  }
  throw new Error(`Unknown schema type: ${schema.type}`)
}

function generateApiClient (clientFile, schema) {
  clientFile.addImportDeclaration({
    moduleSpecifier: DEFAULT_JSONRPCMODULE_URL,
    namedImports: [{ name: 'JsonRpcClient' }]
  })

  const clientClassName = `${toSafeString(schema.title || schema.id || '')}Client`
  const clientClass = clientFile.addClass({
    name: clientClassName
  })
  clientClass.setExtends('JsonRpcClient')

  const ctor = clientClass.addConstructor()
  ctor.setBodyText(`super(${JSON.stringify(schema, null, 2)})`)

  for (const methodName in schema.definition.methods) {
    const methodDef = schema.definition.methods[methodName]
    const method = clientClass.addMethod({name: methodName})
    method.setIsAsync(true)

    const returnType = generateParamType(clientFile, methodName, `Response`, methodDef.response)
    method.setReturnType(`Promise<${returnType}>`)

    const paramNames = []
    const params = jsonSchemaToParams(methodDef.params)
    for (let i = 0; i < params?.length; i++) {
      const paramName = params[i].name || `arg${i}`
      const param = method.addParameter({name: paramName})
      param.setType(generateParamType(clientFile, methodName, paramName, params[i]))
      paramNames.push(paramName)
    }

    method.setBodyText(`return this._rpc(${JSON.stringify(methodName)}, [${paramNames.join(', ')}])`)
  }

  clientFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{
      type: clientClassName,
      name: 'client',
      initializer: `new ${clientClassName}()`
    }]
  })
  clientFile.addExportAssignment({
    isExportEquals: false,
    expression: 'client'
  })
}

function generateApiServer (serverFile, schema) {
  serverFile.addImportDeclaration({
    moduleSpecifier: DEFAULT_JSONRPCMODULE_URL,
    namedImports: [{ name: 'JsonRpcServer' }, { name: 'JsonRpcServerHandlers' }]
  })

  const serverClassName = `${toSafeString(schema.title || schema.id || '')}Server`
  const serverClass = serverFile.addClass({
    name: serverClassName
  })
  serverClass.setExtends('JsonRpcServer')
  serverClass.setIsDefaultExport(true)

  const ctor = serverClass.addConstructor()
  const param = ctor.addParameter({name: 'handlers'})
  param.setType('JsonRpcServerHandlers')
  ctor.setBodyText(`super(${JSON.stringify(schema, null, 2)}, handlers)`)
}

function jsonSchemaToParams (def) {
  if (!def) return
  if (Array.isArray(def)) return def
  if (def.type === 'array') {
    return def.items
  }
  return [def]
}

function generateParamType (sourceFile, methodName, paramName, def) {
  if (!def) return 'undefined'
  if (def.type === 'array')  {
    throw new Error('Array parameters TODO')
  }
  if (def.type === 'object' || ('oneOf' in def)) {
    const typeName = toSafeString(`${methodName}_${paramName}`)
    jsonSchemaGenerateTypes(typeName, def, {
      sourceFile,
      topLevel: { isExported: true },
      lifted: { isExported: true },
      anyType: 'any'
    })
    return typeName
  }
  return def.type
}

// TODO
// this is a modified copy of the json-schema-to-dts generate function
// it's been changed to use the same source file
// we need to clean this up or fork that package
function jsonSchemaGenerateTypes (typeName, def, options) {
  const parser = new jsonSchemaToDts.Parser()
  parser.addSchema(`file://tmp.json`, def, {preferredName: typeName})
  parser.compile(options)
}

function toSafeString (str) {
  return (
    str
      .replace(/(^\s*[^a-zA-Z_$])|([^a-zA-Z_$\d])/g, ' ')
      // uppercase leading underscores followed by lowercase
      .replace(/^_[a-z]/g, (match) => match.toUpperCase())
      // remove non-leading underscores followed by lowercase (convert snake_case)
      .replace(/_[a-z]/g, (match) => match.substr(1, match.length).toUpperCase())
      // uppercase letters after digits, dollars
      .replace(/([\d$]+[a-zA-Z])/g, (match) => match.toUpperCase())
      // uppercase first letter after whitespace
      .replace(/\s+([a-zA-Z])/g, (match) => match.toUpperCase())
      // remove remaining whitespace
      .replace(/\s/g, '')
      .replace(/^[a-z]/, (match) => match.toUpperCase())
  );
}