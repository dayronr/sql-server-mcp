# MSSQL MCP Server

A production-ready Model Context Protocol (MCP) server for Microsoft SQL Server with comprehensive stored procedure management, virtual filesystem protocol, and safe write operations.

## Features

- **Virtual Filesystem**: Browse database objects (stored procedures, views, functions) as files
- **Discovery Tools**: Search stored procedures, inspect table schemas, analyze dependencies
- **Safe Write Operations**: SQL validation, transaction management, audit logging
- **SP Management**: Draft → Test → Deploy → Rollback workflow with version control
- **Performance Analysis**: Query execution statistics from plan cache
- **Security**: SQL injection prevention, blocked keywords, row limits

## Installation

```bash
npm install
npm run build
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key configuration options:

- **DB_SERVER**: SQL Server hostname
- **DB_DATABASE**: Database name
- **DB_USER/DB_PASSWORD**: Credentials
- **ENABLE_WRITE_OPERATIONS**: Enable INSERT/UPDATE/DELETE (default: true)
- **ENABLE_SP_MODIFICATIONS**: Enable stored procedure management (default: true)
- **DRAFT_SCHEMA**: Schema for testing SPs before deployment (default: dbo_draft)

See `.env.example` for all options.

## Usage with Claude Code

Add to your MCP configuration file (`.claude.json` or `~/.claude.json`):

```json
{
  "mcpServers": {
    "mssql": {
      "command": "node",
      "args": ["/absolute/path/to/db_mcp/dist/index.js"],
      "env": {
        "DB_SERVER": "localhost",
        "DB_DATABASE": "MyDatabase",
        "DB_USER": "sa",
        "DB_PASSWORD": "YourPassword",
        "ENABLE_WRITE_OPERATIONS": "true",
        "ENABLE_SP_MODIFICATIONS": "true"
      }
    }
  }
}
```

## Available Tools

### Discovery & Schema
- **search_stored_procedures**: Search SPs by name or content
- **get_table_schema**: Get table structure with columns, indexes, foreign keys
- **get_dependencies**: Analyze object dependencies (callers and references)
- **analyze_sp_performance**: View execution statistics from plan cache

### Execution
- **execute_query_write**: Execute INSERT/UPDATE/DELETE with validation

### Transactions
- **begin_transaction**: Start a new transaction
- **commit_transaction**: Commit changes
- **rollback_transaction**: Undo changes

### Stored Procedure Management
- **create_sp_draft**: Create a draft SP in separate schema
- **test_sp_draft**: Test draft with parameters
- **deploy_sp**: Deploy to production (auto-backs up current version)
- **rollback_sp**: Restore previous version
- **list_sp_versions**: View version history

## Example Workflows

### Searching for Stored Procedures
```
search for stored procedures that modify the Orders table
```

### Viewing Database Objects as Files
```
show me /database/stored_procedures/dbo/GetCustomerOrders.sql
```

### Modifying a Stored Procedure
```
I need to update GetCustomerOrders to include email.
Create a draft, test it with CustomerId=123, then deploy.
```

### Safe Data Modifications
```
Start a transaction, update Customer set Status='Active' where Id=123,
show me the result, then commit.
```

### Performance Analysis
```
Analyze performance of GetDailySalesReport and show execution stats
```

## Architecture

### Phase 1: Read-Only Foundation
- Virtual filesystem for database objects
- Connection pooling (read-only pool)
- Query execution with error handling
- Discovery and schema inspection tools

### Phase 2: Safe Writes
- SQL validation and injection prevention
- Transaction manager with timeout protection
- Audit logging for compliance
- Write operation tools

### Phase 3: SP Management
- Version control with SPVersionHistory table
- Draft schema for safe testing
- Deploy/rollback workflow
- Automatic backups before deployment

### Phase 4: Advanced Features
- Dependency analysis
- Performance monitoring from DMVs
- Reference finding

## Security Features

- **SQL Validation**: Blocks dangerous keywords and patterns
- **Parameterized Queries**: Prevents SQL injection
- **Row Limits**: Prevents accidental mass updates
- **Transaction Timeouts**: Auto-rollback after 5 minutes
- **Audit Trail**: Logs all operations to file
- **Separate Credentials**: Optional read-only and read-write connections

## Development

```bash
# Development mode with auto-reload
npm run dev

# Build
npm run build

# Run production build
npm start

# Lint
npm run lint

# Format
npm run format
```

## Project Structure

```
src/
├── index.ts                    # Entry point
├── server.ts                   # MCP server setup
├── types/                      # TypeScript interfaces
├── config/                     # Configuration and logging
├── database/                   # Connection, query execution, transactions
├── filesystem/                 # Virtual filesystem protocol
├── tools/                      # MCP tool implementations
│   ├── discovery/              # Search and discovery
│   ├── schema/                 # Schema inspection
│   ├── execution/              # Query execution
│   ├── sp-management/          # SP lifecycle
│   └── transactions/           # Transaction control
├── security/                   # Validation, audit logging
└── utils/                      # Version manager, helpers
```

## License

MIT

## Contributing

Contributions are welcome! Please ensure all tools follow security best practices.
