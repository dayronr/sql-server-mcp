// src/security/audit-logger.ts

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../config/logger.js';
import { AuditEntry } from '../types/index.js';

export class AuditLogger {
  private buffer: AuditEntry[] = [];
  private flushInterval: NodeJS.Timeout;

  constructor(
    private logPath: string,
    private bufferSize: number = 100,
    private flushIntervalMs: number = 30000
  ) {
    // Flush buffer periodically
    this.flushInterval = setInterval(() => this.flush(), flushIntervalMs);

    // Ensure log directory exists
    this.ensureLogDirectory();
  }

  async log(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
    this.buffer.push({
      timestamp: new Date(),
      ...entry
    });

    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      const logFile = path.join(this.logPath, `audit-${this.getDateString()}.log`);
      const logLines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';

      await fs.appendFile(logFile, logLines, 'utf8');
    } catch (error) {
      logger.error('Failed to write audit log', error);
      // Put entries back in buffer
      this.buffer.unshift(...entries);
    }
  }

  private async ensureLogDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.logPath, { recursive: true });
    } catch (error) {
      logger.error('Failed to create audit log directory', error);
    }
  }

  private getDateString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  async close(): Promise<void> {
    clearInterval(this.flushInterval);
    await this.flush();
  }
}
