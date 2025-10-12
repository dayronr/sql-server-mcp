// src/config/index.ts

import { config as dotenvConfig } from 'dotenv';
import { ServerConfig } from '../types/index.js';

dotenvConfig();

export const config: ServerConfig = {
  database: {
    readonly: {
      server: process.env.DB_SERVER!,
      database: process.env.DB_DATABASE!,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
      }
    },
    readwrite: process.env.ENABLE_WRITE_OPERATIONS === 'true' ? {
      server: process.env.DB_RW_SERVER || process.env.DB_SERVER!,
      database: process.env.DB_RW_DATABASE || process.env.DB_DATABASE!,
      user: process.env.DB_RW_USER || process.env.DB_USER,
      password: process.env.DB_RW_PASSWORD || process.env.DB_PASSWORD,
      options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
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
