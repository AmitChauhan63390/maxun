/**
 * Recording worker using PgBoss for asynchronous browser recording operations
 */
import PgBoss, { Job } from 'pg-boss';
import logger from './logger';
import {
  initializeRemoteBrowserForRecording,
  destroyRemoteBrowser,
  interpretWholeWorkflow,
  stopRunningInterpretation
} from './browser-management/controller';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define connection string
const pgBossConnectionString = 'postgres://postgres:admin1234@localhost:5432/maxun';

// Define interfaces for job data structures
interface InitializeBrowserData {
  userId: string;
}

interface DestroyBrowserData {
  browserId: string;
}

// Initialize pg-boss instance
const pgBoss = new PgBoss({connectionString: pgBossConnectionString, schema: 'public'});

// Start pg-boss
pgBoss.start()
  .then(() => {
    logger.log('info', 'Recording worker started successfully');
    
    // Register all workers
    registerWorkers();
  })
  .catch((error: Error) => {
    logger.log('error', `Failed to start recording worker: ${error.message}`);
    process.exit(1);
  });

/**
 * Extract data safely from a job (single job or job array)
 */
function extractJobData<T>(job: Job<T> | Job<T>[]): T {
  if (Array.isArray(job)) {
    if (job.length === 0) {
      throw new Error('Empty job array received');
    }
    return job[0].data;
  }
  return job.data;
}

/**
 * Register all browser operation workers
 */
function registerWorkers(): void {
  // Worker for initializing browser recording
  pgBoss.work('initialize-browser-recording', async (job: Job<InitializeBrowserData> | Job<InitializeBrowserData>[]) => {
    try {
      const data = extractJobData(job);
      const userId = data.userId;
      
      logger.log('info', `Starting browser initialization job for user: ${userId}`);
      const browserId = initializeRemoteBrowserForRecording(userId);
      logger.log('info', `Browser recording job completed with browserId: ${browserId}`);
      return { browserId };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.log('error', `Browser recording job failed: ${errorMessage}`);
      throw error;
    }
  });

  // Worker for stopping a browser
  pgBoss.work('destroy-browser', async (job: Job<DestroyBrowserData> | Job<DestroyBrowserData>[]) => {
    try {
      const data = extractJobData(job);
      const browserId = data.browserId;
      
      logger.log('info', `Starting browser destruction job for browser: ${browserId}`);
      const success = await destroyRemoteBrowser(browserId);
      logger.log('info', `Browser destruction job completed with result: ${success}`);
      return { success };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.log('error', `Destroy browser job failed: ${errorMessage}`);
      throw error;
    }
  });

  // Worker for interpreting workflow
  pgBoss.work('interpret-workflow', async () => {
    try {
      logger.log('info', 'Starting workflow interpretation job');
      await interpretWholeWorkflow();
      logger.log('info', 'Workflow interpretation job completed');
      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.log('error', `Interpret workflow job failed: ${errorMessage}`);
      throw error;
    }
  });

  // Worker for stopping workflow interpretation
  pgBoss.work('stop-interpretation', async () => {
    try {
      logger.log('info', 'Starting stop interpretation job');
      await stopRunningInterpretation();
      logger.log('info', 'Stop interpretation job completed');
      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.log('error', `Stop interpretation job failed: ${errorMessage}`);
      throw error;
    }
  });

  logger.log('info', 'All recording workers registered successfully');
}

// Handle shutdown
process.on('SIGINT', async () => {
  logger.log('info', 'Recording worker shutting down...');
  
  try {
    await pgBoss.stop();
    logger.log('info', 'PgBoss stopped gracefully');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.log('error', `Error stopping PgBoss: ${errorMessage}`);
  }
  
  process.exit(0);
});

export { pgBoss };