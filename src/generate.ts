import { Project, VariableDeclarationKind, ScriptTarget, IndentationText, InterfaceDeclarationStructure, QuoteKind, SourceFile, SyntaxKind } from 'ts-morph'
import { ParsedDTS, GenerateOpts, EnvEnum, ExportMap } from './types.js'
import { toSafeString, removeImport, removeGenerics, removeQuotes } from './util.js'

const HOST_APIBROKER_IMPORT = '@atek-cloud/api-broker'
const NODE_RPC_IMPORT = '@atek-cloud/node-rpc'
const DENO_RPC_IMPORT = 'https://atek.cloud/x/rpc@latest/mod.ts'

const PRELUDE = (env: EnvEnum) => `
/**
 * File generated by Atek tsgen
 * env=${env}
 * DO NOT MODIFY
 */

`

export function generate (dts: ParsedDTS, schema: object, exportMap: ExportMap, opts?: GenerateOpts) {
  if (opts?.env) {
    if (opts.env !== EnvEnum.DENO_USERLAND && opts.env !== EnvEnum.NODE_USERLAND && opts.env !== EnvEnum.HOST) {
      throw new Error(`The environment must be "deno-userland", "node-userland", or "host". "${opts.env}" is not valid.`)
    }
  }

  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ScriptTarget.Latest
    },
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      useTrailingCommas: true,
      quoteKind: QuoteKind.Single,
      insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
    }
  });

  const name = dts.metadata.id.split('/')[1]

  if (dts.metadata.type === 'api') {
    const clientFile = project.createSourceFile(`${name}.ts`, PRELUDE(opts.env))
    generateApiClient(clientFile, dts, schema, exportMap, opts)
    clientFile.saveSync()
    const serverFile = project.createSourceFile(`${name}.server.ts`, PRELUDE(opts.env))
    generateApiServer(serverFile, dts, schema, exportMap, opts)
    serverFile.saveSync()
    return {
      [`${name}.ts`]: project.getFileSystem().readFileSync(`${name}.ts`),
      [`${name}.server.ts`]: project.getFileSystem().readFileSync(`${name}.server.ts`)
    }
  }
  if (dts.metadata.type === 'adb-record') {
    const recordFile = project.createSourceFile(`${name}.ts`, PRELUDE(opts.env))
    generateRecordInterface(recordFile, dts, schema, exportMap, opts)
    recordFile.saveSync()
    return {
      [`${name}.ts`]: project.getFileSystem().readFileSync(`${name}.ts`)
    }
  }
  throw new Error(`Unknown schema type: ${dts.metadata.type}`)
}

