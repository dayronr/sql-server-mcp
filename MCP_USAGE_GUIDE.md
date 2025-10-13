# SQL Server MCP Server - Usage Guide

## Quick Start

### 1. Configuration
The MCP server is configured in `.claude/mcp.json`. After any changes, restart Claude Code.

### 2. Verify Connection
Run `/mcp list` in Claude Code to see available servers. You should see:
- `sql-server` - Connected ✓

## Available MCP Tools

### Discovery Tools
- **search_stored_procedures** - Search for stored procedures by name, content, or schema
- **find_sp_references** - Find all references to a specific table or object
- **get_dependencies** - Analyze dependencies for a stored procedure

### Schema Tools
- **get_table_schema** - Get column definitions for a table
- **get_sp_definition** - Retrieve stored procedure source code

### Execution Tools
- **execute_query_readonly** - Run SELECT queries (safe, read-only)
- **execute_query_write** - Run INSERT/UPDATE/DELETE (requires validation)
- **execute_sp** - Execute a stored procedure with parameters

### Transaction Tools
- **begin_transaction** - Start a manual transaction
- **commit_transaction** - Commit the current transaction
- **rollback_transaction** - Rollback the current transaction

### SP Management Tools (Phase 3)
- **create_sp_draft** - Create a draft version in draft schema
- **test_sp_draft** - Test a draft stored procedure
- **deploy_sp** - Deploy draft to production (with backup)
- **rollback_sp** - Rollback to previous version
- **list_sp_versions** - View version history

### Performance Tools (Phase 4)
- **analyze_sp_performance** - Get execution statistics from DMVs

## Example Usage Scenarios

### Scenario 1: Explore Database Objects
```
You: "Show me all stored procedures that work with the Orders table"
Claude: Uses search_stored_procedures and find_sp_references
```

### Scenario 2: View Virtual Filesystem
```
You: "Show me /database/stored_procedures/dbo/GetCustomerOrders.sql"
Claude: Uses virtual filesystem to display SP as if it were a file
```

### Scenario 3: Run Queries
```
You: "Get all customers with Premium status"
Claude: Uses execute_query_readonly with proper SQL
```

### Scenario 4: Execute Stored Procedures
```
You: "Run GetProductStatistics for Electronics category"
Claude: Uses execute_sp with @Category parameter
```

### Scenario 5: Create & Test SP (Advanced)
```
You: "Update GetCustomerOrders to include customer email"
Claude:
  1. Creates draft using create_sp_draft
  2. Shows the changes
  3. Tests with test_sp_draft
  4. Deploys with deploy_sp (after your approval)
```

### Scenario 6: Rollback Changes
```
You: "The updated GetCustomerOrders is causing errors, rollback"
Claude: Uses rollback_sp to restore previous version
```

### Scenario 7: Transaction Management
```
You: "Update multiple customer records, I'll tell you when to commit"
Claude:
  1. Calls begin_transaction
  2. Runs updates with execute_query_write
  3. Waits for your commit/rollback instruction
  4. Calls commit_transaction or rollback_transaction
```

### Scenario 8: Performance Analysis
```
You: "Which stored procedures are slowest?"
Claude: Uses analyze_sp_performance to query DMVs
```

## Test Your Setup

Run the test scenarios:
```bash
node test-mcp-scenarios.js
```

Expected output: All 12 tests passing ✓

## Example Prompts to Try

**Discovery:**
- "Search for all stored procedures that modify customer data"
- "What tables does the ProcessOrder stored procedure depend on?"
- "Find all objects that reference the Products table"

**Inspection:**
- "Show me the schema for the Orders table"
- "Display the source code for dbo.GetCustomerOrders"
- "What parameters does CreateCustomer accept?"

**Execution:**
- "Get all orders for customer ID 5"
- "Run the monthly sales report for December 2024"
- "Create a new customer named John Doe with email john@example.com"

**Complex Operations:**
- "Create a new order for customer 1 with products 2 and 3"
- "Update customer 5's status to Premium and email to newemail@example.com, but wait for my confirmation before committing"

**SP Management:**
- "Create a draft of GetCustomerOrders that also returns the customer's email"
- "Test the draft GetCustomerOrders with customer ID 1"
- "Deploy the draft to production"
- "Rollback GetCustomerOrders to the previous version"

## Security Features

✅ SQL injection prevention with pattern detection
✅ Blocked keywords: DROP DATABASE, xp_cmdshell, sp_configure
✅ Read-only vs read-write connection pools
✅ Maximum rows affected limits (10,000)
✅ Parameterized queries required
✅ Audit logging of all operations
✅ Transaction timeout protection (5 minutes)

## Troubleshooting

### MCP Server Not Showing
1. Check `.claude/mcp.json` exists
2. Restart Claude Code
3. Run `/mcp list` to verify
4. Check `./logs/server.log` for errors

### Connection Errors
1. Verify SQL Server is running
2. Check credentials in `.env` or `.claude/mcp.json`
3. Run `node test-connection.js` to test manually

### Permission Errors
1. Ensure SA user has proper permissions
2. Check `ENABLE_WRITE_OPERATIONS` setting
3. Verify audit log path is writable

## Database Schema

### Tables
- **dbo.Customers** - Customer information
- **dbo.Products** - Product catalog
- **dbo.Orders** - Order headers
- **dbo.OrderItems** - Order line items
- **dbo.Reviews** - Product reviews
- **analytics.DailySales** - Aggregated sales data

### Stored Procedures
- **dbo.CreateCustomer** - Create new customer
- **dbo.GetCustomerById** - Retrieve customer details
- **dbo.GetCustomerOrders** - Get all orders for a customer
- **dbo.GetCustomerSummary** - Customer with stats
- **dbo.UpdateCustomerStatus** - Update customer status
- **dbo.GetOrderDetails** - Order with items
- **dbo.GetProductStatistics** - Product stats by category
- **dbo.ProcessOrder** - Create order with items (JSON)
- **dbo.DeleteOldOrders** - Archive old orders
- **analytics.UpdateDailySales** - Refresh sales aggregates
- **reports.GetMonthlySalesReport** - Monthly sales summary

## Next Steps

1. ✅ Restart Claude Code to load MCP server
2. ✅ Verify with `/mcp list`
3. ✅ Try example prompts above
4. ✅ Review audit logs in `./logs/`
5. 📚 Read `db_mcp_guide.md` for implementation details
