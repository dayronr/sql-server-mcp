// src/security/validator.ts

import { SecurityConfig } from '../types/index.js';

export class SQLValidator {
  private blockedKeywords: RegExp[];

  constructor(private securityConfig: SecurityConfig) {
    this.blockedKeywords = securityConfig.blockedKeywords.map(
      keyword => new RegExp(`\\b${keyword}\\b`, 'i')
    );
  }

  validate(sql: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for blocked keywords
    for (const pattern of this.blockedKeywords) {
      if (pattern.test(sql)) {
        errors.push(`Blocked keyword found: ${pattern.source}`);
      }
    }

    // Check for suspicious patterns
    if (this.containsSuspiciousPattern(sql)) {
      errors.push('SQL contains suspicious patterns');
    }

    // Check for dynamic SQL that could be injection risk
    if (this.containsUnsafeDynamicSQL(sql)) {
      errors.push('Unsafe dynamic SQL detected');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  isWriteQuery(sql: string): boolean {
    const writeKeywords = ['INSERT', 'UPDATE', 'DELETE', 'MERGE', 'TRUNCATE', 'CREATE', 'ALTER', 'DROP'];
    const normalizedSql = sql.trim().toUpperCase();

    return writeKeywords.some(keyword => normalizedSql.startsWith(keyword));
  }

  private containsSuspiciousPattern(sql: string): boolean {
    const suspiciousPatterns = [
      /;\s*DROP/i,
      /;\s*DELETE/i,
      /EXEC\s*\(/i,
      /xp_cmdshell/i,
      /sp_executesql/i,
      /'.*OR.*'.*=/i  // SQL injection pattern
    ];

    return suspiciousPatterns.some(pattern => pattern.test(sql));
  }

  private containsUnsafeDynamicSQL(sql: string): boolean {
    // Check for EXEC or EXECUTE with string concatenation
    return /EXEC(UTE)?\s*\(\s*@/i.test(sql) || /EXEC(UTE)?\s+@/i.test(sql);
  }
}
