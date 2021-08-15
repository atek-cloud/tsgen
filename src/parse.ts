import { Project, ScriptTarget, IndentationText, NewLineKind, QuoteKind, SyntaxKind, InMemoryFileSystemHost } from 'ts-morph'
import YAML from 'js-yaml'
import tsj from 'ts-json-schema-generator'
import { join } from 'path'
import { ParsedDTS } from './types.js'
import * as schemaBuffer from './schema/buffer.js'
import * as hackTransformApiForSchemaGen from './hack-transform-api-for-schema-gen.js'
import { resolveDependencies } from './util.js'

export async function parse (schemaText: string, opts?: {baseUrl?: string}): Promise<ParsedDTS> {
  const {project, ast} = genAst(schemaText)

  if (opts.baseUrl) {
    // resolve imports()
    // TODO this semi works. Still todo:
    // - Handle the many possible import sources correctly, including https urls
    // - Correctly generate output when imported definitions are used (requires some kind of bundling)
    await resolveDependencies(project, ast, opts.baseUrl)
  }

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
    // create a new temporary AST for the schema generation
    project = copyProject(project)
    hackTransformApiForSchemaGen.transformAST(project.getSourceFile('definition.d.ts'), exportMap)
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

  const ast = project.createSourceFile(`/definition.d.ts`, text)
  ast.saveSync()
  return {project, ast}
}

function copyProject (project: Project): Project {
  const newProject = new Project({
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
  recursiveCopy('/', project.getFileSystem(), newProject)
  return newProject
}

function recursiveCopy (path: string, src: InMemoryFileSystemHost, dst: Project) {
  for (const filename of src.readDirSync(path)) {
    const filepath = join(path, filename)
    if (src.directoryExistsSync(filepath)) {
      dst.createDirectory(filepath).saveSync()
      recursiveCopy(filepath, src, dst)
    } else {
      dst.createSourceFile(filepath, src.readFileSync(filepath)).saveSync()
    }
  }
}