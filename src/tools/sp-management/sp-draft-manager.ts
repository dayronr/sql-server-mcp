// src/tools/sp-management/sp-draft-manager.ts

import { TransactionManager } from '../../database/transaction-manager.js';
import { QueryExecutor } from '../../database/query-executor.js';
import { VersionManager } from '../../utils/version-manager.js';
import { SQLValidator } from '../../security/validator.js';

export class SPDraftManager {
  constructor(
    private queryExecutor: QueryExecutor,
    private transactionManager: TransactionManager,
    private versionManager: VersionManager,
    private validator: SQLValidator,
    private draftSchema: string
  ) {}

  async ensureDraftSchema(): Promise<void> {
    const query = `
      IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = @draftSchema)
      BEGIN
        EXEC('CREATE SCHEMA ' + @draftSchema)
      END
    `;

    await this.queryExecutor.executeReadOnly(query, { draftSchema: this.draftSchema });
  }

  async createDraft(schema: string, name: string, definition: string): Promise<void> {
    await this.ensureDraftSchema();

    // Validate SQL
    const validation = this.validator.validate(definition);
    if (!validation.valid) {
      throw new Error(`Invalid SQL: ${validation.errors.join(', ')}`);
    }

    // Parse and validate it's a CREATE/ALTER PROCEDURE
    if (!this.isProcedureDefinition(definition)) {
      throw new Error('Definition must be a CREATE or ALTER PROCEDURE statement');
    }

    // Modify definition to use draft schema
    const draftDefinition = this.rewriteForDraftSchema(definition, schema, name);

    // Drop existing draft if exists
    const dropQuery = `
      IF EXISTS (SELECT * FROM sys.procedures WHERE object_id = OBJECT_ID(@fullName))
      BEGIN
        DROP PROCEDURE ${this.draftSchema}.${name}
      END
    `;

    await this.queryExecutor.executeReadOnly(dropQuery, {
      fullName: `${this.draftSchema}.${name}`
    });

    // Create draft
    await this.queryExecutor.executeReadOnly(draftDefinition);
  }

  async testDraft(
    schema: string,
    name: string,
    parameters: Record<string, any>
  ): Promise<any> {
    // Build EXEC statement with parameters
    const paramList = Object.entries(parameters)
      .map(([key, value]) => `@${key} = @param_${key}`)
      .join(', ');

    const execQuery = `
      EXEC ${this.draftSchema}.${name} ${paramList}
    `;

    // Prepare parameters for query
    const queryParams: Record<string, any> = {};
    for (const [key, value] of Object.entries(parameters)) {
      queryParams[`param_${key}`] = value;
    }

    return this.queryExecutor.executeReadOnly(execQuery, queryParams);
  }

  async deployDraft(schema: string, name: string, comment?: string): Promise<void> {
    // Get draft definition
    const draftDefinition = await this.getDraftDefinition(name);
    if (!draftDefinition) {
      throw new Error(`Draft not found: ${this.draftSchema}.${name}`);
    }

    // Get current production version for backup
    const currentDefinition = await this.getCurrentDefinition(schema, name);
    if (currentDefinition) {
      // Save current version
      await this.versionManager.saveVersion(
        schema,
        name,
        currentDefinition,
        comment || 'Pre-deployment backup'
      );
    }

    // Deploy: Rewrite draft definition for production schema
    const productionDefinition = this.rewriteForProductionSchema(
      draftDefinition,
      schema,
      name
    );

    const txnId = await this.transactionManager.begin();

    try {
      // Drop existing if exists
      const dropQuery = `
        IF EXISTS (SELECT * FROM sys.procedures WHERE object_id = OBJECT_ID(@fullName))
        BEGIN
          DROP PROCEDURE ${schema}.${name}
        END
      `;

      await this.transactionManager.execute(txnId, dropQuery, {
        fullName: `${schema}.${name}`
      });

      // Create new version
      await this.transactionManager.execute(txnId, productionDefinition);

      await this.transactionManager.commit(txnId);

      // Clean up draft
      await this.deleteDraft(name);
    } catch (error) {
      await this.transactionManager.rollback(txnId);
      throw error;
    }
  }

  async rollback(schema: string, name: string, version?: number): Promise<void> {
    let versionToRestore: any;

    if (version) {
      versionToRestore = await this.versionManager.getVersion(schema, name, version);
    } else {
      versionToRestore = await this.versionManager.getLatestVersion(schema, name);
    }

    if (!versionToRestore) {
      throw new Error(`No version found to rollback to`);
    }

    const txnId = await this.transactionManager.begin();

    try {
      // Drop current
      const dropQuery = `
        IF EXISTS (SELECT * FROM sys.procedures WHERE object_id = OBJECT_ID(@fullName))
        BEGIN
          DROP PROCEDURE ${schema}.${name}
        END
      `;

      await this.transactionManager.execute(txnId, dropQuery, {
        fullName: `${schema}.${name}`
      });

      // Restore old version
      await this.transactionManager.execute(txnId, versionToRestore.definition);

      await this.transactionManager.commit(txnId);
    } catch (error) {
      await this.transactionManager.rollback(txnId);
      throw error;
    }
  }

  private async getDraftDefinition(name: string): Promise<string | null> {
    const query = `
      SELECT OBJECT_DEFINITION(OBJECT_ID(@fullName)) as definition
    `;

    try {
      return await this.queryExecutor.executeScalar<string>(query, {
        fullName: `${this.draftSchema}.${name}`
      });
    } catch {
      return null;
    }
  }

  private async getCurrentDefinition(schema: string, name: string): Promise<string | null> {
    const query = `
      SELECT OBJECT_DEFINITION(OBJECT_ID(@fullName)) as definition
    `;

    try {
      return await this.queryExecutor.executeScalar<string>(query, {
        fullName: `${schema}.${name}`
      });
    } catch {
      return null;
    }
  }

  private async deleteDraft(name: string): Promise<void> {
    const query = `
      IF EXISTS (SELECT * FROM sys.procedures WHERE object_id = OBJECT_ID(@fullName))
      BEGIN
        DROP PROCEDURE ${this.draftSchema}.${name}
      END
    `;

    await this.queryExecutor.executeReadOnly(query, {
      fullName: `${this.draftSchema}.${name}`
    });
  }

  private isProcedureDefinition(sql: string): boolean {
    return /CREATE\s+PROCEDURE/i.test(sql) || /ALTER\s+PROCEDURE/i.test(sql);
  }

  private rewriteForDraftSchema(definition: string, schema: string, name: string): string {
    // Replace CREATE/ALTER PROCEDURE [schema.]name with draft schema
    return definition.replace(
      /(?:CREATE|ALTER)\s+PROCEDURE\s+(?:\[?\w+\]?\.)?(\[?\w+\]?)/i,
      `CREATE PROCEDURE ${this.draftSchema}.${name}`
    );
  }

  private rewriteForProductionSchema(definition: string, schema: string, name: string): string {
    // Replace draft schema with production schema
    return definition.replace(
      new RegExp(`${this.draftSchema}\\.`, 'gi'),
      `${schema}.`
    ).replace(
      /CREATE\s+PROCEDURE/i,
      'CREATE PROCEDURE'
    );
  }
}
