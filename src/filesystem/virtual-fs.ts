// src/filesystem/virtual-fs.ts

import { QueryExecutor } from '../database/query-executor.js';
import { VirtualPath } from '../types/index.js';
import { parseVirtualUri } from './uri-parser.js';
import { FileCache } from './file-cache.js';

export class VirtualFileSystem {
  private cache: FileCache;

  constructor(
    private queryExecutor: QueryExecutor,
    private virtualRoot: string,
    enableCache: boolean = true,
    cacheTimeout: number = 300000 // 5 minutes
  ) {
    this.cache = new FileCache(enableCache, cacheTimeout);
  }

  async readFile(uri: string): Promise<string> {
    const path = parseVirtualUri(uri, this.virtualRoot);

    // Check cache first
    const cached = this.cache.get(uri);
    if (cached) return cached;

    let definition: string;

    switch (path.type) {
      case 'stored-procedure':
        definition = await this.getStoredProcedureDefinition(path.schema, path.name);
        break;
      case 'view':
        definition = await this.getViewDefinition(path.schema, path.name);
        break;
      case 'function':
        definition = await this.getFunctionDefinition(path.schema, path.name);
        break;
      default:
        throw new Error(`Unsupported file type: ${path.type}`);
    }

    this.cache.set(uri, definition);
    return definition;
  }

  async listDirectory(uri: string): Promise<Array<{ name: string; type: 'file' | 'directory'; modified?: Date }>> {
    const path = parseVirtualUri(uri, this.virtualRoot);

    if (path.type === 'stored-procedure' && !path.name) {
      // List all stored procedures in schema
      return this.listStoredProcedures(path.schema);
    }

    // Add more directory listing logic as needed
    throw new Error('Directory listing not implemented for this path');
  }

  async search(pattern: string, directory: string): Promise<Array<{ uri: string; matches: string[] }>> {
    const path = parseVirtualUri(directory, this.virtualRoot);

    if (path.type === 'stored-procedure') {
      return this.searchStoredProcedures(pattern, path.schema);
    }

    return [];
  }

  private async getStoredProcedureDefinition(schema: string, name: string): Promise<string> {
    const query = `
      SELECT OBJECT_DEFINITION(OBJECT_ID(@fullName)) AS definition
    `;

    const result = await this.queryExecutor.executeScalar<string>(query, {
      fullName: `${schema}.${name}`
    });

    if (!result) {
      throw new Error(`Stored procedure not found: ${schema}.${name}`);
    }

    return result;
  }

  private async getViewDefinition(schema: string, name: string): Promise<string> {
    const query = `
      SELECT OBJECT_DEFINITION(OBJECT_ID(@fullName)) AS definition
    `;

    return this.queryExecutor.executeScalar<string>(query, {
      fullName: `${schema}.${name}`
    });
  }

  private async getFunctionDefinition(schema: string, name: string): Promise<string> {
    const query = `
      SELECT OBJECT_DEFINITION(OBJECT_ID(@fullName)) AS definition
    `;

    return this.queryExecutor.executeScalar<string>(query, {
      fullName: `${schema}.${name}`
    });
  }

  private async listStoredProcedures(schema: string): Promise<Array<{ name: string; type: 'file'; modified: Date }>> {
    const query = `
      SELECT
        p.name,
        p.modify_date as modified
      FROM sys.procedures p
      INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
      WHERE s.name = @schema
      ORDER BY p.name
    `;

    const results = await this.queryExecutor.executeReadOnly<{ name: string; modified: Date }>(query, { schema });

    return results.map(r => ({
      name: `${r.name}.sql`,
      type: 'file' as const,
      modified: r.modified
    }));
  }

  private async searchStoredProcedures(pattern: string, schema?: string): Promise<Array<{ uri: string; matches: string[] }>> {
    const query = `
      SELECT
        OBJECT_SCHEMA_NAME(object_id) as schema_name,
        OBJECT_NAME(object_id) as name,
        OBJECT_DEFINITION(object_id) as definition
      FROM sys.procedures
      WHERE OBJECT_DEFINITION(object_id) LIKE @pattern
        ${schema ? 'AND OBJECT_SCHEMA_NAME(object_id) = @schema' : ''}
    `;

    const results = await this.queryExecutor.executeReadOnly<{
      schema_name: string;
      name: string;
      definition: string;
    }>(query, {
      pattern: `%${pattern}%`,
      ...(schema && { schema })
    });

    return results.map(r => {
      const lines = r.definition.split('\n');
      const matches = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => line.toLowerCase().includes(pattern.toLowerCase()))
        .map(({ line, index }) => `Line ${index + 1}: ${line.trim()}`);

      return {
        uri: `${this.virtualRoot}/stored_procedures/${r.schema_name}/${r.name}.sql`,
        matches
      };
    });
  }
}
