// src/database/query-executor.ts

import sql from 'mssql';
import { ConnectionManager } from './connection.js';
import { logger } from '../config/logger.js';

export class QueryExecutor {
  constructor(private connectionManager: ConnectionManager) {}

  async executeReadOnly<T = any>(query: string, params?: Record<string, any>): Promise<T[]> {
    const pool = this.connectionManager.getReadonlyPool();
    const startTime = Date.now();

    try {
      const request = pool.request();

      // Add parameters if provided
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          request.input(key, value);
        }
      }

      const result = await request.query(query);

      logger.info('Query executed', {
        duration: Date.now() - startTime,
        rows: result.recordset?.length || 0
      });

      return result.recordset as T[];
    } catch (error) {
      logger.error('Query execution failed', { query, error });
      throw error;
    }
  }

  async executeScalar<T = any>(query: string, params?: Record<string, any>): Promise<T> {
    const results = await this.executeReadOnly<any>(query, params);
    if (results.length === 0) {
      throw new Error('Query returned no results');
    }
    const firstRow = results[0];
    return Object.values(firstRow)[0] as T;
  }
}
