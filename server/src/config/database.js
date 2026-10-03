import mongoose from 'mongoose';
import { config } from './env.js';

let connectionStatus = 'disconnected';

export async function connectDatabase() {
  if (config.isTest && !process.env.MONGODB_URI) {
    connectionStatus = 'disconnected';
    return;
  }

  try {
    connectionStatus = 'connecting';
    mongoose.connection.on('connected', () => {
      connectionStatus = 'connected';
      console.log('[Database] MongoDB connected successfully');
    });

    mongoose.connection.on('error', (err) => {
      connectionStatus = 'error';
      console.error('[Database] MongoDB connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      connectionStatus = 'disconnected';
      console.warn('[Database] MongoDB disconnected');
    });

    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 3000,
    });
  } catch (error) {
    connectionStatus = 'disconnected';
    console.warn(`[Database] MongoDB connection skipped or unreachable (${error.message}). Server continuing in degraded mode.`);
  }
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    connectionStatus = 'disconnected';
  }
}

export function getDatabaseStatus() {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] || connectionStatus;
}
