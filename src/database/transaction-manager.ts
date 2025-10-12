// src/database/transaction-manager.ts

import sql from 'mssql';
import { ConnectionManager } from './connection.js';
import { logger } from '../config/logger.js';
import { Transaction } from '../types/index.js';

export class TransactionManager {
  private activeTransactions: Map<string, Transaction> = new Map();
  private readonly TRANSACTION_TIMEOUT = 300000; // 5 minutes
  private cleanupInterval: NodeJS.Timeout;

  constructor(private connectionManager: ConnectionManager) {
    // Cleanup old transactions periodically
    this.cleanupInterval = setInterval(() => this.cleanupTimedOutTransactions(), 60000);
  }

  async begin(): Promise<string> {
    const transactionId = this.generateId();
    const connection = this.connectionManager.getReadwritePool();
    const transaction = new sql.Transaction(connection);

    try {
      await transaction.begin();

      this.activeTransactions.set(transactionId, {
        id: transactionId,
        connection,
        transaction,
        startTime: new Date(),
        queries: []
      });

      logger.info('Transaction started', { transactionId });
      return transactionId;
    } catch (error) {
      logger.error('Failed to start transaction', error);
      throw error;
    }
  }

  async execute(transactionId: string, query: string, params?: Record<string, any>): Promise<any> {
    const txn = this.activeTransactions.get(transactionId);
    if (!txn) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    try {
      const request = new sql.Request(txn.transaction);

      // Add parameters
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          request.input(key, value);
        }
      }

      const result = await request.query(query);

      // Track query
      txn.queries.push(query);

      logger.info('Query executed in transaction', {
        transactionId,
        rowsAffected: result.rowsAffected[0]
      });

      return result;
    } catch (error) {
      logger.error('Query failed in transaction', { transactionId, error });
      // Don't auto-rollback here; let caller decide
      throw error;
    }
  }

  async commit(transactionId: string): Promise<void> {
    const txn = this.activeTransactions.get(transactionId);
    if (!txn) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    try {
      await txn.transaction.commit();
      this.activeTransactions.delete(transactionId);

      logger.info('Transaction committed', {
        transactionId,
        queryCount: txn.queries.length
      });
    } catch (error) {
      logger.error('Failed to commit transaction', { transactionId, error });
      throw error;
    }
  }

  async rollback(transactionId: string): Promise<void> {
    const txn = this.activeTransactions.get(transactionId);
    if (!txn) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    try {
      await txn.transaction.rollback();
      this.activeTransactions.delete(transactionId);

      logger.info('Transaction rolled back', {
        transactionId,
        queryCount: txn.queries.length
      });
    } catch (error) {
      logger.error('Failed to rollback transaction', { transactionId, error });
      throw error;
    }
  }

  private cleanupTimedOutTransactions(): void {
    const now = Date.now();

    for (const [id, txn] of this.activeTransactions.entries()) {
      if (now - txn.startTime.getTime() > this.TRANSACTION_TIMEOUT) {
        logger.warn('Transaction timed out, rolling back', { transactionId: id });
        this.rollback(id).catch(err =>
          logger.error('Failed to rollback timed out transaction', err)
        );
      }
    }
  }

  getActiveTransactionCount(): number {
    return this.activeTransactions.size;
  }

  close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  private generateId(): string {
    return `txn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}
