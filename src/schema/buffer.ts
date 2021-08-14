import { BaseType, Definition, SubTypeFormatter, Context, ReferenceType, SubNodeParser } from "ts-json-schema-generator";
import ts from 'typescript'

const NAMES = [
  'Uint8Array',
  'Int8Array',
  'Uint16Array',
  'Int16Array',
  'Uint32Array',
  'Int32Array',
]

class BufferType extends BaseType {
  public getId (): string {
    return 'buffer'
  }
}

export class BufferParser implements SubNodeParser {
  supportsNode (node: ts.Node): boolean {
    return node.kind === ts.SyntaxKind.TypeReference && NAMES.includes(node.getText());
  }
  createType (node: ts.Node, context: Context, reference?: ReferenceType): BaseType | undefined {
    return new BufferType()
  }
}

export class BufferFormatter implements SubTypeFormatter {
  public supportsType (type: BaseType): boolean {
    return type instanceof BufferType;
  }
  
  public getDefinition (type: BufferType): Definition {
    // Return a custom schema for the function property.
    return {
      type: 'string',
      contentEncoding: 'base64'
    };
  }
  
  public getChildren (type: BufferType): BaseType[] {
    return []; // no children
  }
}