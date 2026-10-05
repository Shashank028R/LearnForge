import mongoose from 'mongoose';

/**
 * Executes work within a real MongoDB transaction.
 * In production/live environments:
 * - If MongoDB is disconnected/unavailable, or transaction initialization fails:
 *   fails closed with a deterministic TRANSACTION_UNAVAILABLE error (HTTP 503).
 * In unit/mock test environments (when process.env.NODE_ENV === 'test'):
 *   supports controlled in-memory fallback unless MongoDB connection is active.
 */
export async function runInTransaction(workFn, options = {}) {
  const isTestEnv = options.isTest !== undefined ? options.isTest : (process.env.NODE_ENV === 'test');
  let dbSession = null;

  const isDbConnected = mongoose.connection && mongoose.connection.readyState === 1;

  if (!isDbConnected) {
    if (!isTestEnv) {
      const txError = new Error(
        'Database transaction unavailable: Study persistence requires MongoDB transaction support (MongoDB Atlas / replica set).'
      );
      txError.code = 'TRANSACTION_UNAVAILABLE';
      txError.statusCode = 503;
      txError.status = 503;
      throw txError;
    }
    return await workFn(null);
  }

  try {
    dbSession = await mongoose.startSession();
    dbSession.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
  } catch (sessionErr) {
    if (dbSession) {
      try {
        await dbSession.endSession();
      } catch (_) {}
    }
    if (!isTestEnv) {
      const txError = new Error(
        'Database transaction unavailable: Study persistence requires MongoDB transaction support (MongoDB Atlas / replica set).'
      );
      txError.code = 'TRANSACTION_UNAVAILABLE';
      txError.statusCode = 503;
      txError.status = 503;
      throw txError;
    }
    return await workFn(null);
  }

  try {
    const result = await workFn(dbSession);
    await dbSession.commitTransaction();
    return result;
  } catch (err) {
    try {
      await dbSession.abortTransaction();
    } catch (_) {}
    throw err;
  } finally {
    try {
      await dbSession.endSession();
    } catch (_) {}
  }
}
