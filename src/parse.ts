import { Project, ScriptTarget, IndentationText, NewLineKind, QuoteKind, SyntaxKind } from 'ts-morph'
import YAML from 'js-yaml'
import tsj from 'ts-json-schema-generator'
import { ParsedDTS } from './types.js'
import * as schemaBuffer from './schema/buffer.js'
import * as hackTransformApiForSchemaGen from './hack-transform-api-for-schema-gen.js'

export function parse (schemaText: string): ParsedDTS {
  const {project, ast} = genAst(schemaText)

  const metadata = {}
  const comment = ast.getStatementByKind(SyntaxKind.MultiLineCommentTrivia)
  if (comment) {
    const frontmatter = comment.getText().slice(2, -2).trim()
    try {
      Object.assign(metadata, YAML.load(frontmatter))
    } catch (e) {
      console.error('Failed to parse frontmatter', e)
    }
  }

  let primaryInterfaceName
  const interfaces = ast.getChildrenOfKind(SyntaxKind.InterfaceDeclaration)
  for (const iface of interfaces) {
    if (iface.getDefaultKeyword()) {
      primaryInterfaceName = iface.getName()
    }
  }
  return {
    metadata,
    primaryInterfaceName,
    text: schemaText,
    project,
    ast
  }
}

export function generateInterfaceSchemas (dts: ParsedDTS) {
  let {project} = dts
  const exportMap = {methods: {}, events: {}}

  if (dts.metadata.type === 'api') {
    const newDts = genAst(dts.text)
    hackTransformApiForSchemaGen.transformAST(newDts.ast, exportMap)
    project = newDts.project
  }

  const config = {
    type: dts.primaryInterfaceName,
    additionalProperties: true
  }
  const program = project.getProgram().compilerObject
  const parser = tsj.createParser(program, config, (prs) => {
    prs.addNodeParser(new schemaBuffer.BufferParser())
  })
  const formatter = tsj.createFormatter(config, (fmt, circularReferenceTypeFormatter) => {
    fmt.addTypeFormatter(new schemaBuffer.BufferFormatter())
  })
  const gen = new tsj.SchemaGenerator(program, parser, formatter, config)
  const schema = gen.createSchema()
  if (dts.metadata.type === 'adb-record' && dts.primaryInterfaceName) {
    schema.$ref = `#/definitions/${dts.primaryInterfaceName}`
  }
  return {schema, exportMap}
}

function genAst (text) {
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
  })

  const ast = project.createSourceFile(`definition.d.ts`, text)
  return {project, ast}
}
