import mongoose from 'mongoose';

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 50;

/**
 * Classifies whether an error represents a genuine, retryable transaction conflict.
 * Strictly retries:
 * 1. MongoDB TransientTransactionError label
 * 2. MongoDB WriteConflict error (code 112 / codeName 'WriteConflict')
 * 3. First-use TopicLearningStateFence duplicate-key collision (code 11000 on { userId, topicId })
 *
 * NEVER retries arbitrary application/business duplicate keys, validation errors,
 * or corrupted data conflicts.
 */
function isRetryableTransactionError(err) {
  if (!err) return false;
  if (typeof err.hasErrorLabel === 'function' && err.hasErrorLabel('TransientTransactionError')) {
    return true;
  }
  if (err.code === 112 || err.codeName === 'WriteConflict') {
    return true;
  }
  if (err.code === 11000 && err.keyPattern && err.keyPattern.userId && err.keyPattern.topicId) {
    return true;
  }
  return false;
}

/**
 * Executes work within a real MongoDB replica set transaction with full-transaction retry.
 * In production/live environments:
 * - If MongoDB is disconnected/unavailable, fails closed with TRANSACTION_UNAVAILABLE (HTTP 503).
 * In unit/mock test environments (when process.env.NODE_ENV === 'test'):
 * - supports controlled in-memory fallback unless MongoDB connection is active.
 *
 * Operational Lifecycle:
 * A. Callback Execution: workFn(dbSession) is invoked with a fresh transaction session.
 * B. Transaction Abort: On any error, abortTransaction() and endSession() are executed.
 * C. Retryable Classification: isRetryableTransactionError(err) determines eligibility.
 * D. Fresh-Session Restart: If retryable, applies exponential backoff + jitter and restarts workFn in a NEW session.
 * E. Retry Exhaustion: After 3 failed attempts, throws TRANSACTION_CONFLICT_EXHAUSTED (503).
 * F. UnknownTransactionCommitResult: Retries commitTransaction() on the SAME active session without restarting workFn.
 * G. Successful Commit: Ends session and returns callback result.
 */
export async function runInTransaction(workFn, options = {}) {
  const isTestEnv = options.isTest !== undefined ? options.isTest : (process.env.NODE_ENV === 'test');
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

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    attempt += 1;
    let dbSession = null;
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

      // Commit transaction with dedicated UnknownTransactionCommitResult handling
      let committed = false;
      while (!committed) {
        try {
          await dbSession.commitTransaction();
          committed = true;
        } catch (commitErr) {
          if (
            typeof commitErr.hasErrorLabel === 'function' &&
            commitErr.hasErrorLabel('UnknownTransactionCommitResult')
          ) {
            // Safe to retry commit on the SAME active session
            continue;
          }
          throw commitErr;
        }
      }

      await dbSession.endSession();
      return result;
    } catch (err) {
      if (dbSession) {
        try {
          await dbSession.abortTransaction();
        } catch (_) {}
        try {
          await dbSession.endSession();
        } catch (_) {}
      }

      if (isRetryableTransactionError(err) && attempt < MAX_RETRIES) {
        const jitter = Math.floor(Math.random() * 25);
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1) + jitter;
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }

      if (isRetryableTransactionError(err) && attempt >= MAX_RETRIES) {
        const exhaustedErr = new Error(`Transaction conflict retry exhausted after ${MAX_RETRIES} attempts.`);
        exhaustedErr.code = 'TRANSACTION_CONFLICT_EXHAUSTED';
        exhaustedErr.statusCode = 503;
        exhaustedErr.status = 503;
        exhaustedErr.details = [err.message];
        throw exhaustedErr;
      }

      throw err;
    }
  }
}

export default runInTransaction;
