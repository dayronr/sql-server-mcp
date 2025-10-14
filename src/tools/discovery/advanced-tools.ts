// src/tools/discovery/advanced-tools.ts

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { QueryExecutor } from '../../database/query-executor.js';

// Get Dependencies
export const GetDependenciesSchema = z.object({
  schema: z.string().default('dbo').describe('Schema name'),
  name: z.string().describe('Object name (SP, view, function)'),
  includeCallers: z.boolean().default(true).describe('Include objects that call this object'),
  includeReferences: z.boolean().default(true).describe('Include objects this object references')
});

export async function getDependencies(
  queryExecutor: QueryExecutor,
  args: z.infer<typeof GetDependenciesSchema>
) {
  const result: any = {
    object: `${args.schema}.${args.name}`,
    dependencies: {}
  };

  if (args.includeReferences) {
    // Objects this SP references
    const referencesQuery = `
      SELECT DISTINCT
        OBJECT_SCHEMA_NAME(referenced_id) as referenced_schema,
        OBJECT_NAME(referenced_id) as referenced_name,
        o.type_desc as object_type
      FROM sys.sql_expression_dependencies d
      INNER JOIN sys.objects o ON d.referenced_id = o.object_id
      WHERE referencing_id = OBJECT_ID(@fullName)
      ORDER BY object_type, referenced_schema, referenced_name
    `;

    result.dependencies.references = await queryExecutor.executeReadOnly(
      referencesQuery,
      { fullName: `${args.schema}.${args.name}` }
    );
  }

  if (args.includeCallers) {
    // Objects that reference this SP
    const callersQuery = `
      SELECT DISTINCT
        OBJECT_SCHEMA_NAME(referencing_id) as caller_schema,
        OBJECT_NAME(referencing_id) as caller_name,
        o.type_desc as object_type
      FROM sys.sql_expression_dependencies d
      INNER JOIN sys.objects o ON d.referencing_id = o.object_id
      WHERE referenced_id = OBJECT_ID(@fullName)
      ORDER BY object_type, caller_schema, caller_name
    `;

    result.dependencies.callers = await queryExecutor.executeReadOnly(
      callersQuery,
      { fullName: `${args.schema}.${args.name}` }
    );
  }

  return result;
}

// Analyze SP Performance
export const AnalyzeSpPerformanceSchema = z.object({
  schema: z.string().default('dbo').describe('Schema name'),
  name: z.string().describe('Stored procedure name')
});

export async function analyzeSpPerformance(
  queryExecutor: QueryExecutor,
  args: z.infer<typeof AnalyzeSpPerformanceSchema>
) {
  const result: any = {
    procedure: `${args.schema}.${args.name}`
  };

  // Get execution statistics from plan cache
  const statsQuery = `
    SELECT
      qs.execution_count,
      qs.total_worker_time / 1000 as total_cpu_ms,
      qs.total_worker_time / qs.execution_count / 1000 as avg_cpu_ms,
      qs.total_elapsed_time / 1000 as total_duration_ms,
      qs.total_elapsed_time / qs.execution_count / 1000 as avg_duration_ms,
      qs.total_logical_reads,
      qs.total_logical_reads / qs.execution_count as avg_logical_reads,
      qs.last_execution_time,
      qs.creation_time as plan_creation_time
    FROM sys.dm_exec_procedure_stats qs
    CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
    WHERE OBJECT_NAME(qs.object_id, qs.database_id) = @name
      AND OBJECT_SCHEMA_NAME(qs.object_id, qs.database_id) = @schema
  `;

  const stats = await queryExecutor.executeReadOnly(statsQuery, {
    schema: args.schema,
    name: args.name
  });

  result.executionStats = stats.length > 0 ? stats[0] : null;

  return result;
}

export const advancedTools = [
  {
    name: 'get_dependencies',
    description: 'Analyze dependencies for a database object. Shows what it references and what references it.',
    inputSchema: zodToJsonSchema(GetDependenciesSchema)
  },
  {
    name: 'analyze_sp_performance',
    description: 'Analyze stored procedure performance including execution count, CPU time, duration, and logical reads from plan cache.',
    inputSchema: zodToJsonSchema(AnalyzeSpPerformanceSchema)
  }
];
