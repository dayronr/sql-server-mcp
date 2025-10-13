
# SQL Server MCP Test Environment

Complete Docker setup for testing the Database MCP Server. Uses SQL Server 2022 (x86_64 with Rosetta 2 emulation on macOS) for compatibility with macOS Sequoia.

## Quick Start

```bash
# From the repository root
cd test

# Start and initialize everything
./setup.sh init
```

That's it! Your test database is ready.

## Project Structure

```
test/
├── docker-compose.yml           # Docker configuration
├── setup.sh                     # Management script
├── init-scripts/
│   └── 01-create-database.sql  # Database initialization
├── backups/                     # Database backups (git-ignored)
└── README.md                    # This file
```

## What Gets Created

### Database: MCPTestDB

**Tables:**
- `dbo.Customers` (10 sample customers)
- `dbo.Products` (15 products in Electronics, Furniture, Stationery categories)
- `dbo.Orders` (10 orders with various statuses)
- `dbo.OrderItems` (Order line items)
- `dbo.Reviews` (Product reviews)
- `analytics.DailySales` (Analytics table)

**Stored Procedures (13):**
- `dbo.GetCustomerById` - Simple SELECT
- `dbo.GetCustomerOrders` - SELECT with JOIN
- `dbo.GetOrderDetails` - Multiple result sets
- `dbo.CreateCustomer` - INSERT with validation
- `dbo.UpdateCustomerStatus` - UPDATE
- `dbo.ProcessOrder` - Complex transaction with JSON
- `dbo.GetCustomerSummary` - Calls other procedures
- `dbo.GetProductStatistics` - Aggregations
- `dbo.DeleteOldOrders` - DELETE with transaction
- `analytics.UpdateDailySales` - MERGE statement
- `reports.GetMonthlySalesReport` - Reporting

**Views:**
- `dbo.vw_CustomerOrderSummary`
- `dbo.vw_ProductPerformance`

**Functions:**
- `dbo.fn_GetCustomerLifetimeValue`
- `dbo.fn_GetProductAverageRating`

## Management Commands

### Interactive Mode
```bash
./setup.sh
# Shows menu with all options
```

### Command Line Mode

```bash
# Start server
./setup.sh start

# Stop server
./setup.sh stop

# Restart server
./setup.sh restart

# Initialize/reinitialize database
./setup.sh init

# Reset database (warns before deleting data)
./setup.sh reset

# Test connection
./setup.sh test

# Show connection info
./setup.sh info

# Show database statistics
./setup.sh stats

# Create backup
./setup.sh backup

# Open interactive SQL shell
./setup.sh shell

# View container logs
./setup.sh logs
```

## Connection Information

**For MCP Server Configuration:**
```bash
Server=localhost,1433
Database=MCPTestDB
User Id=sa
Password=McpTest123!
TrustServerCertificate=true
```

**Full Connection String:**
```
Server=localhost,1433;Database=MCPTestDB;User Id=sa;Password=McpTest123!;TrustServerCertificate=true
```

## Automated Test Scripts

Three Node.js test scripts are included for comprehensive testing:

### test-connection.js
Basic connection test that verifies:
- Database connectivity
- Connection configuration
- SQL Server version

**Run:**
```bash
npm run test:connection
```

### test-db-objects.js
Database object verification that checks:
- All tables exist
- All stored procedures exist
- Test data is loaded (counts rows)

**Run:**
```bash
npm run test:db
```

### test-mcp-scenarios.js
Comprehensive test suite covering all MCP functionality:
- Simple queries (SELECT)
- Stored procedure discovery and search
- Write operations (INSERT, UPDATE)
- Complex transactions with JSON
- Analytics queries
- Schema inspection
- Stored procedure definition retrieval
- Dependency analysis

**Run:**
```bash
npm run test:scenarios
# or just
npm test
```

### Run All Tests
```bash
npm run test:all
```

**Prerequisites:**
1. Database server must be running: `cd test && ./setup.sh start`
2. Database must be initialized: `./setup.sh init`
3. MCP server must be built: `npm run build`
4. Environment variables must be configured in `.env`

## Testing Scenarios

### 1. Simple Queries
```sql
-- List all customers
SELECT * FROM dbo.Customers;

-- Get product statistics
EXEC dbo.GetProductStatistics @Category = 'Electronics';
```

### 2. Stored Procedure Search Tests
Search for procedures that:
- Reference "Orders" table
- Contain "Customer" in name or body
- Use transactions (BEGIN TRANSACTION)
- Perform INSERT operations

### 3. Write Operations
```sql
-- Create a new customer
EXEC dbo.CreateCustomer 
    @FirstName = 'Test',
    @LastName = 'User',
    @Email = 'test@example.com';

-- Update customer status
EXEC dbo.UpdateCustomerStatus 
    @CustomerId = 1,
    @Status = 'Premium';
```

### 4. Complex Transactions
```sql
-- Process a new order (JSON)
EXEC dbo.ProcessOrder 
    @CustomerId = 1,
    @OrderItems = '[{"ProductId":1,"Quantity":2},{"ProductId":3,"Quantity":1}]',
    @ShippingAddress = '123 Test St';
```

