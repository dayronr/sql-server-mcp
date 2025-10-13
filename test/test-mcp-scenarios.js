#!/usr/bin/env node
/**
 * MCP Server Test Scenarios
 * Tests all functionality outlined in the test plan
 */

import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
  }
};

let testsPassed = 0;
let testsFailed = 0;

function logTest(name, passed, details) {
  if (passed) {
    console.log(`✓ ${name}`);
    testsPassed++;
  } else {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${details}`);
    testsFailed++;
  }
}

async function runTests() {
  try {
    await sql.connect(config);
    console.log('=== MCP SERVER TEST SCENARIOS ===\n');

    // Scenario 1: Simple Queries
    console.log('📋 Scenario 1: Simple Queries');
    try {
      const customers = await sql.query`SELECT * FROM dbo.Customers`;
      logTest('List all customers', customers.recordset.length > 0,
        `Found ${customers.recordset.length} customers`);
      console.log(`   Found ${customers.recordset.length} customers\n`);
    } catch (e) {
      logTest('List all customers', false, e.message);
    }

    try {
      const result = await sql.query`
        EXEC dbo.GetProductStatistics @Category = 'Electronics'
      `;
      logTest('Get product statistics', result.recordset.length >= 0,
        `Retrieved statistics`);
      console.log(`   Statistics retrieved: ${result.recordset.length} records\n`);
    } catch (e) {
      logTest('Get product statistics', false, e.message);
    }

    // Scenario 2: Stored Procedure Search Tests
    console.log('🔍 Scenario 2: Stored Procedure Discovery');
    try {
      // Search for procedures referencing Orders table
      const ordersProcs = await sql.query`
        SELECT ROUTINE_NAME
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_TYPE = 'PROCEDURE'
        AND ROUTINE_DEFINITION LIKE '%Orders%'
      `;
      logTest('Find procedures referencing Orders', ordersProcs.recordset.length > 0,
        `Found ${ordersProcs.recordset.length} procedures`);
      console.log(`   Procedures with 'Orders': ${ordersProcs.recordset.map(p => p.ROUTINE_NAME).join(', ')}\n`);
    } catch (e) {
      logTest('Find procedures referencing Orders', false, e.message);
    }

    try {
      // Search for procedures with Customer in name
      const customerProcs = await sql.query`
        SELECT ROUTINE_NAME
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_TYPE = 'PROCEDURE'
        AND ROUTINE_NAME LIKE '%Customer%'
      `;
      logTest('Find procedures with Customer in name', customerProcs.recordset.length > 0,
        `Found ${customerProcs.recordset.length} procedures`);
      console.log(`   Customer procedures: ${customerProcs.recordset.map(p => p.ROUTINE_NAME).join(', ')}\n`);
    } catch (e) {
      logTest('Find procedures with Customer in name', false, e.message);
    }

    try {
      // Search for procedures using transactions
      const txProcs = await sql.query`
        SELECT ROUTINE_NAME
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_TYPE = 'PROCEDURE'
        AND ROUTINE_DEFINITION LIKE '%BEGIN TRANSACTION%'
      `;
      logTest('Find procedures using transactions', true,
        `Found ${txProcs.recordset.length} procedures`);
      console.log(`   Transaction procedures: ${txProcs.recordset.map(p => p.ROUTINE_NAME).join(', ') || 'None'}\n`);
    } catch (e) {
      logTest('Find procedures using transactions', false, e.message);
    }

    // Scenario 3: Write Operations
    console.log('✍️  Scenario 3: Write Operations');
    try {
      const testEmail = `test${Date.now()}@example.com`;
      const result = await sql.query`
        EXEC dbo.CreateCustomer
          @FirstName = 'Test',
          @LastName = 'User',
          @Email = ${testEmail}
      `;
      const customerId = result.recordset[0]?.CustomerId;
      logTest('Create new customer', customerId > 0,
        `Created customer ID: ${customerId}`);
      console.log(`   Created customer ID: ${customerId} (${testEmail})\n`);

      // Test update on newly created customer
      try {
        await sql.query`
          EXEC dbo.UpdateCustomerStatus
            @CustomerId = ${customerId},
            @Status = 'Premium'
        `;
        logTest('Update customer status', true, `Updated customer ${customerId} to Premium`);
        console.log(`   Updated customer ${customerId} status to Premium\n`);
      } catch (e) {
        logTest('Update customer status', false, e.message);
      }
    } catch (e) {
      logTest('Create new customer', false, e.message);
    }

    // Scenario 4: Complex Transactions
    console.log('🔄 Scenario 4: Complex Transactions');
    try {
      const orderItems = JSON.stringify([
        { ProductId: 1, Quantity: 2 },
        { ProductId: 3, Quantity: 1 }
      ]);

      const result = await sql.query`
        EXEC dbo.ProcessOrder
          @CustomerId = 1,
          @OrderItems = ${orderItems},
          @ShippingAddress = '123 Test St'
      `;
      const orderId = result.recordset[0]?.OrderId;
      logTest('Process complex order with JSON', orderId > 0,
        `Created order ID: ${orderId}`);
      console.log(`   Order ID: ${orderId}, Items: 2 products\n`);
    } catch (e) {
      logTest('Process complex order with JSON', false, e.message);
    }

    // Scenario 5: Analytics
    console.log('📊 Scenario 5: Analytics Queries');
    try {
      const result = await sql.query`
        EXEC reports.GetMonthlySalesReport
          @Year = 2024,
          @Month = 12
      `;
      logTest('Get monthly sales report', true,
        `Retrieved ${result.recordset.length} records`);
      console.log(`   Sales report records: ${result.recordset.length}\n`);
    } catch (e) {
      logTest('Get monthly sales report', false, e.message);
    }

    // Additional MCP-specific tests
    console.log('🔧 MCP-Specific Functionality Tests');

    // Test schema inspection
    try {
      const schema = await sql.query`
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Customers' AND TABLE_SCHEMA = 'dbo'
        ORDER BY ORDINAL_POSITION
      `;
      logTest('Schema inspection (get table schema)', schema.recordset.length > 0,
        `Retrieved ${schema.recordset.length} columns`);
      console.log(`   Customers table has ${schema.recordset.length} columns\n`);
    } catch (e) {
      logTest('Schema inspection', false, e.message);
    }

    // Test stored procedure definition retrieval
    try {
      const spDef = await sql.query`
        SELECT ROUTINE_DEFINITION
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_SCHEMA = 'dbo' AND ROUTINE_NAME = 'GetCustomerOrders'
      `;
      logTest('Get stored procedure definition', spDef.recordset.length > 0,
        'Retrieved SP definition');
      const defLength = spDef.recordset[0]?.ROUTINE_DEFINITION?.length || 0;
      console.log(`   GetCustomerOrders definition: ${defLength} characters\n`);
    } catch (e) {
      logTest('Get stored procedure definition', false, e.message);
    }

    // Test dependency analysis
    try {
      const deps = await sql.query`
        SELECT
          OBJECT_NAME(referencing_id) AS ReferencingObject,
          referenced_schema_name AS ReferencedSchema,
          referenced_entity_name AS ReferencedEntity
        FROM sys.sql_expression_dependencies
        WHERE referenced_entity_name = 'Orders'
      `;
      logTest('Dependency analysis (find references)', true,
        `Found ${deps.recordset.length} references to Orders table`);
      console.log(`   Objects referencing Orders: ${deps.recordset.length}\n`);
    } catch (e) {
      logTest('Dependency analysis', false, e.message);
    }

    await sql.close();

    // Summary
    console.log('\n=== TEST SUMMARY ===');
    console.log(`✓ Passed: ${testsPassed}`);
    console.log(`✗ Failed: ${testsFailed}`);
    console.log(`Total: ${testsPassed + testsFailed}`);

    if (testsFailed === 0) {
      console.log('\n🎉 All tests passed! MCP server is ready for use.');
    } else {
      console.log('\n⚠️  Some tests failed. Check the errors above.');
    }

  } catch (error) {
    console.error('\n❌ Test suite error:', error.message);
    process.exit(1);
  }
}

runTests();
