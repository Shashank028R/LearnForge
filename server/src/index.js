import app from './app.js';
import { config } from './config/env.js';
import { connectDatabase } from './config/database.js';

async function startServer() {
  // Initializing server in specified environment
  console.log(`[LearnForge Server] Initializing in ${config.nodeEnv} mode...`);

  // Connect to database gracefully
  await connectDatabase();

  const server = app.listen(config.port, () => {
    console.log(`[LearnForge Server] Listening on port ${config.port}`);
    console.log(`[LearnForge Server] Health check available at http://localhost:${config.port}${config.apiPrefix}/health`);
  });

  // Graceful shutdown handling
  const shutdown = async (signal) => {
    console.log(`\n[LearnForge Server] Received ${signal}. Gracefully shutting down...`);
    server.close(() => {
      console.log('[LearnForge Server] HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
