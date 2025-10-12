# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Database MCP Server Implementation Guide** repository. It currently contains a comprehensive guide (`db_mcp_guide.md`) for building a production-ready Database MCP Server for Microsoft SQL Server with Node.js and TypeScript.

**Current State**: This repository contains only documentation/guide. No actual implementation code exists yet.

## What This Guide Covers

The `db_mcp_guide.md` document is a complete implementation guide organized in 4 phases:

1. **Phase 1: Read-Only Foundation** - Virtual filesystem for database objects, connection pooling, query execution
2. **Phase 2: Safe Writes** - Transaction management, SQL validation, audit logging
3. **Phase 3: SP Management** - Stored procedure lifecycle (draft → test → deploy → rollback) with versioning
4. **Phase 4: Advanced Features** - Dependency analysis, reference finding, performance monitoring

## Key Architecture Concepts

### Virtual Filesystem Protocol
- Database objects (stored procedures, views, functions) are exposed as files
- URI structure: `/database/stored_procedures/{schema}/{name}.sql`
- Enables browsing, searching, and reading database objects like files
- Caching layer for performance

### Security Model
- Separate read-only and read-write connection pools
- SQL validation and injection prevention
- Blocked keywords and suspicious pattern detection
- Maximum rows affected limits
- Comprehensive audit logging

### Stored Procedure Management Workflow
1. Create draft in separate schema (e.g., `dbo_draft`)
2. Test draft with parameters
3. Deploy to production (auto-backs up current version)
4. Rollback to previous version if needed
- Maintains version history in `SPVersionHistory` table

### Transaction Management
- Manual transactions with begin/commit/rollback
- Auto-rollback on errors
- Transaction timeout protection (5 minutes)
- Active transaction tracking

## Implementation Approach

If implementing from this guide:

1. **Start with Phase 1** - Build read-only foundation first
   - Project setup with TypeScript and MCP SDK
   - Database connection manager with pooling
   - Virtual filesystem implementation
   - Basic discovery tools (search, schema inspection)

2. **Add Phase 2 carefully** - Write operations require security
   - Implement SQL validator before any write operations
   - Transaction manager for safe execution
   - Audit logger for compliance
   - Write operation tools

3. **Implement Phase 3** - SP management workflow
   - Version manager for backup/restore
   - Draft schema setup
   - SP draft manager with rewrite logic
   - Deployment and rollback tools

4. **Enhance with Phase 4** - Advanced features
   - Dependency analysis
   - Reference finder
   - Performance monitoring from DMVs

## Technology Stack (from guide)

- **Runtime**: Node.js with TypeScript
- **Database**: `mssql` and `tedious` packages for SQL Server
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Validation**: Zod for schema validation
- **Utilities**: `winston` (logging), `sql-formatter`, `dotenv`

## Testing Strategy (from guide)

- Unit tests for validators, parsers, security components
- Integration tests for end-to-end workflows (create → test → deploy)
- Test fixtures for database state
- Mock connections for isolated testing

## Configuration

The guide includes comprehensive environment variable configuration:
- Database connection strings (separate readonly/readwrite)
- Security settings (write ops, max rows, blocked keywords)
- Filesystem settings (virtual root, caching)
- SP management (draft schema, version count)
- Audit logging paths

## MCP Tools Defined in Guide

**Discovery**: `search_stored_procedures`, `find_sp_references`, `get_dependencies`
**Schema**: `get_table_schema`, `get_sp_definition`
**Execution**: `execute_query_readonly`, `execute_query_write`, `execute_sp`
**Transactions**: `begin_transaction`, `commit_transaction`, `rollback_transaction`
**SP Management**: `create_sp_draft`, `test_sp_draft`, `deploy_sp`, `rollback_sp`, `list_sp_versions`
**Performance**: `analyze_sp_performance`

## File Organization (from guide)

```
src/
├── index.ts                    # Entry point
├── server.ts                   # MCP server setup
├── config/                     # Configuration and logging
├── database/                   # Connection, query execution, transactions
├── filesystem/                 # Virtual filesystem protocol
├── tools/                      # MCP tool implementations
│   ├── discovery/              # Search and discovery
│   ├── schema/                 # Schema inspection
│   ├── execution/              # Query execution
│   ├── sp-management/          # SP lifecycle
│   └── transactions/           # Transaction control
├── security/                   # Validation, sanitization, audit
└── utils/                      # SQL parsing, versioning, errors
```

## Important Security Considerations

- NEVER skip SQL validation for write operations
- ALWAYS use parameterized queries (no string concatenation)
- Block dangerous keywords: `DROP DATABASE`, `xp_cmdshell`, `sp_configure`
- Detect SQL injection patterns
- Require transactions for modifications when configured
- Maintain audit trail of all operations
- Separate connection pools for read and write

## Usage Patterns with Claude Code

The guide includes example interactions:
- "search for stored procedures that modify the Orders table"
- "show me /database/stored_procedures/dbo/GetCustomerOrders.sql"
- "update GetCustomerOrders to include email - create draft and test"
- "deploy the draft to production"
- "rollback GetCustomerOrders to previous version"
- "what stored procedures reference the Products table?"

## Next Steps for Implementation

1. Initialize Node.js project with TypeScript
2. Install dependencies from guide
3. Set up project structure
4. Implement Phase 1 (read-only)
5. Test with Claude Code MCP integration
6. Progressively add Phase 2, 3, 4
