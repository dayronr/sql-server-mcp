// src/tools/sp-management/sp-tools.ts

import { z } from 'zod';
import { SPDraftManager } from './sp-draft-manager.js';
import { VersionManager } from '../../utils/version-manager.js';
import { AuditLogger } from '../../security/audit-logger.js';

// Create Draft
export const CreateDraftSchema = z.object({
  schema: z.string().default('dbo').describe('Schema name'),
  name: z.string().describe('Stored procedure name'),
  definition: z.string().describe('Complete SQL definition (CREATE PROCEDURE ...)')
});

export async function createSpDraft(
  draftManager: SPDraftManager,
  auditLogger: AuditLogger,
  args: z.infer<typeof CreateDraftSchema>
) {
  await draftManager.createDraft(args.schema, args.name, args.definition);

  await auditLogger.log({
    operation: 'create_sp_draft',
    user: 'mcp-user',
    details: { schema: args.schema, name: args.name },
    success: true
  });

  return {
    success: true,
    message: `Draft created successfully: ${args.schema}.${args.name}`,
    nextSteps: [
      `Test with: test_sp_draft`,
      `Deploy with: deploy_sp`,
      `Or discard draft if not needed`
    ]
  };
}

// Test Draft
export const TestDraftSchema = z.object({
  schema: z.string().default('dbo').describe('Schema name'),
  name: z.string().describe('Stored procedure name'),
  parameters: z.record(z.any()).describe('Parameters to pass to the procedure')
});

export async function testSpDraft(
  draftManager: SPDraftManager,
  args: z.infer<typeof TestDraftSchema>
) {
  const result = await draftManager.testDraft(args.schema, args.name, args.parameters);

  return {
    success: true,
    results: result.recordset,
    rowCount: result.recordset?.length || 0,
    message: 'Draft tested successfully'
  };
}

// Deploy Draft
export const DeploySpSchema = z.object({
  schema: z.string().default('dbo').describe('Schema name'),
  name: z.string().describe('Stored procedure name'),
  comment: z.string().optional().describe('Version comment/notes')
});

export async function deploySp(
  draftManager: SPDraftManager,
  auditLogger: AuditLogger,
  args: z.infer<typeof DeploySpSchema>
) {
  await draftManager.deployDraft(args.schema, args.name, args.comment);

  await auditLogger.log({
    operation: 'deploy_sp',
    user: 'mcp-user',
    details: { schema: args.schema, name: args.name, comment: args.comment },
    success: true
  });

  return {
    success: true,
    message: `Stored procedure deployed: ${args.schema}.${args.name}`,
    note: 'Previous version has been backed up and can be restored with rollback_sp'
  };
}

// Rollback SP
export const RollbackSpSchema = z.object({
  schema: z.string().default('dbo').describe('Schema name'),
  name: z.string().describe('Stored procedure name'),
  version: z.number().optional().describe('Specific version to rollback to (default: latest backup)')
});

export async function rollbackSp(
  draftManager: SPDraftManager,
  auditLogger: AuditLogger,
  args: z.infer<typeof RollbackSpSchema>
) {
  await draftManager.rollback(args.schema, args.name, args.version);

  await auditLogger.log({
    operation: 'rollback_sp',
    user: 'mcp-user',
    details: { schema: args.schema, name: args.name, version: args.version },
    success: true
  });

  return {
    success: true,
    message: `Stored procedure rolled back: ${args.schema}.${args.name}`,
    version: args.version || 'latest'
  };
}

// List Versions
export const ListVersionsSchema = z.object({
  schema: z.string().default('dbo').describe('Schema name'),
  name: z.string().describe('Stored procedure name')
});

export async function listSpVersions(
  versionManager: VersionManager,
  args: z.infer<typeof ListVersionsSchema>
) {
  const versions = await versionManager.listVersions(args.schema, args.name);

  return {
    procedure: `${args.schema}.${args.name}`,
    versions,
    count: versions.length
  };
}

export const spManagementTools = [
  {
    name: 'create_sp_draft',
    description: 'Create a draft version of a stored procedure for testing. The draft is created in a separate schema and does not affect production.',
    inputSchema: CreateDraftSchema
  },
  {
    name: 'test_sp_draft',
    description: 'Test a draft stored procedure with specified parameters. Execute the draft version safely before deploying.',
    inputSchema: TestDraftSchema
  },
  {
    name: 'deploy_sp',
    description: 'Deploy a tested draft to production. This backs up the current version automatically and can be rolled back.',
    inputSchema: DeploySpSchema
  },
  {
    name: 'rollback_sp',
    description: 'Rollback a stored procedure to a previous version. Can specify version number or use latest backup.',
    inputSchema: RollbackSpSchema
  },
  {
    name: 'list_sp_versions',
    description: 'List all backed up versions of a stored procedure with metadata.',
    inputSchema: ListVersionsSchema
  }
];
