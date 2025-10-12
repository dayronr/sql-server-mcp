#!/usr/bin/env node
// src/index.ts

import { MCPDatabaseServer } from './server.js';
import { config } from './config/index.js';
import { logger } from './config/logger.js';

async function main() {
  try {
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
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

main();
