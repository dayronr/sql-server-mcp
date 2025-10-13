// Quick test script to verify database connection
import { config } from '../dist/config/index.js';
import { ConnectionManager } from '../dist/database/connection.js';

async function testConnection() {
  console.log('Testing connection to:', config.database.readonly.server);
  console.log('Database:', config.database.readonly.database);

  const connectionManager = new ConnectionManager(config.database.readonly);

  try {
    await connectionManager.initialize();
    console.log('✓ Successfully connected to database!');

    // Test a simple query
    const pool = connectionManager.getReadonlyPool();
    const result = await pool.request().query('SELECT DB_NAME() as DatabaseName, @@VERSION as Version');
    console.log('✓ Database:', result.recordset[0].DatabaseName);
    console.log('✓ SQL Server Version:', result.recordset[0].Version.split('\n')[0]);

    await connectionManager.close();
    console.log('\n✓ Connection test passed!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();
