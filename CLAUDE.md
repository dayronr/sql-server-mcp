# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **production-ready MCP Server for Microsoft SQL Server**. It implements a complete Model Context Protocol (MCP) server with advanced database management capabilities including virtual filesystem protocol, stored procedure lifecycle management, transaction control, and comprehensive security features.

**Current State**: Fully functional implementation with all 4 phases complete. The repository also includes a comprehensive implementation guide (`db_mcp_guide.md`) for reference.

## Implementation Status

This MCP server has **all 4 phases fully implemented**:

1. **Phase 1: Read-Only Foundation** ✅ - Virtual filesystem for database objects, connection pooling, query execution
2. **Phase 2: Safe Writes** ✅ - Transaction management, SQL validation, audit logging
3. **Phase 3: SP Management** ✅ - Stored procedure lifecycle (draft → test → deploy → rollback) with versioning
4. **Phase 4: Advanced Features** ✅ - Dependency analysis, reference finding, performance monitoring

A detailed implementation guide (`db_mcp_guide.md`) is available for reference.

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

## Technology Stack

- **Runtime**: Node.js with TypeScript
- **Database**: `mssql` and `tedious` packages for SQL Server
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Validation**: Zod for schema validation
- **Utilities**: `winston` (logging), `sql-formatter`, `dotenv`

## Configuration

Environment variables (see `.env.example`):
- Database connection strings (separate readonly/readwrite)
- Security settings (write ops, max rows, blocked keywords)
- Filesystem settings (virtual root, caching)
- SP management (draft schema, version count)
- Audit logging paths

## Available MCP Tools

**Discovery**: `search_stored_procedures`, `find_sp_references`, `get_dependencies`
**Schema**: `get_table_schema`
**Execution**: `execute_query_write`
**Transactions**: `begin_transaction`, `commit_transaction`, `rollback_transaction`
**SP Management**: `create_sp_draft`, `test_sp_draft`, `deploy_sp`, `rollback_sp`, `list_sp_versions`
**Performance**: `analyze_sp_performance`

All tools are implemented in `src/tools/` and registered in `src/server.ts`.

## Project Structure

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

## Getting Started

1. **Setup**
   ```bash
   npm install
   npm run build
   ```

2. **Configuration**
   - Copy `.env.example` to `.env`
   - Configure database connection settings
   - Adjust security settings as needed

3. **Run**
   ```bash
   npm start              # Production
   npm run dev            # Development with auto-reload
   ```

4. **Integrate with Claude Code**
   - Add server configuration to `.claude.json` or `~/.claude.json`
   - See README.md for complete configuration example

## Development

When working on this codebase:

- **Adding new tools**: Create in `src/tools/`, register in `src/server.ts`
- **Security first**: All write operations MUST go through `src/security/validator.ts`
- **Logging**: Use logger from `src/config/logger.ts`, not console.log
- **Testing**: Use the test environment in `test/` directory (see below)
- **Transactions**: Managed by `src/database/transaction-manager.ts`
- **Virtual filesystem**: Extend `src/filesystem/virtual-fs.ts` for new object types

## Test Environment

A complete Docker-based SQL Server test environment is included in the `test/` directory:

**Quick Start:**
```bash
cd test
./setup.sh init
```

**What's included:**
- SQL Server 2022 in Docker (works on M4 Mac via Rosetta 2)
- MCPTestDB database with sample data
- 10 Customers, 15 Products, 10 Orders with relationships
- 13 Stored Procedures covering various scenarios (SELECT, INSERT, UPDATE, DELETE, transactions)
- Views and Functions for testing
- Interactive management script (`setup.sh`) for common operations

**Connection details:**
- Server: `localhost,1433`
- Database: `MCPTestDB`
- Username: `sa`
- Password: `McpTest123!`
- TrustServerCertificate: `true`

See `test/README.md` for complete documentation, testing scenarios, and troubleshooting.

## Key Implementation Files

### Core Infrastructure
- `src/server.ts` - MCP server setup, tool registration, resource handlers
- `src/index.ts` - Entry point, stdio transport initialization
- `src/config/index.ts` - Environment configuration
- `src/config/logger.ts` - Winston logging setup

### Database Layer
- `src/database/connection.ts` - Connection pool manager (read-only and read-write pools)
- `src/database/query-executor.ts` - Query execution with error handling
- `src/database/transaction-manager.ts` - Transaction lifecycle, timeout protection

### Virtual Filesystem
- `src/filesystem/virtual-fs.ts` - MCP resources protocol for database objects
- `src/filesystem/uri-parser.ts` - URI parsing for `/database/*` paths
- `src/filesystem/file-cache.ts` - Caching layer for database object metadata

### Security & Validation
- `src/security/validator.ts` - SQL validation, injection prevention, blocked keywords
- `src/security/audit-logger.ts` - Audit trail for all operations

### Tools
- `src/tools/discovery/` - Search, dependency analysis, reference finding
- `src/tools/schema/` - Table schema inspection
- `src/tools/execution/` - Write query execution
- `src/tools/transactions/` - Transaction control (begin/commit/rollback)
- `src/tools/sp-management/` - Stored procedure draft/deploy/rollback workflow

### Utilities
- `src/utils/version-manager.ts` - SP version history management
- `src/types/index.ts` - TypeScript type definitions

## Potential Extensions

Areas for future enhancement:

1. **Testing Suite**: Unit and integration tests (currently placeholder)
2. **Additional Object Types**: Add support for triggers, user-defined functions to virtual filesystem
3. **Query Builder Tools**: Higher-level tools for common operations
4. **Schema Migrations**: Tools for managing database schema changes
5. **Backup/Restore**: Database backup and restore tools
6. **User Management**: Tools for managing SQL Server users and permissions
7. **Query Plan Analysis**: Deep dive into execution plans, not just statistics
8. **Real-time Monitoring**: Active connection monitoring, blocking queries
