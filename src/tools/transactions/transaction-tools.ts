// src/tools/transactions/transaction-tools.ts

import { z } from 'zod';
import { TransactionManager } from '../../database/transaction-manager.js';
import { AuditLogger } from '../../security/audit-logger.js';

// Begin Transaction
export const BeginTransactionSchema = z.object({
  description: z.string().optional().describe('Optional description of what this transaction will do')
});

export async function beginTransaction(
  transactionManager: TransactionManager,
  auditLogger: AuditLogger,
  args: z.infer<typeof BeginTransactionSchema>
) {
  const transactionId = await transactionManager.begin();

  await auditLogger.log({
    operation: 'begin_transaction',
    user: 'mcp-user',
    details: { transactionId, description: args.description },
    success: true
  });

  return {
    transactionId,
    message: 'Transaction started. Use this ID for subsequent operations.',
    note: 'Remember to commit or rollback when done.'
  };
}

// Commit Transaction
export const CommitTransactionSchema = z.object({
  transactionId: z.string().describe('Transaction ID to commit')
});

export async function commitTransaction(
  transactionManager: TransactionManager,
  auditLogger: AuditLogger,
  args: z.infer<typeof CommitTransactionSchema>
) {
  await transactionManager.commit(args.transactionId);

  await auditLogger.log({
    operation: 'commit_transaction',
    user: 'mcp-user',
    details: { transactionId: args.transactionId },
    success: true
  });

  return {
    success: true,
    message: 'Transaction committed successfully.'
  };
}

// Rollback Transaction
export const RollbackTransactionSchema = z.object({
  transactionId: z.string().describe('Transaction ID to rollback')
});

export async function rollbackTransaction(
  transactionManager: TransactionManager,
  auditLogger: AuditLogger,
  args: z.infer<typeof RollbackTransactionSchema>
) {
  await transactionManager.rollback(args.transactionId);

  await auditLogger.log({
    operation: 'rollback_transaction',
    user: 'mcp-user',
    details: { transactionId: args.transactionId },
    success: true
  });

  return {
    success: true,
    message: 'Transaction rolled back successfully.'
  };
}

export const transactionTools = [
  {
    name: 'begin_transaction',
    description: 'Start a new database transaction. Returns a transaction ID to use for subsequent operations.',
    inputSchema: BeginTransactionSchema
  },
  {
    name: 'commit_transaction',
    description: 'Commit a transaction, making all changes permanent.',
    inputSchema: CommitTransactionSchema
  },
  {
    name: 'rollback_transaction',
    description: 'Rollback a transaction, undoing all changes made within it.',
    inputSchema: RollbackTransactionSchema
  }
];
