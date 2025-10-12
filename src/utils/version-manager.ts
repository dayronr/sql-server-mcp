// src/utils/version-manager.ts

import { QueryExecutor } from '../database/query-executor.js';
import { SPVersion } from '../types/index.js';

export class VersionManager {
  private versionTableExists: boolean = false;

  constructor(
    private queryExecutor: QueryExecutor,
    private maxVersions: number
  ) {}

  async ensureVersionTable(): Promise<void> {
    if (this.versionTableExists) return;

    const createTableQuery = `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SPVersionHistory')
      BEGIN
        CREATE TABLE dbo.SPVersionHistory (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          SchemaName NVARCHAR(128) NOT NULL,
          ProcedureName NVARCHAR(128) NOT NULL,
          Version INT NOT NULL,
          Definition NVARCHAR(MAX) NOT NULL,
          CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
          CreatedBy NVARCHAR(128) DEFAULT SYSTEM_USER,
          Comment NVARCHAR(500),
          INDEX IX_SPVersionHistory_Procedure (SchemaName, ProcedureName, Version DESC)
        )
      END
    `;

    await this.queryExecutor.executeReadOnly(createTableQuery);
    this.versionTableExists = true;
  }

  async saveVersion(
    schema: string,
    name: string,
    definition: string,
    comment?: string
  ): Promise<number> {
    await this.ensureVersionTable();

    // Get next version number
    const versionQuery = `
      SELECT ISNULL(MAX(Version), 0) + 1 as NextVersion
      FROM dbo.SPVersionHistory
      WHERE SchemaName = @schema AND ProcedureName = @name
    `;

    const nextVersion = await this.queryExecutor.executeScalar<number>(
      versionQuery,
      { schema, name }
    );

    // Save version
    const insertQuery = `
      INSERT INTO dbo.SPVersionHistory (SchemaName, ProcedureName, Version, Definition, Comment)
      VALUES (@schema, @name, @version, @definition, @comment)
    `;

    await this.queryExecutor.executeReadOnly(insertQuery, {
      schema,
      name,
      version: nextVersion,
      definition,
      comment: comment || null
    });

    // Cleanup old versions
    await this.cleanupOldVersions(schema, name);

    return nextVersion;
  }

  async getVersion(schema: string, name: string, version: number): Promise<SPVersion | null> {
    const query = `
      SELECT Version, Definition, CreatedAt, CreatedBy, Comment
      FROM dbo.SPVersionHistory
      WHERE SchemaName = @schema AND ProcedureName = @name AND Version = @version
    `;

    const results = await this.queryExecutor.executeReadOnly<SPVersion>(
      query,
      { schema, name, version }
    );

    return results.length > 0 ? results[0] : null;
  }

  async listVersions(schema: string, name: string): Promise<SPVersion[]> {
    const query = `
      SELECT Version, CreatedAt, CreatedBy, Comment,
             LEN(Definition) as DefinitionLength
      FROM dbo.SPVersionHistory
      WHERE SchemaName = @schema AND ProcedureName = @name
      ORDER BY Version DESC
    `;

    return this.queryExecutor.executeReadOnly<SPVersion>(query, { schema, name });
  }

  async getLatestVersion(schema: string, name: string): Promise<SPVersion | null> {
    const query = `
      SELECT TOP 1 Version, Definition, CreatedAt, CreatedBy, Comment
      FROM dbo.SPVersionHistory
      WHERE SchemaName = @schema AND ProcedureName = @name
      ORDER BY Version DESC
    `;

    const results = await this.queryExecutor.executeReadOnly<SPVersion>(
      query,
      { schema, name }
    );

    return results.length > 0 ? results[0] : null;
  }

  private async cleanupOldVersions(schema: string, name: string): Promise<void> {
    const deleteQuery = `
      DELETE FROM dbo.SPVersionHistory
      WHERE SchemaName = @schema
        AND ProcedureName = @name
        AND Version NOT IN (
          SELECT TOP (@maxVersions) Version
          FROM dbo.SPVersionHistory
          WHERE SchemaName = @schema AND ProcedureName = @name
          ORDER BY Version DESC
        )
    `;

    await this.queryExecutor.executeReadOnly(deleteQuery, {
      schema,
      name,
      maxVersions: this.maxVersions
    });
  }
}
