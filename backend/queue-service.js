cat > backend/queue-service.js << 'EOF'
const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const workflowExecutor = require('./workflow/workflow-executor');
const { supabase } = require('./database-supabase');

// Redis connection
const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
});

// Workflow execution queue
const workflowQueue = new Queue('workflow-executions', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

// Worker to process jobs
const workflowWorker = new Worker('workflow-executions', async (job) => {
  const { workflowId, triggerData, userId, executionId } = job.data;
  
  console.log(`📦 [QUEUE] Processing job ${job.id} for workflow ${workflowId}`);
  
  try {
    const result = await workflowExecutor.executeWorkflow(
      workflowId,
      triggerData,
      userId
    );
    
    // Update job status in database
    await supabase.from('queue_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: result,
    }).eq('job_id', job.id);
    
    return result;
  } catch (error) {
    console.error(`❌ [QUEUE] Job ${job.id} failed:`, error);
    
    await supabase.from('queue_jobs').update({
      status: 'failed',
      error: error.message,
      attempts: job.attemptsMade + 1,
    }).eq('job_id', job.id);
    
    throw error;
  }
}, {
  connection: redisConnection,
  concurrency: 10, // Process 10 jobs simultaneously
  limiter: {
    max: 100, // Max jobs per duration
    duration: 1000, // Per second
  },
});

// Monitor queue events
workflowWorker.on('completed', (job) => {
  console.log(`✅ [QUEUE] Job ${job.id} completed successfully`);
});

workflowWorker.on('failed', (job, err) => {
  console.error(`❌ [QUEUE] Job ${job.id} failed:`, err);
});

workflowWorker.on('progress', (job, progress) => {
  console.log(`📊 [QUEUE] Job ${job.id} progress: ${progress}%`);
});

// Function to add job to queue
async function addToQueue(workflowId, triggerData, userId, priority = 1) {
  const executionId = require('uuid').v4();
  
  // Store job in database
  const { data: jobRecord } = await supabase.from('queue_jobs').insert({
    id: require('uuid').v4(),
    job_id: executionId,
    workflow_id: workflowId,
    user_id: userId,
    status: 'pending',
    priority: priority,
    created_at: new Date().toISOString(),
  }).select().single();
  
  // Add to BullMQ queue
  const job = await workflowQueue.add(`workflow-${workflowId}`, {
    workflowId,
    triggerData,
    userId,
    executionId,
  }, {
    priority,
    delay: 0,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  });
  
  return { jobId: job.id, executionId };
}

// Get queue stats
async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    workflowQueue.getWaitingCount(),
    workflowQueue.getActiveCount(),
    workflowQueue.getCompletedCount(),
    workflowQueue.getFailedCount(),
    workflowQueue.getDelayedCount(),
  ]);
  
  return { waiting, active, completed, failed, delayed };
}

module.exports = { addToQueue, getQueueStats, workflowQueue };
EOF