function generateApiClient (clientFile: SourceFile, dts: ParsedDTS, schema: object, exportMap: ExportMap, opts: GenerateOpts) {
  const env = opts?.env || EnvEnum.DENO_USERLAND
  const apiIface = dts.ast.getChildrenOfKind(SyntaxKind.InterfaceDeclaration).find(iface => iface.getDefaultKeyword())

  if (env === EnvEnum.DENO_USERLAND) {
    // import { AtekRpcClient } from '...'
    clientFile.addImportDeclaration({
      moduleSpecifier: DENO_RPC_IMPORT,
      namedImports: [{ name: 'AtekRpcClient' }]
    })
  } else if (env === EnvEnum.NODE_USERLAND) {
    // import { URL } from 'url'
    clientFile.addImportDeclaration({
      moduleSpecifier: 'url',
      namedImports: [{ name: 'URL' }]
    })
    // import { AtekRpcClient } from '...'
    clientFile.addImportDeclaration({
      moduleSpecifier: NODE_RPC_IMPORT,
      namedImports: [{ name: 'AtekRpcClient' }]
    })
  } else if (env === EnvEnum.HOST) {
    // import { URL } from 'url'
    clientFile.addImportDeclaration({
      moduleSpecifier: 'url',
      namedImports: [{ name: 'URL' }]
    })
    // import { ApiBrokerClient } from '...'
    clientFile.addImportDeclaration({
      moduleSpecifier: HOST_APIBROKER_IMPORT,
      namedImports: [{ name: 'ApiBrokerClient' }]
    })
  }

  // export const ID = '...'
  clientFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{
      name: 'ID',
      initializer: JSON.stringify(dts.metadata.id)
    }]
  }).setIsExported(true)

  // export const REVISION = '...'
  clientFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{
      name: 'REVISION',
      initializer: dts.metadata.revision ? dts.metadata.revision : 'undefined'
    }]
  }).setIsExported(true)

  // const SCHEMAS = {...}
  clientFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{
      name: 'SCHEMAS',
      initializer: JSON.stringify(schema)
    }]
  })

  // const EXPORT_MAP = {...}
  clientFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{
      name: 'EXPORT_MAP',
      initializer: JSON.stringify(exportMap)
    }]
  })

  // export default class FooClient extends AtekRpcClient {
  const clientClassName = `${toSafeString(apiIface.getName() || dts.metadata.title || dts.metadata.id || 'Api')}Client`
  const clientClass = clientFile.addClass({name: clientClassName})
  clientClass.setIsDefaultExport(true)
  if (env === EnvEnum.DENO_USERLAND || env === EnvEnum.NODE_USERLAND) {
    clientClass.setExtends('AtekRpcClient')
  } else if (env === EnvEnum.HOST) {
    clientClass.setExtends('ApiBrokerClient')
  }

  // constructor () {
  //   super("api/id", SCHEMAS, EXPORT_MAP)
  // }
  const ctor = clientClass.addConstructor()
  ctor.setBodyText(`super(${JSON.stringify(dts.metadata.id)}, SCHEMAS, EXPORT_MAP)`)

  // methodName (param1: type1, param2: type2): Promise<returnType> {
  //   return this._rpc("methodName", [param1, param2]) 
  // }
  for (const ifaceMethod of apiIface.getMethods()) {
    const classMethod = clientClass.addMethod({name: ifaceMethod.getName()})

    const paramNames = []
    for (const param of ifaceMethod.getParameters()) {
      paramNames.push(param.getName())
      classMethod.addParameter(param.getStructure())
    }

    if (ifaceMethod.getName() === 'subscribe') {
      classMethod.setReturnType(`${Object.keys(exportMap.events).join(' | ')}`)
      classMethod.setBodyText(`return this._subscribe([${paramNames.join(', ')}])`)
    } else  {
      classMethod.setReturnType(`Promise<${removeImport(removeGenerics(ifaceMethod.getReturnType().getText()))}>`)
      classMethod.setBodyText(`return this._rpc(${JSON.stringify(ifaceMethod.getName())}, [${paramNames.join(', ')}])`)
    }
  }

  for (const emitterName in exportMap.events) {
    const emitterSrcIface = dts.ast.getChildrenOfKind(SyntaxKind.InterfaceDeclaration).find(iface => iface.getName() === emitterName)

    // export interface FooEmitter {
    const emitterIface = clientFile.addInterface({name: emitterName})
    emitterIface.setIsExported(true)

    // on (name: 'eventname', handler: (evt: {param1: type1, param2: type2...}) => void): void
    for (const eventName in exportMap.events[emitterName]) {
      const ifaceMethod = emitterSrcIface.getMethods().find(m => removeQuotes(m.getParameters()[0].getType().getText()) === eventName)
      if (!ifaceMethod) throw new Error(`Failed to find emitter interface signature for ${eventName}`)

      const emitterMethod = emitterIface.addMethod({name: 'on', returnType: 'void'})
      emitterMethod.addParameter({
        name: 'name',
        type: `"${eventName}"`
      })
      emitterMethod.addParameter({
        name: 'handler',
        type: `(evt: ${removeImport(ifaceMethod.getParameters()[1].getType().getText())}) => void`
      })
    }
  }

  // copy any data-structure interfaces and types other than the main API and emitter definitions
  dts.ast.forEachChild(node => {
    switch (node.getKind()) {
      case SyntaxKind.InterfaceDeclaration: {
        const iface = node.asKind(SyntaxKind.InterfaceDeclaration)
        const name = iface.getName()
        if (name === apiIface.getName() || name in exportMap.events) {
          return
        }
        clientFile.addInterface(transformIfaceTypes(env, iface.getStructure()))
        break
      }
      case SyntaxKind.TypeAliasDeclaration:
        clientFile.addTypeAlias(node.asKind(SyntaxKind.TypeAliasDeclaration).getStructure())
        break
      case SyntaxKind.EnumDeclaration:
        clientFile.addEnum(node.asKind(SyntaxKind.EnumDeclaration).getStructure())
        break
    }
  })
}

