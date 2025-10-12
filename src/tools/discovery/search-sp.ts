// src/tools/discovery/search-sp.ts

import { z } from 'zod';
import { QueryExecutor } from '../../database/query-executor.js';

export const SearchSpSchema = z.object({
  pattern: z.string().describe('Search pattern to find in stored procedure names or bodies'),
  schema: z.string().optional().describe('Limit search to specific schema'),
  searchBody: z.boolean().default(true).describe('Search in procedure body (true) or just names (false)')
});

export async function searchStoredProcedures(
  queryExecutor: QueryExecutor,
  args: z.infer<typeof SearchSpSchema>
) {
  const { pattern, schema, searchBody } = args;

  let query: string;
  const params: Record<string, any> = { pattern: `%${pattern}%` };

  if (searchBody) {
    query = `
      SELECT
        OBJECT_SCHEMA_NAME(object_id) as schema_name,
        OBJECT_NAME(object_id) as name,
        OBJECT_DEFINITION(object_id) as definition,
        (SELECT modify_date FROM sys.objects WHERE object_id = p.object_id) as last_modified
      FROM sys.procedures p
      WHERE OBJECT_DEFINITION(object_id) LIKE @pattern
        ${schema ? 'AND OBJECT_SCHEMA_NAME(object_id) = @schema' : ''}
      ORDER BY schema_name, name
    `;

    if (schema) params.schema = schema;
  } else {
    query = `
      SELECT
        s.name as schema_name,
        p.name as name,
        p.modify_date as last_modified
      FROM sys.procedures p
      INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
      WHERE p.name LIKE @pattern
        ${schema ? 'AND s.name = @schema' : ''}
      ORDER BY s.name, p.name
    `;

    if (schema) params.schema = schema;
  }

  const results = await queryExecutor.executeReadOnly(query, params);

  if (searchBody) {
    // Extract matching lines for each result
    return results.map((r: any) => {
      const lines = r.definition.split('\n');
      const matchingLines = lines
        .map((line: string, index: number) => ({ line, lineNumber: index + 1 }))
        .filter(({ line }: { line: string }) => line.toLowerCase().includes(pattern.toLowerCase()))
        .slice(0, 5); // Limit to first 5 matches per SP

      return {
        schema: r.schema_name,
        name: r.name,
        lastModified: r.last_modified,
        matches: matchingLines.map((m: any) => ({
          lineNumber: m.lineNumber,
          content: m.line.trim()
        }))
      };
    });
  }

  return results;
}

export const searchStoredProceduresTool = {
  name: 'search_stored_procedures',
  description: 'Search for stored procedures by name or content. Can search through procedure bodies to find specific SQL patterns, table references, or logic.',
  inputSchema: SearchSpSchema
};
