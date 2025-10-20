// src/config/logger.ts

import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';

// In MCP (stdio) transports, stdout must be reserved strictly for JSON-RPC.
// I'm configuring the console transport to write ALL levels to stderr to avoid
// corrupting the JSON stream that Claude/Desktop reads from stdout.
const allLevels = Object.keys(winston.config.npm.levels);

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      // Route every level to stderr; do not print to stdout
      stderrLevels: allLevels as any,
      // Keep output simple/plain (no ANSI color codes)
      format: winston.format.combine(
        winston.format.simple()
      )
    })
  ]
});

// Add file transport if log file is specified
if (process.env.LOG_FILE) {
  logger.add(new winston.transports.File({
    filename: process.env.LOG_FILE,
    format: winston.format.json()
  }));
}