### 5. Analytics
```sql
-- Get monthly report
EXEC reports.GetMonthlySalesReport 
    @Year = 2024,
    @Month = 12;
```

## MCP Server Testing Checklist

Use this database to test all MCP server features:

### Phase 1: Read-Only
- ✅ List stored procedures
- ✅ Read SP definitions via virtual filesystem
- ✅ Search SP bodies for text patterns
- ✅ Get table schemas
- ✅ Get dependencies
- ✅ Execute SELECT queries

### Phase 2: Safe Writes
- ✅ Execute INSERT/UPDATE/DELETE with validation
- ✅ Transaction management (begin/commit/rollback)
- ✅ Row limit enforcement
- ✅ SQL injection prevention
- ✅ Audit logging

### Phase 3: SP Management
- ✅ Create draft SPs
- ✅ Test drafts safely
- ✅ Deploy to production
- ✅ Version tracking
- ✅ Rollback to previous versions

### Phase 4: Advanced Features
- ✅ Find SP dependencies
- ✅ Find table references
- ✅ Performance analysis
- ✅ Cross-schema operations

## Sample MCP Test Queries

Once your MCP server is connected to Claude Code:

```
# Search across stored procedures
> search for stored procedures that reference the Orders table

# View as file
> show me /database/stored_procedures/dbo/GetCustomerOrders.sql

# Get schema
> what's the schema for the Orders table?

# Find dependencies
> what stored procedures call GetCustomerById?

# Modify and test
> I need to add a LastLoginDate field to Customers table and update GetCustomerById to include it. Create a draft and test it.

# Execute queries
> show me all orders from the last 7 days

# Analytics
> what's the total revenue by product category?
```

## Troubleshooting

### Container won't start
```bash
# Check Docker
docker ps -a

# View logs
docker logs mcp-sqlserver

# Remove and recreate
docker rm -f mcp-sqlserver
./setup.sh init
```

### Connection refused
```bash
# Wait for SQL Server to fully start (can take 30-60 seconds)
./setup.sh test

# Check if port is available
lsof -i :1433
```

### Reset everything
```bash
# Stop and remove container
docker-compose down -v

# Start fresh
./setup.sh init
```

### Database not initializing
```bash
# Manually run initialization (note: SQL Server 2022 uses mssql-tools18)
docker exec -i mcp-sqlserver /opt/mssql-tools18/bin/sqlcmd \
    -S localhost -U sa -P "McpTest123!" -C \
    < init-scripts/01-create-database.sql
```

## Performance Notes

**For M4 Mac:**
- SQL Server 2022 runs via Rosetta 2 emulation (x86_64 on ARM)
- First startup may take 30-60 seconds
- Subsequent starts are faster (10-15 seconds)
- Resource usage: ~1GB RAM due to emulation
- Performance is good despite emulation layer

**Container Limits:**
If needed, add to docker-compose.yml:
```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

## Data Persistence

Database data persists in Docker volume `sqlserver-data`:
- Survives container restarts
- Survives container recreation
- Removed only with `docker-compose down -v`

**To completely reset:**
```bash
docker-compose down -v
./setup.sh init
```

## Backup & Restore

### Create Backup
```bash
./setup.sh backup
# Creates: backups/MCPTestDB_YYYYMMDD_HHMMSS.bak
```

### Restore Backup
```bash
# Connect to SQL shell
./setup.sh shell

# Then in SQL:
RESTORE DATABASE MCPTestDB 
FROM DISK = '/var/opt/mssql/backups/MCPTestDB_20241212_120000.bak'
WITH REPLACE;
GO
```

## Security Notes

⚠️ **This is a TEST environment only!**

- Simple SA password for easy testing
- No network isolation
- TrustServerCertificate enabled
- **DO NOT use in production**

For production, update:
- Strong passwords
- Proper certificates
- Network security
- Azure AD authentication

## Next Steps

1. ✅ Start SQL Server: `./setup.sh init`
2. ✅ Verify connection: `./setup.sh test`
3. ✅ Explore data: `./setup.sh shell`
4. ➡️ Configure MCP Server with connection string
5. ➡️ Test MCP server features
6. ➡️ Develop and test your application

## Resources

- [SQL Server Documentation](https://learn.microsoft.com/en-us/sql/sql-server/)
- [SQL Server 2022 on Docker](https://hub.docker.com/_/microsoft-mssql-server)
- [SQL Server on macOS](https://learn.microsoft.com/en-us/sql/linux/quickstart-install-connect-docker)

## Version Notes

**Why SQL Server 2022 instead of Azure SQL Edge?**

This project originally used Azure SQL Edge (ARM64 native) but switched to SQL Server 2022 (x86_64) due to compatibility issues with macOS Sequoia (15.0). Azure SQL Edge crashes during startup on newer macOS versions. SQL Server 2022 runs via Rosetta 2 emulation with excellent performance.

## Support

If you encounter issues:
1. Check logs: `./setup.sh logs`
2. Verify Docker: `docker ps`
3. Test connection: `./setup.sh test`
4. Reset if needed: `docker-compose down -v && ./setup.sh init`
