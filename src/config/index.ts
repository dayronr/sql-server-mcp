// src/config/index.ts

import { config as dotenvConfig } from 'dotenv';
import { ServerConfig } from '../types/index.js';

dotenvConfig();

// Parse server string to extract hostname and port
// Supports formats: "localhost", "localhost,1434", "localhost:1434"
function parseServerString(serverStr: string): { server: string; port?: number } {
  // Handle comma notation (SQL Server standard): "localhost,1434"
  if (serverStr.includes(',')) {
    const [server, portStr] = serverStr.split(',');
    const port = parseInt(portStr.trim(), 10);
    return { server: server.trim(), port: isNaN(port) ? undefined : port };
  }

  // Handle colon notation: "localhost:1434"
  if (serverStr.includes(':')) {
    const [server, portStr] = serverStr.split(':');
    const port = parseInt(portStr.trim(), 10);
    return { server: server.trim(), port: isNaN(port) ? undefined : port };
  }

  // Just hostname, use default port 1433
  return { server: serverStr.trim() };
}

// Validate required environment variables
export function validateRequiredEnvVars(): void {
  const required = ['DB_SERVER', 'DB_DATABASE'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      `Please ensure these are set in your MCP server configuration (DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD, DB_TRUST_SERVER_CERTIFICATE)`
    );
  }
}

// Parse server strings to extract hostname and port
const readonlyServerConfig = parseServerString(process.env.DB_SERVER!);
const readwriteServerStr = process.env.DB_RW_SERVER || process.env.DB_SERVER!;
const readwriteServerConfig = parseServerString(readwriteServerStr);

export const config: ServerConfig = {
  database: {
    readonly: {
      server: readonlyServerConfig.server,
      port: readonlyServerConfig.port,
      database: process.env.DB_DATABASE!,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
        connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '15000'),
        requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT || '15000'),
        enableArithAbort: true
      },
      pool: {
        max: parseInt(process.env.DB_POOL_MAX || '10'),
        min: parseInt(process.env.DB_POOL_MIN || '0'),
        idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000')
      }
    },
    readwrite: process.env.ENABLE_WRITE_OPERATIONS === 'true' ? {
      server: readwriteServerConfig.server,
      port: readwriteServerConfig.port,
      database: process.env.DB_RW_DATABASE || process.env.DB_DATABASE!,
      user: process.env.DB_RW_USER || process.env.DB_USER,
      password: process.env.DB_RW_PASSWORD || process.env.DB_PASSWORD,
      options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
        connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '15000'),
        requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT || '15000'),
        enableArithAbort: true
      },
      pool: {
        max: parseInt(process.env.DB_POOL_MAX || '10'),
        min: parseInt(process.env.DB_POOL_MIN || '0'),
        idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000')
      }
    } : undefined
  },
  security: {
    enableWriteOperations: process.env.ENABLE_WRITE_OPERATIONS === 'true',
    requireTransactions: process.env.REQUIRE_TRANSACTIONS === 'true',
    maxRowsAffected: parseInt(process.env.MAX_ROWS_AFFECTED || '10000'),
    enableSpModifications: process.env.ENABLE_SP_MODIFICATIONS === 'true',
    blockedKeywords: (process.env.BLOCKED_KEYWORDS || 'DROP DATABASE,xp_cmdshell').split(','),
    allowedSchemas: process.env.ALLOWED_SCHEMAS?.split(',')
  },
  filesystem: {
    virtualRoot: process.env.VIRTUAL_FS_ROOT || '/database',
    enableCache: process.env.ENABLE_CACHE !== 'false',
    cacheTimeout: parseInt(process.env.CACHE_TIMEOUT_MS || '300000')
  },
  audit: {
    enabled: process.env.ENABLE_AUDIT_LOG === 'true',
    logPath: process.env.AUDIT_LOG_PATH || './logs'
  },
  spManagement: {
    draftSchema: process.env.DRAFT_SCHEMA || 'dbo_draft',
    autoBackup: process.env.AUTO_BACKUP_BEFORE_DEPLOY === 'true',
    versionHistoryCount: parseInt(process.env.VERSION_HISTORY_COUNT || '5')
  }
};
