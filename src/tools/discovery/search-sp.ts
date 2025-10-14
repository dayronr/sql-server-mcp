// src/tools/discovery/search-sp.ts

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { QueryExecutor } from '../../database/query-executor.js';

export const SearchSpSchema = z.object({
  pattern: z.string().describe('Search pattern to find in stored procedure names or bodies'),
  schema: z.string().optional().describe('Limit search to specific schema'),
  searchBody: z.boolean().default(true).describe('Search in procedure body (true) or just names (false)'),
  limit: z.number().optional().default(50).describe('Maximum number of results to return (default: 50, max: 500)'),
  maxMatchesPerSp: z.number().optional().default(5).describe('Maximum matching lines to show per stored procedure (default: 5)')
});

export async function searchStoredProcedures(
  queryExecutor: QueryExecutor,
  args: z.infer<typeof SearchSpSchema>
) {
  const { pattern, schema, searchBody, limit = 50, maxMatchesPerSp = 5 } = args;
  const actualLimit = Math.min(limit, 500);

  let query: string;
  const params: Record<string, any> = { pattern: `%${pattern}%` };

  if (searchBody) {
    query = `
      SELECT TOP (@limit)
        OBJECT_SCHEMA_NAME(object_id) as schema_name,
        OBJECT_NAME(object_id) as name,
        OBJECT_DEFINITION(object_id) as definition,
        (SELECT modify_date FROM sys.objects WHERE object_id = p.object_id) as last_modified
      FROM sys.procedures p
      WHERE OBJECT_DEFINITION(object_id) LIKE @pattern
        ${schema ? 'AND OBJECT_SCHEMA_NAME(object_id) = @schema' : ''}
      ORDER BY schema_name, name
    `;

    params.limit = actualLimit;
    if (schema) params.schema = schema;
  } else {
    query = `
      SELECT TOP (@limit)
        s.name as schema_name,
        p.name as name,
        p.modify_date as last_modified
      FROM sys.procedures p
      INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
      WHERE p.name LIKE @pattern
        ${schema ? 'AND s.name = @schema' : ''}
      ORDER BY s.name, p.name
    `;

    params.limit = actualLimit;
    if (schema) params.schema = schema;
  }

  const results = await queryExecutor.executeReadOnly(query, params);

  if (searchBody) {
    // Extract matching lines for each result
    return {
      count: results.length,
      limit: actualLimit,
      results: results.map((r: any) => {
        const lines = r.definition.split('\n');
        const matchingLines = lines
          .map((line: string, index: number) => ({ line, lineNumber: index + 1 }))
          .filter(({ line }: { line: string }) => line.toLowerCase().includes(pattern.toLowerCase()))
          .slice(0, maxMatchesPerSp);

        return {
          schema: r.schema_name,
          name: r.name,
          lastModified: r.last_modified,
          matchCount: lines.filter((line: string) => line.toLowerCase().includes(pattern.toLowerCase())).length,
          matches: matchingLines.map((m: any) => ({
            lineNumber: m.lineNumber,
            content: m.line.trim()
          }))
        };
      })
    };
  }

  return {
    count: results.length,
    limit: actualLimit,
    results
  };
}

export const searchStoredProceduresTool = {
  name: 'search_stored_procedures',
  description: 'Search for stored procedures by name or content. Can search through procedure bodies to find specific SQL patterns, table references, or logic. Returns limited results (default 50, max 500) with matching line numbers.',
  inputSchema: zodToJsonSchema(SearchSpSchema)
};

// List Stored Procedures Schema
export const ListSpSchema = z.object({
  schema: z.string().optional().describe('Limit to specific schema (e.g., dbo). If not specified, lists from all schemas.'),
  limit: z.number().optional().default(100).describe('Maximum number of procedures to return (default: 100, max: 1000)'),
  offset: z.number().optional().default(0).describe('Number of procedures to skip for pagination (default: 0)')
});

export async function listStoredProcedures(
  queryExecutor: QueryExecutor,
  args: z.infer<typeof ListSpSchema>
) {
  const limit = Math.min(args.limit || 100, 1000);
  const offset = args.offset || 0;

  // Get total count first
  const countQuery = `
    SELECT COUNT(*) as total
    FROM sys.procedures p
    INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
    ${args.schema ? 'WHERE s.name = @schema' : ''}
  `;

  const countParams = args.schema ? { schema: args.schema } : {};
  const countResult = await queryExecutor.executeReadOnly(countQuery, countParams);
  const total = countResult[0]?.total || 0;

  // Get paginated results
  const query = `
    SELECT
      s.name as schema_name,
      p.name as name,
      p.create_date,
      p.modify_date as last_modified
    FROM sys.procedures p
    INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
    ${args.schema ? 'WHERE s.name = @schema' : ''}
    ORDER BY s.name, p.name
    OFFSET @offset ROWS
    FETCH NEXT @limit ROWS ONLY
  `;

  const params = {
    ...(args.schema ? { schema: args.schema } : {}),
    offset,
    limit
  };
  const results = await queryExecutor.executeReadOnly(query, params);

  return {
    total,
    count: results.length,
    limit,
    offset,
    hasMore: offset + results.length < total,
    procedures: results
  };
}

export const listStoredProceduresTool = {
  name: 'list_stored_procedures',
  description: 'List stored procedures in the database with pagination. Returns procedure names, schemas, modification dates, and total count. Use limit/offset for pagination. Default returns first 100 procedures.',
  inputSchema: zodToJsonSchema(ListSpSchema)
};
