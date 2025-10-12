// src/tools/execution/execute-query-write.ts

import { z } from 'zod';
import { TransactionManager } from '../../database/transaction-manager.js';
import { SQLValidator } from '../../security/validator.js';
import { AuditLogger } from '../../security/audit-logger.js';

export const ExecuteQueryWriteSchema = z.object({
  query: z.string().describe('SQL query to execute (INSERT, UPDATE, DELETE, etc.)'),
  parameters: z.record(z.any()).optional().describe('Named parameters for the query'),
  transactionId: z.string().optional().describe('Transaction ID if part of a transaction'),
  requireConfirmation: z.boolean().default(true).describe('Require user confirmation before execution')
});

export async function executeQueryWrite(
  transactionManager: TransactionManager,
  validator: SQLValidator,
  auditLogger: AuditLogger,
  maxRowsAffected: number,
  args: z.infer<typeof ExecuteQueryWriteSchema>
) {
  const { query, parameters, transactionId, requireConfirmation } = args;

  // Validate query
  const validation = validator.validate(query);
  if (!validation.valid) {
    const error = `Query validation failed: ${validation.errors.join(', ')}`;
    await auditLogger.log({
      operation: 'execute_query_write',
      user: 'mcp-user',
      details: { query, parameters },
      success: false,
      error
    });
    throw new Error(error);
  }

  // Ensure it's a write query
  if (!validator.isWriteQuery(query)) {
    throw new Error('Query is not a write operation. Use execute_query_readonly for SELECT queries.');
  }

  try {
    let result: any;
    let usedTransactionId = transactionId;

    if (transactionId) {
      // Execute within existing transaction
      result = await transactionManager.execute(transactionId, query, parameters);
    } else {
      // Create temporary transaction
      usedTransactionId = await transactionManager.begin();

      try {
        result = await transactionManager.execute(usedTransactionId, query, parameters);

        // Check rows affected
        const rowsAffected = result.rowsAffected[0] || 0;
        if (rowsAffected > maxRowsAffected) {
          await transactionManager.rollback(usedTransactionId);
          throw new Error(`Query would affect ${rowsAffected} rows, exceeding limit of ${maxRowsAffected}`);
        }

        // Auto-commit if not part of larger transaction
        await transactionManager.commit(usedTransactionId);
      } catch (error) {
        await transactionManager.rollback(usedTransactionId);
        throw error;
      }
    }

    // Log successful execution
    await auditLogger.log({
      operation: 'execute_query_write',
      user: 'mcp-user',
      details: {
        query,
        parameters,
        rowsAffected: result.rowsAffected[0],
        transactionId: usedTransactionId
      },
      success: true
    });

    return {
      success: true,
      rowsAffected: result.rowsAffected[0],
      transactionId: usedTransactionId,
      message: `Query executed successfully. ${result.rowsAffected[0]} row(s) affected.`
    };

  } catch (error: any) {
    await auditLogger.log({
      operation: 'execute_query_write',
      user: 'mcp-user',
      details: { query, parameters },
      success: false,
      error: error.message
    });
    throw error;
  }
}

export const executeQueryWriteTool = {
  name: 'execute_query_write',
  description: 'Execute a write query (INSERT, UPDATE, DELETE) against the database. Can be part of a transaction or auto-committed. Validates query safety before execution.',
  inputSchema: ExecuteQueryWriteSchema
};
