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
