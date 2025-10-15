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
      const roPort = this.readonlyConfig.port || 1433;
      logger.info(`Connecting to SQL Server: ${this.readonlyConfig.server}:${roPort}, Database: ${this.readonlyConfig.database}`);
      this.readonlyPool = await new sql.ConnectionPool(this.readonlyConfig).connect();
      logger.info('Read-only connection pool initialized successfully');

      // Initialize read-write pool if configured
      if (this.readwriteConfig) {
        const rwPort = this.readwriteConfig.port || 1433;
        logger.info(`Connecting to SQL Server (read-write): ${this.readwriteConfig.server}:${rwPort}, Database: ${this.readwriteConfig.database}`);
        this.readwritePool = await new sql.ConnectionPool(this.readwriteConfig).connect();
        logger.info('Read-write connection pool initialized successfully');
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';
      const errorCode = error?.code || 'N/A';
      const port = this.readonlyConfig.port || 1433;
      logger.error(`Failed to initialize connection pools: ${errorMessage} (Code: ${errorCode})`);
      logger.error(`Server: ${this.readonlyConfig.server}:${port}, Database: ${this.readonlyConfig.database}`);

      // Provide helpful error messages for common issues
      if (errorMessage.includes('ECONNREFUSED')) {
        logger.error('Connection refused - Is SQL Server running and accessible?');
      } else if (errorMessage.includes('ENOTFOUND')) {
        logger.error('Host not found - Check server name/IP address');
      } else if (errorMessage.includes('Login failed')) {
        logger.error('Authentication failed - Check DB_USER and DB_PASSWORD');
      } else if (errorMessage.includes('timeout')) {
        logger.error('Connection timeout - Check network connectivity and firewall settings');
      }

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
