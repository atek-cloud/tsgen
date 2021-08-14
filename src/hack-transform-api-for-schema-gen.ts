import { SyntaxKind, SourceFile, InterfaceDeclaration } from 'ts-morph'
import { toSafeString, removeImport, removeGenerics, removeQuotes } from './util.js'
import { ExportMap } from './types.js'

/** 
 * HACK
 * Modify the ast so that functions inside of interfaces will become data-interfaces that ts-json-schema-generator understands
 * Eg:
 * 
 * interface Hypercore {
 *   get (key: Uint8Array, index: number, options?: GetOptions): Promise<Uint8Array>
 * }
 * 
 * Becomes:
 * 
 * interface api_Hypercore_Get {
 *   params: [key: Uint8Array, index: number, options?: GetOptions]
 *   returns: Promise<Uint8Array>
 * }
 * 
 * Which will be transformed into:
 * {
 *   "definitions": {
 *     "api_Hypercore_Get": {
 *       "type": "object",
 *       "properties": {
 *         "params": {"type": "array", "items": [{"type": "string", "contentEncoding": "base64"}, {"type": "number"}, {"$ref": "#/definitions/GetOptions"}]},
 *         "returns": {"type": "string", "contentEncoding": "base64"}
 *       }
 *     }
 *   }
 * }
 * 
 * Events are handled specially:
 * 
 * interface Subscription {
 *   on (name: 'append', evt: {key: Uint8Array, length: number, byteLength: number})
 *   on (name: 'close', evt: {key: Uint8Array})
 * }
 * 
 * Becomes:
 * 
 * interface evt_Subscription_Append {
 *   key: Uint8Array
 *   length: number
 *   byteLength: number
 * }
 * interface evt_Subscription_Close {
 *   key: Uint8Array
 * }
 */



export function transformAST (ast: SourceFile, exportMap: ExportMap) {
  ast.getChildrenOfKind(SyntaxKind.InterfaceDeclaration).forEach(iface => transformIface(ast, iface, exportMap))
}

function transformIface (ast: SourceFile, iface: InterfaceDeclaration, exportMap: ExportMap) {
  const fns = iface.getMethods()
  for (const fn of fns) {
    if (fn.getName() === 'emit') {

      // events
      // =

      const eventName = removeQuotes(fn.getParameters()[0].getType().getText())
      const ifaceName = `evt_${iface.getName()}_${toSafeString(eventName)}`
      exportMap.events[iface.getName()] = exportMap.events[iface.getName()] || {}
      exportMap.events[iface.getName()][eventName] = `#/definitions/${ifaceName}`

      // interface evt_Interface_EventName {}
      const evtIface = ast.addInterface({name: ifaceName})

      // {param1: type1, param2: type2, ...}
      const param2Type = fn.getParameters()[1].getType()
      for (const prop of param2Type.getProperties()) {
        let type = prop.getTypeAtLocation(fn).getText()
        type = removeGenerics(type) // strip the generics wrappers, specifically Promise<>
        type = removeImport(type)  // strip the `import("/definition").`
        evtIface.addProperty({
          name: prop.getName(),
          type
        })
      }
    } else {

      // functions
      // =

      const ifaceName = `api_${iface.getName()}_${toSafeString(fn.getName())}`
      exportMap.methods[`${fn.getName()}`] = `#/definitions/${ifaceName}`

      // interface api_Interface_Method {}
      const fnIface = ast.addInterface({
        name: ifaceName
      })

      // params: [type, type, type...]
      const paramTexts = fn.getParameters().map(param => {
        let text = param.getType().getText()
        text = removeImport(text)  // strip the `import("/definition").`
        if (param.isOptional()) text += '?'
        return text
      })
      fnIface.addProperty({
        name: 'params',
        type: `[${paramTexts.join(', ')}]`
      })

      // returns: type
      const returnsText = (() => {
        let text = fn.getReturnType().getText()
        text = removeGenerics(text) // strip the generics wrappers, specifically Promise<>
        text = removeImport(text)  // strip the `import("/definition").`
        return text
      })()
      fnIface.addProperty({
        name: 'returns',
        type: returnsText
      })
    }
  }
}
