import { Project, SourceFile } from 'ts-morph'

export interface ParsedDTS {
  metadata: {[key: string]: string}
  primaryInterfaceName?: string
  text: string
  project: Project
  ast: SourceFile
}

export interface GenerateOpts {
  env?: EnvEnum
}

export enum EnvEnum {
  NODE = 'node',
  HOST = 'host'
}

export interface ExportMap {
  methods: {
    [methodName: string]: string
  }
  events: {
    [iface: string]: {
      [eventName: string]: string
    }
  }
}