function generateApiServer (serverFile: SourceFile, dts: ParsedDTS,  schema: object, exportMap: ExportMap, opts: GenerateOpts) {
  const env = opts?.env || EnvEnum.DENO_USERLAND
  const apiIface = dts.ast.getChildrenOfKind(SyntaxKind.InterfaceDeclaration).find(iface => iface.getDefaultKeyword())

  if (env === EnvEnum.DENO_USERLAND) {
    // import { AtekRpcServer, AtekRpcServerHandlers } from '...'
    serverFile.addImportDeclaration({
      moduleSpecifier: DENO_RPC_IMPORT,
      namedImports: [{ name: 'AtekRpcServer' }, { name: 'AtekRpcServerHandlers' }]
    })
  } else if (env === EnvEnum.NODE_USERLAND) {
    // import { URL } from 'url'
    serverFile.addImportDeclaration({
      moduleSpecifier: 'url',
      namedImports: [{ name: 'URL' }]
    })
    // import { AtekRpcServer, AtekRpcServerHandlers } from '...'
    serverFile.addImportDeclaration({
      moduleSpecifier: NODE_RPC_IMPORT,
      namedImports: [{ name: 'AtekRpcServer' }, { name: 'AtekRpcServerHandlers' }]
    })
  } else if (env === EnvEnum.HOST) {
    // import { URL } from 'url'
    serverFile.addImportDeclaration({
      moduleSpecifier: 'url',
      namedImports: [{ name: 'URL' }]
    })
    // import { ApiBrokerServer, ApiBrokerServerHandlers } from '...'
    serverFile.addImportDeclaration({
      moduleSpecifier: HOST_APIBROKER_IMPORT,
      namedImports: [{ name: 'ApiBrokerServer' }, { name: 'ApiBrokerServerHandlers' }]
    })
  }

  // export const ID = '...'
  serverFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{
      name: 'ID',
      initializer: JSON.stringify(dts.metadata.id)
    }]
  }).setIsExported(true)

  // export const REVISION = '...'
  serverFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{
      name: 'REVISION',
      initializer: dts.metadata.revision ? dts.metadata.revision : 'undefined'
    }]
  }).setIsExported(true)

  // const SCHEMAS = {...}
  serverFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{
      name: 'SCHEMAS',
      initializer: JSON.stringify(schema)
    }]
  })
  // const EXPORT_MAP = {...}
  serverFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{
      name: 'EXPORT_MAP',
      initializer: JSON.stringify(exportMap)
    }]
  })

  // export default class FooServer extends AteRpcServer {
  const serverClassName = `${toSafeString(apiIface.getName() || dts.metadata.title || dts.metadata.id || 'Api')}Server`
  const serverClass = serverFile.addClass({name: serverClassName})
  if (env === EnvEnum.DENO_USERLAND || env === EnvEnum.NODE_USERLAND) {
    serverClass.setExtends('AtekRpcServer')
  } else if (env === EnvEnum.HOST) {
    serverClass.setExtends('ApiBrokerServer')
  }
  serverClass.setIsDefaultExport(true)

  // constructor (handlers) {
  //   super(SCHEMA, EXPORT_MAP, handlers: AtekRpcServerHandlers) 
  // }
  const ctor = serverClass.addConstructor()
  const param = ctor.addParameter({name: 'handlers'})
  if (env === EnvEnum.DENO_USERLAND || env === EnvEnum.NODE_USERLAND) {
    param.setType('AtekRpcServerHandlers')
  } else if (env === EnvEnum.HOST) {
    param.setType('ApiBrokerServerHandlers')
  }
  ctor.setBodyText(`super(SCHEMAS, EXPORT_MAP, handlers)`)
}

