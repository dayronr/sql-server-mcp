#!/usr/bin/env node
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

async function checkDatabase() {
  try {
    console.log('Connecting to database...');
    await sql.connect(config);
    
    // Check tables
    console.log('\n=== TABLES ===');
    const tables = await sql.query`
      SELECT TABLE_SCHEMA, TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `;
    tables.recordset.forEach(t => console.log(`  ${t.TABLE_SCHEMA}.${t.TABLE_NAME}`));
    
    // Check stored procedures
    console.log('\n=== STORED PROCEDURES ===');
    const sps = await sql.query`
      SELECT ROUTINE_SCHEMA, ROUTINE_NAME 
      FROM INFORMATION_SCHEMA.ROUTINES 
      WHERE ROUTINE_TYPE = 'PROCEDURE'
      ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
    `;
    sps.recordset.forEach(sp => console.log(`  ${sp.ROUTINE_SCHEMA}.${sp.ROUTINE_NAME}`));
    
    // Check if test data exists
    console.log('\n=== DATA CHECK ===');
    try {
      const customers = await sql.query`SELECT COUNT(*) as count FROM dbo.Customers`;
      console.log(`  Customers: ${customers.recordset[0].count} rows`);
    } catch(e) {
      console.log(`  Customers table: ${e.message}`);
    }
    
    try {
      const products = await sql.query`SELECT COUNT(*) as count FROM dbo.Products`;
      console.log(`  Products: ${products.recordset[0].count} rows`);
    } catch(e) {
      console.log(`  Products table: ${e.message}`);
    }
    
    await sql.close();
    console.log('\n✓ Database check complete!');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkDatabase();
