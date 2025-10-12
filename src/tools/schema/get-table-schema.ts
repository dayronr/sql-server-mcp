// src/tools/schema/get-table-schema.ts

import { z } from 'zod';
import { QueryExecutor } from '../../database/query-executor.js';

export const GetTableSchemaSchema = z.object({
  tableName: z.string().describe('Table name (can include schema prefix like dbo.Users)'),
  includeIndexes: z.boolean().default(true).describe('Include index information'),
  includeForeignKeys: z.boolean().default(true).describe('Include foreign key relationships')
});

export async function getTableSchema(
  queryExecutor: QueryExecutor,
  args: z.infer<typeof GetTableSchemaSchema>
) {
  const { tableName, includeIndexes, includeForeignKeys } = args;

  // Parse schema and table name
  const parts = tableName.split('.');
  const schema = parts.length > 1 ? parts[0] : 'dbo';
  const table = parts.length > 1 ? parts[1] : parts[0];

  // Get columns
  const columnsQuery = `
    SELECT
      c.name as column_name,
      t.name as data_type,
      c.max_length,
      c.precision,
      c.scale,
      c.is_nullable,
      c.is_identity,
      ISNULL(dc.definition, '') as default_value,
      ISNULL(ep.value, '') as description
    FROM sys.columns c
    INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
    INNER JOIN sys.tables tb ON c.object_id = tb.object_id
    INNER JOIN sys.schemas s ON tb.schema_id = s.schema_id
    LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
    LEFT JOIN sys.extended_properties ep ON ep.major_id = c.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description'
    WHERE s.name = @schema AND tb.name = @table
    ORDER BY c.column_id
  `;

  const columns = await queryExecutor.executeReadOnly(columnsQuery, { schema, table });

  const result: any = {
    schema,
    table,
    columns: columns.map((c: any) => ({
      name: c.column_name,
      dataType: c.data_type,
      maxLength: c.max_length,
      precision: c.precision,
      scale: c.scale,
      nullable: c.is_nullable,
      identity: c.is_identity,
      default: c.default_value,
      description: c.description
    }))
  };

  // Get primary key
  const pkQuery = `
    SELECT c.name as column_name
    FROM sys.indexes i
    INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    INNER JOIN sys.tables tb ON i.object_id = tb.object_id
    INNER JOIN sys.schemas s ON tb.schema_id = s.schema_id
    WHERE i.is_primary_key = 1 AND s.name = @schema AND tb.name = @table
    ORDER BY ic.key_ordinal
  `;

  const pk = await queryExecutor.executeReadOnly(pkQuery, { schema, table });
  result.primaryKey = pk.map((p: any) => p.column_name);

  if (includeIndexes) {
    const indexesQuery = `
      SELECT
        i.name as index_name,
        i.is_unique,
        STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) as columns
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      INNER JOIN sys.tables tb ON i.object_id = tb.object_id
      INNER JOIN sys.schemas s ON tb.schema_id = s.schema_id
      WHERE i.is_primary_key = 0 AND s.name = @schema AND tb.name = @table
      GROUP BY i.name, i.is_unique
    `;

    result.indexes = await queryExecutor.executeReadOnly(indexesQuery, { schema, table });
  }

  if (includeForeignKeys) {
    const fkQuery = `
      SELECT
        fk.name as constraint_name,
        OBJECT_SCHEMA_NAME(fk.referenced_object_id) as referenced_schema,
        OBJECT_NAME(fk.referenced_object_id) as referenced_table,
        COL_NAME(fkc.parent_object_id, fkc.parent_column_id) as column_name,
        COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) as referenced_column
      FROM sys.foreign_keys fk
      INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      INNER JOIN sys.tables tb ON fk.parent_object_id = tb.object_id
      INNER JOIN sys.schemas s ON tb.schema_id = s.schema_id
      WHERE s.name = @schema AND tb.name = @table
    `;

    result.foreignKeys = await queryExecutor.executeReadOnly(fkQuery, { schema, table });
  }

  return result;
}

export const getTableSchemaTool = {
  name: 'get_table_schema',
  description: 'Get comprehensive schema information for a table including columns, data types, primary key, indexes, and foreign key relationships.',
  inputSchema: GetTableSchemaSchema
};
