// src/types/index.ts

export interface DatabaseConfig {
  server: string;
  port?: number;
  database: string;
  user?: string;
  password?: string;
  options?: {
    encrypt: boolean;
    trustServerCertificate: boolean;
    connectionTimeout?: number;
    requestTimeout?: number;
    enableArithAbort?: boolean;
  };
  pool?: {
    max?: number;
    min?: number;
    idleTimeoutMillis?: number;
  };
}

export interface SecurityConfig {
  enableWriteOperations: boolean;
  requireTransactions: boolean;
  maxRowsAffected: number;
  enableSpModifications: boolean;
  blockedKeywords: string[];
  allowedSchemas?: string[];
}

export interface ServerConfig {
  database: {
    readonly: DatabaseConfig;
    readwrite?: DatabaseConfig;
  };
  security: SecurityConfig;
  filesystem: {
    virtualRoot: string;
    enableCache: boolean;
    cacheTimeout: number;
  };
  audit: {
    enabled: boolean;
    logPath: string;
  };
  spManagement: {
    draftSchema: string;
    autoBackup: boolean;
    versionHistoryCount: number;
  };
}

export interface VirtualPath {
  type: 'stored-procedure' | 'view' | 'function' | 'table';
  schema: string;
  name: string;
  fullPath: string;
}

export interface SPVersion {
  version: number;
  definition: string;
  createdAt: Date;
  createdBy: string;
  comment?: string;
}

export interface Transaction {
  id: string;
  connection: any; // sql.ConnectionPool
  transaction: any; // sql.Transaction
  startTime: Date;
  queries: string[];
}

export interface AuditEntry {
  timestamp: Date;
  operation: string;
  user: string;
  details: any;
  success: boolean;
  error?: string;
}
