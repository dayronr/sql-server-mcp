#!/usr/bin/env node
// src/index.ts

import { MCPDatabaseServer } from './server.js';
import { config, validateRequiredEnvVars } from './config/index.js';
import { logger } from './config/logger.js';

async function main() {
  try {
    // Validate configuration before starting server
    validateRequiredEnvVars();

    const server = new MCPDatabaseServer(config);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    await server.start();
  } catch (error: any) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// Catch unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

main();
