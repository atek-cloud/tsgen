import { BaseType, Definition, SubTypeFormatter, Context, ReferenceType, SubNodeParser } from "ts-json-schema-generator";
import ts from 'typescript'

class UrlType extends BaseType {
  public getId (): string {
    return 'url'
  }
}

export class UrlParser implements SubNodeParser {
  supportsNode (node: ts.Node): boolean {
    return node.kind === ts.SyntaxKind.TypeReference && node.getText() === 'URL';
  }
  createType (node: ts.Node, context: Context, reference?: ReferenceType): BaseType | undefined {
    return new UrlType()
  }
}

export class UrlFormatter implements SubTypeFormatter {
  public supportsType (type: BaseType): boolean {
    return type instanceof UrlType;
  }
  
  public getDefinition (type: UrlType): Definition {
    // Return a custom schema for the function property.
    return {
      type: 'string',
      format: 'uri'
    };
  }
  
  public getChildren (type: UrlType): BaseType[] {
    return []; // no children
  }
}