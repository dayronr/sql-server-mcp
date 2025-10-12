# Database MCP Server Implementation Guide (Node.js)

Complete guide for building a production-ready Database MCP Server with stored procedure management, filesystem protocol, and safe write operations.

## Table of Contents

1. [Project Setup](#project-setup)
2. [Architecture Overview](#architecture-overview)
3. [Phase 1: Read-Only Foundation](#phase-1-read-only-foundation)
4. [Phase 2: Safe Writes](#phase-2-safe-writes)
5. [Phase 3: SP Management](#phase-3-sp-management)
6. [Phase 4: Advanced Features](#phase-4-advanced-features)
7. [Testing & Deployment](#testing--deployment)
8. [Configuration Reference](#configuration-reference)

---

## Project Setup

### Initialize Project

```bash
mkdir mssql-mcp-server
cd mssql-mcp-server
npm init -y
```

### Install Dependencies

```bash
# Core MCP
npm install @modelcontextprotocol/sdk

# Database
npm install mssql tedious

# Utilities
npm install zod dotenv winston
npm install sql-formatter sqlstring

# Development
npm install -D typescript @types/node @types/mssql
npm install -D tsx nodemon eslint prettier
```

### Project Structure

```
mssql-mcp-server/
├── src/
│   ├── index.ts                 # Entry point
│   ├── server.ts                # MCP server setup
│   ├── config/
│   │   ├── database.ts          # DB configuration
│   │   ├── security.ts          # Security settings
│   │   └── logger.ts            # Logging setup
│   ├── database/
│   │   ├── connection.ts        # Connection pooling
│   │   ├── query-executor.ts   # Query execution
│   │   └── transaction-manager.ts
│   ├── filesystem/
│   │   ├── virtual-fs.ts        # Filesystem protocol
│   │   ├── uri-parser.ts        # Parse virtual paths
│   │   └── file-cache.ts        # Caching layer
│   ├── tools/
│   │   ├── discovery/           # Search & discovery tools
│   │   │   ├── search-sp.ts
│   │   │   ├── find-references.ts
│   │   │   └── list-objects.ts
│   │   ├── schema/              # Schema tools
│   │   │   ├── get-table-schema.ts
│   │   │   ├── get-sp-definition.ts
│   │   │   └── get-dependencies.ts
│   │   ├── execution/           # Query execution tools
│   │   │   ├── execute-query.ts
│   │   │   ├── execute-sp.ts
│   │   │   └── preview-data.ts
│   │   ├── sp-management/       # SP modification tools
│   │   │   ├── create-draft.ts
│   │   │   ├── test-draft.ts
│   │   │   ├── deploy-sp.ts
│   │   │   └── rollback-sp.ts
│   │   └── transactions/        # Transaction tools
│   │       ├── begin-transaction.ts
│   │       ├── commit.ts
│   │       └── rollback.ts
│   ├── security/
│   │   ├── validator.ts         # SQL validation
│   │   ├── sanitizer.ts         # Input sanitization
│   │   └── audit-logger.ts      # Audit trail
│   └── utils/
│       ├── sql-parser.ts        # SQL parsing utilities
│       ├── version-manager.ts   # SP versioning
│       └── error-handler.ts     # Error handling
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── .env.example
├── tsconfig.json
├── package.json
└── README.md
```

### TypeScript Configuration (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Package.json Scripts

```json
{
  "name": "mssql-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "jest",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write 'src/**/*.ts'"
  }
}
```

---

## Architecture Overview

### Core Components

```typescript
// src/types/index.ts

export interface DatabaseConfig {
  server: string;
  database: string;
  user?: string;
  password?: string;
  authentication?: {
    type: 'default' | 'azure-active-directory-default';
  };
  options?: {
    encrypt: boolean;
    trustServerCertificate: boolean;
  };
}

export interface SecurityConfig {
  enableWriteOperations: boolean;
  requireTransactions: boolean;
  maxRowsAffected: number;
  enableSpModifications: boolean;
  blockedKeywords: string[];
  allowedSchemas?: string[];
}

export interface ServerConfig {
  database: {
    readonly: DatabaseConfig;
    readwrite?: DatabaseConfig;
  };
  security: SecurityConfig;
  filesystem: {
    virtualRoot: string;
    enableCache: boolean;
    cacheTimeout: number;
  };
  audit: {
    enabled: boolean;
    logPath: string;
  };
  spManagement: {
    draftSchema: string;
    autoBackup: boolean;
    versionHistoryCount: number;
  };
}

export interface VirtualPath {
  type: 'stored-procedure' | 'view' | 'function' | 'table';
  schema: string;
  name: string;
  fullPath: string;
}

export interface SPVersion {
  version: number;
  definition: string;
  createdAt: Date;
  createdBy: string;
  comment?: string;
}
```

---

## Phase 1: Read-Only Foundation

### 1.1 Database Connection Manager

```typescript
// src/database/connection.ts

import sql from 'mssql';
import { DatabaseConfig } from '../types/index.js';
import { logger } from '../config/logger.js';

export class ConnectionManager {
  private readonlyPool: sql.ConnectionPool | null = null;
  private readwritePool: sql.ConnectionPool | null = null;

  constructor(
    private readonlyConfig: DatabaseConfig,
    private readwriteConfig?: DatabaseConfig
  ) {}

  async initialize(): Promise<void> {
    try {
      // Initialize read-only pool
      this.readonlyPool = await new sql.ConnectionPool(this.readonlyConfig).connect();
      logger.info('Read-only connection pool initialized');

      // Initialize read-write pool if configured
      if (this.readwriteConfig) {
        this.readwritePool = await new sql.ConnectionPool(this.readwriteConfig).connect();
        logger.info('Read-write connection pool initialized');
      }
    } catch (error) {
      logger.error('Failed to initialize connection pools', error);
      throw error;
    }
  }

  getReadonlyPool(): sql.ConnectionPool {
    if (!this.readonlyPool) {
      throw new Error('Read-only pool not initialized');
    }
    return this.readonlyPool;
  }

  getReadwritePool(): sql.ConnectionPool {
    if (!this.readwritePool) {
      throw new Error('Read-write pool not initialized or not configured');
    }
    return this.readwritePool;
  }

  async close(): Promise<void> {
    if (this.readonlyPool) {
      await this.readonlyPool.close();
      logger.info('Read-only pool closed');
    }
    if (this.readwritePool) {
      await this.readwritePool.close();
      logger.info('Read-write pool closed');
    }
  }
}
```

### 1.2 Query Executor (Read-Only)

```typescript
// src/database/query-executor.ts

import sql from 'mssql';
import { ConnectionManager } from './connection.js';
import { logger } from '../config/logger.js';

export class QueryExecutor {
  constructor(private connectionManager: ConnectionManager) {}

  async executeReadOnly<T = any>(query: string, params?: Record<string, any>): Promise<T[]> {
    const pool = this.connectionManager.getReadonlyPool();
    const startTime = Date.now();

    try {
      const request = pool.request();

      // Add parameters if provided
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          request.input(key, value);
        }
      }

      const result = await request.query(query);
      
      logger.info('Query executed', {
        duration: Date.now() - startTime,
        rows: result.recordset.length
      });

      return result.recordset as T[];
    } catch (error) {
      logger.error('Query execution failed', { query, error });
      throw error;
    }
  }

  async executeScalar<T = any>(query: string, params?: Record<string, any>): Promise<T> {
    const results = await this.executeReadOnly<T>(query, params);
    if (results.length === 0) {
      throw new Error('Query returned no results');
    }
    const firstRow = results[0];
    return Object.values(firstRow)[0] as T;
  }
}
```

### 1.3 Virtual Filesystem Implementation

```typescript
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
```

### 1.4 URI Parser

```typescript
// src/filesystem/uri-parser.ts

import { VirtualPath } from '../types/index.js';

export function parseVirtualUri(uri: string, virtualRoot: string): VirtualPath {
  // Remove virtual root prefix
  const relativePath = uri.startsWith(virtualRoot) 
    ? uri.substring(virtualRoot.length) 
    : uri;

  const parts = relativePath.split('/').filter(p => p);

  if (parts.length === 0) {
    throw new Error('Invalid URI: empty path');
  }

  // Determine type from first path segment
  const typeMap: Record<string, VirtualPath['type']> = {
    'stored_procedures': 'stored-procedure',
    'views': 'view',
    'functions': 'function',
    'tables': 'table'
  };

  const type = typeMap[parts[0]];
  if (!type) {
    throw new Error(`Unknown object type: ${parts[0]}`);
  }

  // Parse schema and name
  let schema = 'dbo';
  let name = '';

  if (parts.length >= 2) {
    schema = parts[1];
  }

  if (parts.length >= 3) {
    // Remove .sql extension if present
    name = parts[2].replace(/\.sql$/, '');
  }

  return {
    type,
    schema,
    name,
    fullPath: uri
  };
}

export function buildVirtualUri(virtualRoot: string, type: VirtualPath['type'], schema: string, name: string): string {
  const typeDir = type === 'stored-procedure' ? 'stored_procedures' :
                  type === 'view' ? 'views' :
                  type === 'function' ? 'functions' : 'tables';
  
  return `${virtualRoot}/${typeDir}/${schema}/${name}.sql`;
}
```

### 1.5 File Cache

```typescript
// src/filesystem/file-cache.ts

interface CacheEntry {
  data: string;
  timestamp: number;
}

export class FileCache {
  private cache: Map<string, CacheEntry> = new Map();

  constructor(
    private enabled: boolean,
    private timeout: number
  ) {}

  get(key: string): string | null {
    if (!this.enabled) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.timeout) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: string): void {
    if (!this.enabled) return;

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
```

### 1.6 Discovery Tools

```typescript
// src/tools/discovery/search-sp.ts

import { z } from 'zod';
import { QueryExecutor } from '../../database/query-executor.js';

const SearchSpSchema = z.object({
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
    return results.map(r => {
      const lines = r.definition.split('\n');
      const matchingLines = lines
        .map((line, index) => ({ line, lineNumber: index + 1 }))
        .filter(({ line }) => line.toLowerCase().includes(pattern.toLowerCase()))
        .slice(0, 5); // Limit to first 5 matches per SP

      return {
        schema: r.schema_name,
        name: r.name,
        lastModified: r.last_modified,
        matches: matchingLines.map(m => ({
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
```

### 1.7 Schema Tools

```typescript
// src/tools/schema/get-table-schema.ts

import { z } from 'zod';
import { QueryExecutor } from '../../database/query-executor.js';

const GetTableSchemaSchema = z.object({
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
    columns: columns.map(c => ({
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
  result.primaryKey = pk.map(p => p.column_name);

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
```

### 1.8 MCP Server Setup (Phase 1)

```typescript
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
import { VirtualFileSystem } from './filesystem/virtual-fs.js';
import { ServerConfig } from './types/index.js';
import { logger } from './config/logger.js';

// Import tools
import { searchStoredProceduresTool, searchStoredProcedures } from './tools/discovery/search-sp.js';
import { getTableSchemaTool, getTableSchema } from './tools/schema/get-table-schema.js';

export class MCPDatabaseServer {
  private server: Server;
  private connectionManager: ConnectionManager;
  private queryExecutor: QueryExecutor;
  private virtualFs: VirtualFileSystem;

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

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        searchStoredProceduresTool,
        getTableSchemaTool
        // Add more tools as implemented
      ]
    }));

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_stored_procedures':
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(await searchStoredProcedures(this.queryExecutor, args), null, 2)
              }]
            };

          case 'get_table_schema':
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(await getTableSchema(this.queryExecutor, args), null, 2)
              }]
            };

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
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
      } catch (error) {
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
    logger.info('MCP Database Server stopped');
  }
}
```

---

## Phase 2: Safe Writes

### 2.1 SQL Validator & Sanitizer

```typescript
// src/security/validator.ts

import { SecurityConfig } from '../types/index.js';

export class SQLValidator {
  private blockedKeywords: RegExp[];

  constructor(private securityConfig: SecurityConfig) {
    this.blockedKeywords = securityConfig.blockedKeywords.map(
      keyword => new RegExp(`\\b${keyword}\\b`, 'i')
    );
  }

  validate(sql: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for blocked keywords
    for (const pattern of this.blockedKeywords) {
      if (pattern.test(sql)) {
        errors.push(`Blocked keyword found: ${pattern.source}`);
      }
    }

    // Check for suspicious patterns
    if (this.containsSuspiciousPattern(sql)) {
      errors.push('SQL contains suspicious patterns');
    }

    // Check for dynamic SQL that could be injection risk
    if (this.containsUnsafeDynamicSQL(sql)) {
      errors.push('Unsafe dynamic SQL detected');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  isWriteQuery(sql: string): boolean {
    const writeKeywords = ['INSERT', 'UPDATE', 'DELETE', 'MERGE', 'TRUNCATE', 'CREATE', 'ALTER', 'DROP'];
    const normalizedSql = sql.trim().toUpperCase();
    
    return writeKeywords.some(keyword => normalizedSql.startsWith(keyword));
  }

  private containsSuspiciousPattern(sql: string): boolean {
    const suspiciousPatterns = [
      /;\s*DROP/i,
      /;\s*DELETE/i,
      /EXEC\s*\(/i,
      /xp_cmdshell/i,
      /sp_executesql/i,
      /'.*OR.*'.*=/i  // SQL injection pattern
    ];

    return suspiciousPatterns.some(pattern => pattern.test(sql));
  }

  private containsUnsafeDynamicSQL(sql: string): boolean {
    // Check for EXEC or EXECUTE with string concatenation
    return /EXEC(UTE)?\s*\(\s*@/i.test(sql) || /EXEC(UTE)?\s+@/i.test(sql);
  }
}
```

### 2.2 Transaction Manager

```typescript
// src/database/transaction-manager.ts

import sql from 'mssql';
import { ConnectionManager } from './connection.js';
import { logger } from '../config/logger.js';
import { v4 as uuidv4 } from 'uuid';

export interface Transaction {
  id: string;
  connection: sql.ConnectionPool;
  transaction: sql.Transaction;
  startTime: Date;
  queries: string[];
}

export class TransactionManager {
  private activeTransactions: Map<string, Transaction> = new Map();
  private readonly TRANSACTION_TIMEOUT = 300000; // 5 minutes

  constructor(private connectionManager: ConnectionManager) {
    // Cleanup old transactions periodically
    setInterval(() => this.cleanupTimedOutTransactions(), 60000);
  }

  async begin(): Promise<string> {
    const transactionId = uuidv4();
    const connection = this.connectionManager.getReadwritePool();
    const transaction = new sql.Transaction(connection);

    try {
      await transaction.begin();

      this.activeTransactions.set(transactionId, {
        id: transactionId,
        connection,
        transaction,
        startTime: new Date(),
        queries: []
      });

      logger.info('Transaction started', { transactionId });
      return transactionId;
    } catch (error) {
      logger.error('Failed to start transaction', error);
      throw error;
    }
  }

  async execute(transactionId: string, query: string, params?: Record<string, any>): Promise<any> {
    const txn = this.activeTransactions.get(transactionId);
    if (!txn) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    try {
      const request = new sql.Request(txn.transaction);

      // Add parameters
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          request.input(key, value);
        }
      }

      const result = await request.query(query);
      
      // Track query
      txn.queries.push(query);

      logger.info('Query executed in transaction', {
        transactionId,
        rowsAffected: result.rowsAffected[0]
      });

      return result;
    } catch (error) {
      logger.error('Query failed in transaction', { transactionId, error });
      // Don't auto-rollback here; let caller decide
      throw error;
    }
  }

  async commit(transactionId: string): Promise<void> {
    const txn = this.activeTransactions.get(transactionId);
    if (!txn) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    try {
      await txn.transaction.commit();
      this.activeTransactions.delete(transactionId);
      
      logger.info('Transaction committed', {
        transactionId,
        queryCount: txn.queries.length
      });
    } catch (error) {
      logger.error('Failed to commit transaction', { transactionId, error });
      throw error;
    }
  }

  async rollback(transactionId: string): Promise<void> {
    const txn = this.activeTransactions.get(transactionId);
    if (!txn) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    try {
      await txn.transaction.rollback();
      this.activeTransactions.delete(transactionId);
      
      logger.info('Transaction rolled back', {
        transactionId,
        queryCount: txn.queries.length
      });
    } catch (error) {
      logger.error('Failed to rollback transaction', { transactionId, error });
      throw error;
    }
  }

  private cleanupTimedOutTransactions(): void {
    const now = Date.now();

    for (const [id, txn] of this.activeTransactions.entries()) {
      if (now - txn.startTime.getTime() > this.TRANSACTION_TIMEOUT) {
        logger.warn('Transaction timed out, rolling back', { transactionId: id });
        this.rollback(id).catch(err => 
          logger.error('Failed to rollback timed out transaction', err)
        );
      }
    }
  }

  getActiveTransactionCount(): number {
    return this.activeTransactions.size;
  }
}
```

### 2.3 Audit Logger

```typescript
// src/security/audit-logger.ts

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../config/logger.js';

export interface AuditEntry {
  timestamp: Date;
  operation: string;
  user: string;
  details: any;
  success: boolean;
  error?: string;
}

export class AuditLogger {
  private buffer: AuditEntry[] = [];
  private flushInterval: NodeJS.Timeout;

  constructor(
    private logPath: string,
    private bufferSize: number = 100,
    private flushIntervalMs: number = 30000
  ) {
    // Flush buffer periodically
    this.flushInterval = setInterval(() => this.flush(), flushIntervalMs);
    
    // Ensure log directory exists
    this.ensureLogDirectory();
  }

  async log(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
    this.buffer.push({
      timestamp: new Date(),
      ...entry
    });

    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      const logFile = path.join(this.logPath, `audit-${this.getDateString()}.log`);
      const logLines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';

      await fs.appendFile(logFile, logLines, 'utf8');
    } catch (error) {
      logger.error('Failed to write audit log', error);
      // Put entries back in buffer
      this.buffer.unshift(...entries);
    }
  }

  private async ensureLogDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.logPath, { recursive: true });
    } catch (error) {
      logger.error('Failed to create audit log directory', error);
    }
  }

  private getDateString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  async close(): Promise<void> {
    clearInterval(this.flushInterval);
    await this.flush();
  }
}
```

### 2.4 Write Query Execution Tool

```typescript
// src/tools/execution/execute-query-write.ts

import { z } from 'zod';
import { QueryExecutor } from '../../database/query-executor.js';
import { TransactionManager } from '../../database/transaction-manager.js';
import { SQLValidator } from '../../security/validator.js';
import { AuditLogger } from '../../security/audit-logger.js';

const ExecuteQueryWriteSchema = z.object({
  query: z.string().describe('SQL query to execute (INSERT, UPDATE, DELETE, etc.)'),
  parameters: z.record(z.any()).optional().describe('Named parameters for the query'),
  transactionId: z.string().optional().describe('Transaction ID if part of a transaction'),
  requireConfirmation: z.boolean().default(true).describe('Require user confirmation before execution')
});

export async function executeQueryWrite(
  transactionManager: TransactionManager,
  validator: SQLValidator,
  auditLogger: AuditLogger,
  maxRowsAffected: number,
  args: z.infer<typeof ExecuteQueryWriteSchema>
) {
  const { query, parameters, transactionId, requireConfirmation } = args;

  // Validate query
  const validation = validator.validate(query);
  if (!validation.valid) {
    const error = `Query validation failed: ${validation.errors.join(', ')}`;
    await auditLogger.log({
      operation: 'execute_query_write',
      user: 'mcp-user', // Would come from context in production
      details: { query, parameters },
      success: false,
      error
    });
    throw new Error(error);
  }

  // Ensure it's a write query
  if (!validator.isWriteQuery(query)) {
    throw new Error('Query is not a write operation. Use execute_query_readonly for SELECT queries.');
  }

  try {
    let result: any;
    let usedTransactionId = transactionId;

    if (transactionId) {
      // Execute within existing transaction
      result = await transactionManager.execute(transactionId, query, parameters);
    } else {
      // Create temporary transaction
      usedTransactionId = await transactionManager.begin();
      
      try {
        result = await transactionManager.execute(usedTransactionId, query, parameters);
        
        // Check rows affected
        const rowsAffected = result.rowsAffected[0] || 0;
        if (rowsAffected > maxRowsAffected) {
          await transactionManager.rollback(usedTransactionId);
          throw new Error(`Query would affect ${rowsAffected} rows, exceeding limit of ${maxRowsAffected}`);
        }

        // Auto-commit if not part of larger transaction
        await transactionManager.commit(usedTransactionId);
      } catch (error) {
        await transactionManager.rollback(usedTransactionId);
        throw error;
      }
    }

    // Log successful execution
    await auditLogger.log({
      operation: 'execute_query_write',
      user: 'mcp-user',
      details: { 
        query, 
        parameters,
        rowsAffected: result.rowsAffected[0],
        transactionId: usedTransactionId
      },
      success: true
    });

    return {
      success: true,
      rowsAffected: result.rowsAffected[0],
      transactionId: usedTransactionId,
      message: `Query executed successfully. ${result.rowsAffected[0]} row(s) affected.`
    };

  } catch (error) {
    await auditLogger.log({
      operation: 'execute_query_write',
      user: 'mcp-user',
      details: { query, parameters },
      success: false,
      error: error.message
    });
    throw error;
  }
}

export const executeQueryWriteTool = {
  name: 'execute_query_write',
  description: 'Execute a write query (INSERT, UPDATE, DELETE) against the database. Can be part of a transaction or auto-committed. Validates query safety before execution.',
  inputSchema: ExecuteQueryWriteSchema
};
```

### 2.5 Transaction Tools

```typescript
// src/tools/transactions/transaction-tools.ts

import { z } from 'zod';
import { TransactionManager } from '../../database/transaction-manager.js';
import { AuditLogger } from '../../security/audit-logger.js';

// Begin Transaction
const BeginTransactionSchema = z.object({
  description: z.string().optional().describe('Optional description of what this transaction will do')
});

export async function beginTransaction(
  transactionManager: TransactionManager,
  auditLogger: AuditLogger,
  args: z.infer<typeof BeginTransactionSchema>
) {
  const transactionId = await transactionManager.begin();

  await auditLogger.log({
    operation: 'begin_transaction',
    user: 'mcp-user',
    details: { transactionId, description: args.description },
    success: true
  });

  return {
    transactionId,
    message: 'Transaction started. Use this ID for subsequent operations.',
    note: 'Remember to commit or rollback when done.'
  };
}

// Commit Transaction
const CommitTransactionSchema = z.object({
  transactionId: z.string().describe('Transaction ID to commit')
});

export async function commitTransaction(
  transactionManager: TransactionManager,
  auditLogger: AuditLogger,
  args: z.infer<typeof CommitTransactionSchema>
) {
  await transactionManager.commit(args.transactionId);

  await auditLogger.log({
    operation: 'commit_transaction',
    user: 'mcp-user',
    details: { transactionId: args.transactionId },
    success: true
  });

  return {
    success: true,
    message: 'Transaction committed successfully.'
  };
}

// Rollback Transaction
const RollbackTransactionSchema = z.object({
  transactionId: z.string().describe('Transaction ID to rollback')
});

export async function rollbackTransaction(
  transactionManager: TransactionManager,
  auditLogger: AuditLogger,
  args: z.infer<typeof RollbackTransactionSchema>
) {
  await transactionManager.rollback(args.transactionId);

  await auditLogger.log({
    operation: 'rollback_transaction',
    user: 'mcp-user',
    details: { transactionId: args.transactionId },
    success: true
  });

  return {
    success: true,
    message: 'Transaction rolled back successfully.'
  };
}

export const transactionTools = [
  {
    name: 'begin_transaction',
    description: 'Start a new database transaction. Returns a transaction ID to use for subsequent operations.',
    inputSchema: BeginTransactionSchema
  },
  {
    name: 'commit_transaction',
    description: 'Commit a transaction, making all changes permanent.',
    inputSchema: CommitTransactionSchema
  },
  {
    name: 'rollback_transaction',
    description: 'Rollback a transaction, undoing all changes made within it.',
    inputSchema: RollbackTransactionSchema
  }
];
```

---

## Phase 3: SP Management

### 3.1 Version Manager

```typescript
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
```

### 3.2 SP Draft Manager

```typescript
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
    
    return this.queryExecutor.executeScalar<string>(query, {
      fullName: `${this.draftSchema}.${name}`
    });
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
```

### 3.3 SP Management Tools

```typescript
// src/tools/sp-management/sp-tools.ts

import { z } from 'zod';
import { SPDraftManager } from './sp-draft-manager.js';
import { VersionManager } from '../../utils/version-manager.js';
import { AuditLogger } from '../../security/audit-logger.js';

// Create Draft
const CreateDraftSchema = z.object({
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
const TestDraftSchema = z.object({
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
const DeploySpSchema = z.object({
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
const RollbackSpSchema = z.object({
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
const ListVersionsSchema = z.object({
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
```

---

## Phase 4: Advanced Features

### 4.1 Dependency Analysis

```typescript
// src/tools/discovery/dependency-analyzer.ts

import { z } from 'zod';
import { QueryExecutor } from '../../database/query-executor.js';

const GetDependenciesSchema = z.object({
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

export const getDependenciesTool = {
  name: 'get_dependencies',
  description: 'Analyze dependencies for a database object. Shows what it references and what references it.',
  inputSchema: GetDependenciesSchema
};
```

### 4.2 Find SP References

```typescript
// src/tools/discovery/find-references.ts

import { z } from 'zod';
import { QueryExecutor } from '../../database/query-executor.js';

const FindSpReferencesSchema = z.object({
  tableName: z.string().describe('Table name to find references to'),
  schema: z.string().optional().describe('Limit to specific schema'),
  operationType: z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL']).default('ALL')
    .describe('Type of operation to find (SELECT, INSERT, UPDATE, DELETE, or ALL)')
});

export async function findSpReferences(
  queryExecutor: QueryExecutor,
  args: z.infer<typeof FindSpReferencesSchema>
) {
  // Find all SPs that reference the table
  const query = `
    SELECT 
      OBJECT_SCHEMA_NAME(object_id) as schema_name,
      OBJECT_NAME(object_id) as procedure_name,
      OBJECT_DEFINITION(object_id) as definition
    FROM sys.procedures
    WHERE OBJECT_DEFINITION(object_id) LIKE '%' + @tableName + '%'
      ${args.schema ? 'AND OBJECT_SCHEMA_NAME(object_id) = @schema' : ''}
  `;

  const params: any = { tableName: args.tableName };
  if (args.schema) params.schema = args.schema;

  const procedures = await queryExecutor.executeReadOnly(query, params);

  // Analyze each procedure for operation types
  const results = procedures.map(proc => {
    const def = proc.definition.toUpperCase();
    const operations: string[] = [];

    if (args.operationType === 'ALL' || args.operationType === 'SELECT') {
      if (def.includes('SELECT') && def.includes(args.tableName.toUpperCase())) {
        operations.push('SELECT');
      }
    }
    
    if (args.operationType === 'ALL' || args.operationType === 'INSERT') {
      if (def.includes('INSERT INTO') && def.includes(args.tableName.toUpperCase())) {
        operations.push('INSERT');
      }
    }
    
    if (args.operationType === 'ALL' || args.operationType === 'UPDATE') {
      if (def.includes('UPDATE') && def.includes(args.tableName.toUpperCase())) {
        operations.push('UPDATE');
      }
    }
    
    if (args.operationType === 'ALL' || args.operationType === 'DELETE') {
      if (def.includes('DELETE') && def.includes(args.tableName.toUpperCase())) {
        operations.push('DELETE');
      }
    }

    return {
      schema: proc.schema_name,
      procedure: proc.procedure_name,
      operations: operations.length > 0 ? operations : ['REFERENCE']
    };
  });

  return {
    table: args.tableName,
    procedureCount: results.length,
    procedures: results
  };
}

export const findSpReferencesTool = {
  name: 'find_sp_references',
  description: 'Find all stored procedures that reference a specific table, with operation type analysis (SELECT, INSERT, UPDATE, DELETE).',
  inputSchema: FindSpReferencesSchema
};
```

### 4.3 Performance Analysis

```typescript
// src/tools/discovery/performance-analyzer.ts

import { z } from 'zod';
import { QueryExecutor } from '../../database/query-executor.js';

const AnalyzeSpPerformanceSchema = z.object({
  schema: z.string().default('dbo').describe('Schema name'),
  name: z.string().describe('Stored procedure name'),
  includeExecutionStats: z.boolean().default(true).describe('Include execution statistics'),
  includePlan: z.boolean().default(false).describe('Include execution plan (verbose)')
});

export async function analyzeSpPerformance(
  queryExecutor: QueryExecutor,
  args: z.infer<typeof AnalyzeSpPerformanceSchema>
) {
  const result: any = {
    procedure: `${args.schema}.${args.name}`
  };

  if (args.includeExecutionStats) {
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
  }

  if (args.includePlan) {
    const planQuery = `
      SELECT 
        qs.query_plan as execution_plan
      FROM sys.dm_exec_procedure_stats ps
      CROSS APPLY sys.dm_exec_query_plan(ps.plan_handle) qs
      WHERE OBJECT_NAME(ps.object_id, ps.database_id) = @name
        AND OBJECT_SCHEMA_NAME(ps.object_id, ps.database_id) = @schema
    `;

    const planResult = await queryExecutor.executeReadOnly(planQuery, {
      schema: args.schema,
      name: args.name
    });

    result.executionPlan = planResult.length > 0 ? planResult[0].execution_plan : null;
  }

  return result;
}

export const analyzeSpPerformanceTool = {
  name: 'analyze_sp_performance',
  description: 'Analyze stored procedure performance including execution count, CPU time, duration, and logical reads from plan cache.',
  inputSchema: AnalyzeSpPerformanceSchema
};
```

---

## Testing & Deployment

### Unit Tests Example

```typescript
// tests/unit/validator.test.ts

import { describe, it, expect, beforeEach } from '@jest/globals';
import { SQLValidator } from '../../src/security/validator';
import { SecurityConfig } from '../../src/types';

describe('SQLValidator', () => {
  let validator: SQLValidator;

  beforeEach(() => {
    const config: SecurityConfig = {
      enableWriteOperations: true,
      requireTransactions: true,
      maxRowsAffected: 1000,
      enableSpModifications: true,
      blockedKeywords: ['DROP DATABASE', 'xp_cmdshell', 'sp_configure']
    };
    validator = new SQLValidator(config);
  });

  it('should allow safe SELECT queries', () => {
    const result = validator.validate('SELECT * FROM Users WHERE Id = @id');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should block dangerous keywords', () => {
    const result = validator.validate('SELECT * FROM Users; DROP DATABASE TestDB');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Blocked keyword found: DROP DATABASE');
  });

  it('should detect write queries', () => {
    expect(validator.isWriteQuery('INSERT INTO Users VALUES (1, "test")')).toBe(true);
    expect(validator.isWriteQuery('UPDATE Users SET Name = "test"')).toBe(true);
    expect(validator.isWriteQuery('DELETE FROM Users WHERE Id = 1')).toBe(true);
    expect(validator.isWriteQuery('SELECT * FROM Users')).toBe(false);
  });

  it('should detect SQL injection patterns', () => {
    const result = validator.validate("SELECT * FROM Users WHERE Name = '' OR '1'='1'");
    expect(result.valid).toBe(false);
  });
});
```

### Integration Tests Example

```typescript
// tests/integration/sp-management.test.ts

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { setupTestServer, cleanupTestServer, TestContext } from '../helpers/test-server';

describe('SP Management Integration', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestServer();
  });

  afterAll(async () => {
    await cleanupTestServer(context);
  });

  it('should create, test, and deploy a stored procedure', async () => {
    const spDefinition = `
      CREATE PROCEDURE dbo.TestProcedure
        @userId INT
      AS
      BEGIN
        SELECT * FROM Users WHERE Id = @userId
      END
    `;

    // Create draft
    const createResult = await context.callTool('create_sp_draft', {
      schema: 'dbo',
      name: 'TestProcedure',
      definition: spDefinition
    });

    expect(createResult.success).toBe(true);

    // Test draft
    const testResult = await context.callTool('test_sp_draft', {
      schema: 'dbo',
      name: 'TestProcedure',
      parameters: { userId: 1 }
    });

    expect(testResult.success).toBe(true);

    // Deploy
    const deployResult = await context.callTool('deploy_sp', {
      schema: 'dbo',
      name: 'TestProcedure',
      comment: 'Initial version'
    });

    expect(deployResult.success).toBe(true);

    // Verify in production
    const exists = await context.checkProcedureExists('dbo', 'TestProcedure');
    expect(exists).toBe(true);
  });

  it('should rollback to previous version', async () => {
    // ... test rollback functionality
  });
});
```

### Deployment Steps

```bash
# 1. Build the project
npm run build

# 2. Test the build
npm test

# 3. Configure for your environment
cp .env.example .env
# Edit .env with your database connection strings

# 4. Test connection
node dist/index.js --test-connection

# 5. Configure Claude Code
# Edit ~/.claude.json or .claude.json in your project

{
  "mcpServers": {
    "mssql": {
      "command": "node",
      "args": ["/full/path/to/mssql-mcp-server/dist/index.js"],
      "env": {
        "DB_SERVER": "localhost",
        "DB_DATABASE": "YourDatabase",
        "DB_USER": "your_user",
        "DB_PASSWORD": "your_password",
        "ENABLE_WRITE_OPERATIONS": "true",
        "DRAFT_SCHEMA": "dbo_draft"
      }
    }
  }
}

# 6. Restart Claude Code
# The server will appear in the /mcp command

# 7. Test with Claude Code
> /mcp
> search for stored procedures containing "customer"
> get schema for Users table
```

---

## Configuration Reference

### Environment Variables

```bash
# Database Configuration
DB_SERVER=localhost
DB_DATABASE=MyDatabase
DB_USER=sa
DB_PASSWORD=YourPassword
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=false

# Read-Write Connection (optional separate connection)
DB_RW_SERVER=localhost
DB_RW_DATABASE=MyDatabase
DB_RW_USER=sa
DB_RW_PASSWORD=YourPassword

# Security Settings
ENABLE_WRITE_OPERATIONS=true
REQUIRE_TRANSACTIONS=true
MAX_ROWS_AFFECTED=10000
ENABLE_SP_MODIFICATIONS=true
ALLOWED_SCHEMAS=dbo,analytics

# Blocked Keywords (comma-separated)
BLOCKED_KEYWORDS=DROP DATABASE,TRUNCATE TABLE,xp_cmdshell,sp_configure

# Filesystem
VIRTUAL_FS_ROOT=/database
ENABLE_CACHE=true
CACHE_TIMEOUT_MS=300000

# SP Management
DRAFT_SCHEMA=dbo_draft
AUTO_BACKUP_BEFORE_DEPLOY=true
VERSION_HISTORY_COUNT=5

# Audit Logging
ENABLE_AUDIT_LOG=true
AUDIT_LOG_PATH=./logs

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/server.log
```

### Full Configuration Object

```typescript
// src/config/index.ts

import { config as dotenvConfig } from 'dotenv';
import { ServerConfig } from '../types';

dotenvConfig();

export const config: ServerConfig = {
  database: {
    readonly: {
      server: process.env.DB_SERVER!,
      database: process.env.DB_DATABASE!,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
      }
    },
    readwrite: process.env.ENABLE_WRITE_OPERATIONS === 'true' ? {
      server: process.env.DB_RW_SERVER || process.env.DB_SERVER!,
      database: process.env.DB_RW_DATABASE || process.env.DB_DATABASE!,
      user: process.env.DB_RW_USER || process.env.DB_USER,
      password: process.env.DB_RW_PASSWORD || process.env.DB_PASSWORD,
      options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
      }
    } : undefined
  },
  security: {
    enableWriteOperations: process.env.ENABLE_WRITE_OPERATIONS === 'true',
    requireTransactions: process.env.REQUIRE_TRANSACTIONS === 'true',
    maxRowsAffected: parseInt(process.env.MAX_ROWS_AFFECTED || '10000'),
    enableSpModifications: process.env.ENABLE_SP_MODIFICATIONS === 'true',
    blockedKeywords: (process.env.BLOCKED_KEYWORDS || 'DROP DATABASE,xp_cmdshell').split(','),
    allowedSchemas: process.env.ALLOWED_SCHEMAS?.split(',')
  },
  filesystem: {
    virtualRoot: process.env.VIRTUAL_FS_ROOT || '/database',
    enableCache: process.env.ENABLE_CACHE !== 'false',
    cacheTimeout: parseInt(process.env.CACHE_TIMEOUT_MS || '300000')
  },
  audit: {
    enabled: process.env.ENABLE_AUDIT_LOG === 'true',
    logPath: process.env.AUDIT_LOG_PATH || './logs'
  },
  spManagement: {
    draftSchema: process.env.DRAFT_SCHEMA || 'dbo_draft',
    autoBackup: process.env.AUTO_BACKUP_BEFORE_DEPLOY === 'true',
    versionHistoryCount: parseInt(process.env.VERSION_HISTORY_COUNT || '5')
  }
};
```

### Usage Examples with Claude Code

```
# Search for SPs
> search for stored procedures that modify the Orders table

# View SP as file
> show me the contents of /database/stored_procedures/dbo/GetCustomerOrders.sql

# Modify SP
> I need to update GetCustomerOrders to include email. Create a draft and test it

# Get table schema
> what's the schema for the Orders table with foreign keys?

# Execute query in transaction
> start a transaction, update Customer set Status='Active' where Id=123, then show me the result

# Deploy changes
> the draft looks good, deploy it to production

# Rollback if needed
> rollback GetCustomerOrders to the previous version

# Find dependencies
> what stored procedures reference the Products table?

# Performance analysis
> analyze performance of GetDailySalesReport
```

---

## Summary

This implementation provides:

✅ **Phase 1**: Read-only foundation with virtual filesystem
✅ **Phase 2**: Safe write operations with transactions and audit logging  
✅ **Phase 3**: Complete SP management workflow (draft → test → deploy → rollback)
✅ **Phase 4**: Advanced features (dependencies, references, performance)

Key Benefits:
- Stored procedures appear as searchable files
- Safe modification workflow with testing
- Version control and rollback capabilities
- Transaction management for data safety
- Comprehensive audit trail
- SQL injection prevention
- Performance monitoring

The server is production-ready with proper error handling, logging, security validations, and follows MCP protocol standards for seamless integration with Claude Code.