function generateRecordInterface (recordFile: SourceFile, dts: ParsedDTS, schema: object, exportMap: ExportMap, opts: GenerateOpts) {
  const env = opts?.env || EnvEnum.DENO_USERLAND
  if (env === EnvEnum.DENO_USERLAND) {
    // import { AtekDbRecordClient, AtekDbApiClient } from '...'
    recordFile.addImportDeclaration({
      moduleSpecifier: DENO_RPC_IMPORT,
      namedImports: [{ name: 'AtekDbRecordClient' }, { name: 'AtekDbApiClient' }]
    })
  } else if (env === EnvEnum.NODE_USERLAND) {
    // import { URL } from 'url'
    recordFile.addImportDeclaration({
      moduleSpecifier: 'url',
      namedImports: [{ name: 'URL' }]
    })
    // import { AtekDbRecordClient, AtekDbApiClient } from '...'
    recordFile.addImportDeclaration({
      moduleSpecifier: NODE_RPC_IMPORT,
      namedImports: [{ name: 'AtekDbRecordClient' }, { name: 'AtekDbApiClient' }]
    })
  } else if (env === EnvEnum.HOST) {
    // import { URL } from 'url'
    recordFile.addImportDeclaration({
      moduleSpecifier: 'url',
      namedImports: [{ name: 'URL' }]
    })
    // import { AtekDbRecordClient, AtekDbApiClient } from '...'
    recordFile.addImportDeclaration({
      moduleSpecifier: HOST_APIBROKER_IMPORT,
      namedImports: [{ name: 'AtekDbRecordClient' }, { name: 'AtekDbApiClient' }]
    })
  }

  // export const ID = '...'
  recordFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{
      name: 'ID',
      initializer: JSON.stringify(dts.metadata.id)
    }]
  }).setIsExported(true)

  // export const REVISION = '...'
  recordFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{
      name: 'REVISION',
      initializer: dts.metadata.revision ? dts.metadata.revision : 'undefined'
    }]
  }).setIsExported(true)

  // export const JSON_SCHEMA = {...}
  recordFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{
      name: 'JSON_SCHEMA',
      initializer: JSON.stringify(schema)
    }]
  }).setIsExported(true)

  // export const TEMPLATES = {...}
  recordFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{
      name: 'TEMPLATES',
      initializer: JSON.stringify(dts.metadata.templates || {})
    }]
  }).setIsExported(true)

  // copy all interfaces and types
  dts.ast.forEachChild(node => {
    switch (node.getKind()) {
      case SyntaxKind.InterfaceDeclaration: {
        recordFile.addInterface(transformIfaceTypes(env, node.asKind(SyntaxKind.InterfaceDeclaration).getStructure()))
        break
      }
      case SyntaxKind.TypeAliasDeclaration:
        recordFile.addTypeAlias(node.asKind(SyntaxKind.TypeAliasDeclaration).getStructure())
        break
      case SyntaxKind.EnumDeclaration:
        recordFile.addEnum(node.asKind(SyntaxKind.EnumDeclaration).getStructure())
        break
    }
  })

  // export class RecordTypeTable extends AtekDbRecordClient<RecordType> {}
  const mainIface = recordFile.getInterface(iface => iface.isDefaultExport())
  const tableCls = recordFile.addClass({
    name: `${mainIface.getName()}Table`,
    extends: `AtekDbRecordClient<${mainIface.getName()}>`
  })
  tableCls.setIsExported(true)

  // constructor (api: AtekDbApiClient, dbId: string) {
  //    super(api, dbId, ID, REVISION, TEMPLATES, JSON_SCHEMA)
  // }
  tableCls.addConstructor({
    parameters: [{name: 'api', type: 'AtekDbApiClient'}, {name: 'dbId', type: 'string', hasQuestionToken: true}]
  }).setBodyText(`super(api, dbId, ID, REVISION, TEMPLATES, JSON_SCHEMA)`)
}

function transformIfaceTypes (env: EnvEnum, structure: InterfaceDeclarationStructure): InterfaceDeclarationStructure {
  // We use some types like 'Date' or 'Uint8Array' in our d.ts to indicate constraints on data
  // The json-schemas already transform these to primitive types
  // We need to do the same in the generated code
  for (const property of structure.properties) {
    property.type = (property.type as string)
      .replace(/Date/g, 'string')
    if (env === EnvEnum.HOST || env === EnvEnum.NODE_USERLAND) {
      property.type = (property.type as string)
        .replace(/Uint8Array/g, 'Buffer')
    }
  }
  return structure
}