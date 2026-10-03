import express from 'express';
import { getDatabaseStatus } from '../config/database.js';
import { config } from '../config/env.js';

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      service: 'LearnForge API',
      version: '0.1.0',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      database: getDatabaseStatus(),
    },
    meta: {
      requestId: req.id,
    },
  });
});

export default router;
