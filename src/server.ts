// src/server.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListResourcesRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { ConnectionManager } from './database/connection.js';
import { QueryExecutor } from './database/query-executor.js';
import { TransactionManager } from './database/transaction-manager.js';
import { VirtualFileSystem } from './filesystem/virtual-fs.js';
import { SQLValidator } from './security/validator.js';
import { AuditLogger } from './security/audit-logger.js';
import { VersionManager } from './utils/version-manager.js';
import { SPDraftManager } from './tools/sp-management/sp-draft-manager.js';
import { ServerConfig } from './types/index.js';
import { logger } from './config/logger.js';

// Import tools
import { searchStoredProceduresTool, searchStoredProcedures } from './tools/discovery/search-sp.js';
import { getTableSchemaTool, getTableSchema } from './tools/schema/get-table-schema.js';
import { executeQueryWriteTool, executeQueryWrite } from './tools/execution/execute-query-write.js';
import { transactionTools, beginTransaction, commitTransaction, rollbackTransaction } from './tools/transactions/transaction-tools.js';
import { spManagementTools, createSpDraft, testSpDraft, deploySp, rollbackSp, listSpVersions } from './tools/sp-management/sp-tools.js';
import { advancedTools, getDependencies, analyzeSpPerformance } from './tools/discovery/advanced-tools.js';

export class MCPDatabaseServer {
  private server: Server;
  private connectionManager: ConnectionManager;
  private queryExecutor: QueryExecutor;
  private transactionManager?: TransactionManager;
  private virtualFs: VirtualFileSystem;
  private validator?: SQLValidator;
  private auditLogger?: AuditLogger;
  private versionManager?: VersionManager;
  private draftManager?: SPDraftManager;

  constructor(private config: ServerConfig) {
    this.server = new Server(
      {
        name: 'mssql-mcp-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        }
      }
    );

    this.connectionManager = new ConnectionManager(
      config.database.readonly,
      config.database.readwrite
    );

    this.queryExecutor = new QueryExecutor(this.connectionManager);

    this.virtualFs = new VirtualFileSystem(
      this.queryExecutor,
      config.filesystem.virtualRoot,
      config.filesystem.enableCache,
      config.filesystem.cacheTimeout
    );

    // Initialize write-related components if enabled
    if (config.security.enableWriteOperations && config.database.readwrite) {
      this.transactionManager = new TransactionManager(this.connectionManager);
      this.validator = new SQLValidator(config.security);

      if (config.audit.enabled) {
        this.auditLogger = new AuditLogger(config.audit.logPath);
      }

      if (config.security.enableSpModifications) {
        this.versionManager = new VersionManager(
          this.queryExecutor,
          config.spManagement.versionHistoryCount
        );
        this.draftManager = new SPDraftManager(
          this.queryExecutor,
          this.transactionManager,
          this.versionManager,
          this.validator,
          config.spManagement.draftSchema
        );
      }
    }

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: any[] = [
        searchStoredProceduresTool,
        getTableSchemaTool,
        ...advancedTools
      ];

      // Add write tools if enabled
      if (this.config.security.enableWriteOperations) {
        tools.push(executeQueryWriteTool, ...transactionTools);

        if (this.config.security.enableSpModifications) {
          tools.push(...spManagementTools);
        }
      }

      return { tools };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_stored_procedures':
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(await searchStoredProcedures(this.queryExecutor, args as any), null, 2)
              }]
            };

          case 'get_table_schema':
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(await getTableSchema(this.queryExecutor, args as any), null, 2)
              }]
            };

          case 'get_dependencies':
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(await getDependencies(this.queryExecutor, args as any), null, 2)
              }]
            };

          case 'analyze_sp_performance':
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(await analyzeSpPerformance(this.queryExecutor, args as any), null, 2)
              }]
            };

          case 'execute_query_write':
            if (!this.transactionManager || !this.validator || !this.auditLogger) {
              throw new Error('Write operations not enabled');
            }
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(await executeQueryWrite(
                  this.transactionManager,
                  this.validator,
                  this.auditLogger,
                  this.config.security.maxRowsAffected,
                  args as any
                ), null, 2)
              }]
            };

          case 'begin_transaction':
            if (!this.transactionManager || !this.auditLogger) {
              throw new Error('Transactions not enabled');
            }
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(await beginTransaction(this.transactionManager, this.auditLogger, args as any), null, 2)
              }]
            };

          case 'commit_transaction':
            if (!this.transactionManager || !this.auditLogger) {
              throw new Error('Transactions not enabled');
            }
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(await commitTransaction(this.transactionManager, this.auditLogger, args as any), null, 2)
              }]
            };

          case 'rollback_transaction':
            if (!this.transactionManager || !this.auditLogger) {
              throw new Error('Transactions not enabled');
            }
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(await rollbackTransaction(this.transactionManager, this.auditLogger, args as any), null, 2)
              }]
            };

          case 'create_sp_draft':
            if (!this.draftManager || !this.auditLogger) {
              throw new Error('SP modifications not enabled');
            }
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(await createSpDraft(this.draftManager, this.auditLogger, args as any), null, 2)
              }]
            };

          case 'test_sp_draft':
            if (!this.draftManager) {
              throw new Error('SP modifications not enabled');
            }
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(await testSpDraft(this.draftManager, args as any), null, 2)
              }]
            };

          case 'deploy_sp':
            if (!this.draftManager || !this.auditLogger) {
              throw new Error('SP modifications not enabled');
            }
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(await deploySp(this.draftManager, this.auditLogger, args as any), null, 2)
              }]
            };

          case 'rollback_sp':
            if (!this.draftManager || !this.auditLogger) {
              throw new Error('SP modifications not enabled');
            }
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(await rollbackSp(this.draftManager, this.auditLogger, args as any), null, 2)
              }]
            };

          case 'list_sp_versions':
            if (!this.versionManager) {
              throw new Error('SP modifications not enabled');
            }
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(await listSpVersions(this.versionManager, args as any), null, 2)
              }]
            };

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        logger.error(`Tool execution failed: ${name}`, error);
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    });

    // List resources (virtual filesystem)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [{
        uri: `${this.config.filesystem.virtualRoot}/`,
        name: 'Database Objects',
        mimeType: 'application/x-directory'
      }]
    }));

    // Read resource (read files from virtual filesystem)
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        const content = await this.virtualFs.readFile(uri);
        return {
          contents: [{
            uri,
            mimeType: 'text/plain',
            text: content
          }]
        };
      } catch (error: any) {
        logger.error(`Failed to read resource: ${uri}`, error);
        throw error;
      }
    });
  }

  async start(): Promise<void> {
    await this.connectionManager.initialize();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info('MCP Database Server started');
  }

  async stop(): Promise<void> {
    await this.connectionManager.close();
    if (this.transactionManager) {
      this.transactionManager.close();
    }
    if (this.auditLogger) {
      await this.auditLogger.close();
    }
    logger.info('MCP Database Server stopped');
  }
}
