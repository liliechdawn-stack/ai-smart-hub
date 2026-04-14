// ================================================
// ENTERPRISE QUEUE SERVICE - No Redis Required
// Features: Priority queues, retry logic, dead letter queue
// Batch processing, job timeouts, queue monitoring, worker pool
// ================================================

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('./database-supabase');
const workflowExecutor = require('./workflow/workflow-executor');

// ================================================
// QUEUE CONFIGURATION
// ================================================

const QUEUE_CONFIG = {
  maxRetries: 3,
  retryDelays: [1000, 5000, 15000], // 1s, 5s, 15s
  jobTimeout: 300000, // 5 minutes
  batchSize: 10,
  pollInterval: 1000, // 1 second
  maxConcurrentJobs: 5,
  deadLetterQueueEnabled: true,
  cleanupAge: 604800000 // 7 days
};

// ================================================
// QUEUE SERVICE CLASS
// ================================================

class QueueService {
  constructor() {
    this.isProcessing = false;
    this.activeJobs = new Map(); // jobId -> { timeout, startTime }
    this.workerInterval = null;
    this.statsInterval = null;
    this.jobHandlers = new Map(); // Custom job handlers
  }

  // ================================================
  // INITIALIZE QUEUE SERVICE
  // ================================================
  async initialize() {
    if (this.workerInterval) return;
    
    console.log('🚀 [QUEUE] Initializing queue service...');
    
    // Start worker
    this.workerInterval = setInterval(() => {
      this.processQueue().catch(error => {
        console.error('❌ [QUEUE] Worker error:', error.message);
      });
    }, QUEUE_CONFIG.pollInterval);
    
    // Start stats logger
    this.statsInterval = setInterval(() => {
      this.logStats().catch(error => {
        console.error('❌ [QUEUE] Stats error:', error.message);
      });
    }, 60000); // Every minute
    
    // Clean up old jobs
    this.cleanupOldJobs().catch(error => {
      console.error('❌ [QUEUE] Cleanup error:', error.message);
    });
    
    console.log('✅ [QUEUE] Queue service initialized');
  }

  // ================================================
  // ADD JOB TO QUEUE
  // ================================================
  async addToQueue(workflowId, triggerData, userId, options = {}) {
    const {
      priority = 1, // 0=highest, 1=normal, 2=low
      maxRetries = QUEUE_CONFIG.maxRetries,
      timeout = QUEUE_CONFIG.jobTimeout,
      scheduledFor = null,
      jobName = null,
      metadata = {}
    } = options;
    
    const jobId = uuidv4();
    const now = new Date().toISOString();
    
    console.log(`📋 [QUEUE] Adding job ${jobId} for workflow ${workflowId} (priority: ${priority})`);
    
    try {
      // Validate priority
      const validPriority = [0, 1, 2].includes(priority) ? priority : 1;
      
      // Store job in database
      const { data: job, error } = await supabase
        .from('queue_jobs')
        .insert({
          id: uuidv4(),
          job_id: jobId,
          workflow_id: workflowId,
          user_id: userId,
          status: scheduledFor ? 'scheduled' : 'pending',
          priority: validPriority,
          max_retries: maxRetries,
          retry_count: 0,
          trigger_data: triggerData,
          scheduled_for: scheduledFor || null,
          job_name: jobName || `Workflow: ${workflowId}`,
          metadata: metadata,
          created_at: now,
          updated_at: now
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // If scheduled for future, don't execute immediately
      if (scheduledFor && new Date(scheduledFor) > new Date()) {
        console.log(`⏰ [QUEUE] Job ${jobId} scheduled for ${scheduledFor}`);
        return { jobId, scheduled: true, scheduledFor };
      }
      
      return { jobId, queued: true };
      
    } catch (error) {
      console.error(`❌ [QUEUE] Failed to add job:`, error.message);
      throw error;
    }
  }

  // ================================================
  // ADD BATCH OF JOBS
  // ================================================
  async addBatch(jobs) {
    const results = [];
    
    for (const job of jobs) {
      try {
        const result = await this.addToQueue(
          job.workflowId,
          job.triggerData,
          job.userId,
          job.options || {}
        );
        results.push({ success: true, ...result });
      } catch (error) {
        results.push({ success: false, error: error.message, job });
      }
    }
    
    console.log(`📦 [QUEUE] Batch added: ${results.filter(r => r.success).length}/${jobs.length} jobs`);
    return results;
  }

  // ================================================
  // PROCESS QUEUE
  // ================================================
  async processQueue() {
    if (this.isProcessing) return;
    
    // Check active jobs limit
    if (this.activeJobs.size >= QUEUE_CONFIG.maxConcurrentJobs) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      // Get pending jobs ordered by priority and creation time
      const { data: jobs, error } = await supabase
        .from('queue_jobs')
        .select('*')
        .eq('status', 'pending')
        .is('scheduled_for', null)
        .order('priority', { ascending: true }) // 0=highest first
        .order('created_at', { ascending: true })
        .limit(QUEUE_CONFIG.batchSize - this.activeJobs.size);
      
      if (error) throw error;
      
      if (jobs && jobs.length > 0) {
        console.log(`🔄 [QUEUE] Processing ${jobs.length} jobs (active: ${this.activeJobs.size})`);
        
        for (const job of jobs) {
          // Check if we can process more
          if (this.activeJobs.size >= QUEUE_CONFIG.maxConcurrentJobs) {
            break;
          }
          
          // Process job asynchronously
          this.processJob(job).catch(error => {
            console.error(`❌ [QUEUE] Job ${job.job_id} processing error:`, error.message);
          });
        }
      }
      
      // Also check for scheduled jobs that are due
      await this.processScheduledJobs();
      
    } catch (error) {
      console.error('❌ [QUEUE] Queue processing error:', error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  // ================================================
  // PROCESS SCHEDULED JOBS
  // ================================================
  async processScheduledJobs() {
    try {
      const now = new Date().toISOString();
      
      const { data: jobs, error } = await supabase
        .from('queue_jobs')
        .select('*')
        .eq('status', 'scheduled')
        .lte('scheduled_for', now)
        .limit(QUEUE_CONFIG.batchSize);
      
      if (error) throw error;
      
      if (jobs && jobs.length > 0) {
        console.log(`⏰ [QUEUE] Activating ${jobs.length} scheduled jobs`);
        
        for (const job of jobs) {
          await supabase
            .from('queue_jobs')
            .update({
              status: 'pending',
              updated_at: new Date().toISOString()
            })
            .eq('job_id', job.job_id);
        }
      }
      
    } catch (error) {
      console.error('❌ [QUEUE] Scheduled jobs processing error:', error.message);
    }
  }

  // ================================================
  // PROCESS INDIVIDUAL JOB
  // ================================================
  async processJob(job) {
    const jobId = job.job_id;
    const startTime = Date.now();
    
    // Set timeout
    const timeout = setTimeout(() => {
      this.handleJobTimeout(jobId);
    }, QUEUE_CONFIG.jobTimeout);
    
    this.activeJobs.set(jobId, {
      timeout,
      startTime,
      workflowId: job.workflow_id,
      userId: job.user_id
    });
    
    // Update job status to running
    await supabase
      .from('queue_jobs')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('job_id', jobId);
    
    console.log(`▶️ [QUEUE] Starting job ${jobId} (workflow: ${job.workflow_id})`);
    
    try {
      // Check for custom handler
      let result;
      if (this.jobHandlers.has(job.workflow_id)) {
        const handler = this.jobHandlers.get(job.workflow_id);
        result = await handler(job.trigger_data, job.user_id);
      } else {
        // Execute workflow
        result = await workflowExecutor.executeWorkflow(
          job.workflow_id,
          job.trigger_data || {},
          job.user_id
        );
      }
      
      const executionTime = Date.now() - startTime;
      
      // Update job as completed
      await supabase
        .from('queue_jobs')
        .update({
          status: 'completed',
          result: result,
          execution_time_ms: executionTime,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('job_id', jobId);
      
      console.log(`✅ [QUEUE] Job ${jobId} completed in ${executionTime}ms`);
      
    } catch (error) {
      await this.handleJobFailure(job, error);
      
    } finally {
      // Clear timeout and remove from active jobs
      clearTimeout(timeout);
      this.activeJobs.delete(jobId);
    }
  }

  // ================================================
  // HANDLE JOB FAILURE WITH RETRY
  // ================================================
  async handleJobFailure(job, error) {
    const jobId = job.job_id;
    const newRetryCount = (job.retry_count || 0) + 1;
    const maxRetries = job.max_retries || QUEUE_CONFIG.maxRetries;
    
    console.error(`❌ [QUEUE] Job ${jobId} failed (attempt ${newRetryCount}/${maxRetries}):`, error.message);
    
    if (newRetryCount <= maxRetries) {
      // Calculate delay for retry
      const retryIndex = newRetryCount - 1;
      const retryDelay = QUEUE_CONFIG.retryDelays[retryIndex] || QUEUE_CONFIG.retryDelays[QUEUE_CONFIG.retryDelays.length - 1];
      const retryAt = new Date(Date.now() + retryDelay);
      
      // Update job for retry
      await supabase
        .from('queue_jobs')
        .update({
          status: 'pending',
          retry_count: newRetryCount,
          last_error: error.message,
          retry_at: retryAt.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('job_id', jobId);
      
      console.log(`🔄 [QUEUE] Job ${jobId} will retry at ${retryAt.toISOString()} (delay: ${retryDelay}ms)`);
      
    } else {
      // Max retries exceeded, move to dead letter queue if enabled
      if (QUEUE_CONFIG.deadLetterQueueEnabled) {
        await this.moveToDeadLetterQueue(job, error);
      }
      
      // Mark as failed
      await supabase
        .from('queue_jobs')
        .update({
          status: 'failed',
          last_error: error.message,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('job_id', jobId);
      
      console.error(`💀 [QUEUE] Job ${jobId} failed permanently after ${maxRetries} retries`);
    }
  }

  // ================================================
  // HANDLE JOB TIMEOUT
  // ================================================
  async handleJobTimeout(jobId) {
    const jobInfo = this.activeJobs.get(jobId);
    if (!jobInfo) return;
    
    console.error(`⏰ [QUEUE] Job ${jobId} timed out after ${QUEUE_CONFIG.jobTimeout}ms`);
    
    try {
      await supabase
        .from('queue_jobs')
        .update({
          status: 'failed',
          last_error: `Job timed out after ${QUEUE_CONFIG.jobTimeout}ms`,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('job_id', jobId);
      
      this.activeJobs.delete(jobId);
      
    } catch (error) {
      console.error(`❌ [QUEUE] Failed to update timeout for job ${jobId}:`, error.message);
    }
  }

  // ================================================
  // MOVE TO DEAD LETTER QUEUE
  // ================================================
  async moveToDeadLetterQueue(job, error) {
    try {
      await supabase
        .from('dead_letter_queue')
        .insert({
          id: uuidv4(),
          original_job_id: job.job_id,
          workflow_id: job.workflow_id,
          user_id: job.user_id,
          trigger_data: job.trigger_data,
          error: error.message,
          retry_count: job.retry_count,
          created_at: new Date().toISOString()
        });
      
      console.log(`📋 [QUEUE] Job ${job.job_id} moved to dead letter queue`);
      
    } catch (dlqError) {
      console.error(`❌ [QUEUE] Failed to move job to dead letter queue:`, dlqError.message);
    }
  }

  // ================================================
  // REGISTER CUSTOM JOB HANDLER
  // ================================================
  registerHandler(workflowId, handler) {
    this.jobHandlers.set(workflowId, handler);
    console.log(`📝 [QUEUE] Registered custom handler for workflow ${workflowId}`);
  }

  // ================================================
  // UNREGISTER CUSTOM JOB HANDLER
  // ================================================
  unregisterHandler(workflowId) {
    this.jobHandlers.delete(workflowId);
    console.log(`🗑️ [QUEUE] Unregistered handler for workflow ${workflowId}`);
  }

  // ================================================
  // GET JOB STATUS
  // ================================================
  async getJobStatus(jobId) {
    try {
      const { data: job, error } = await supabase
        .from('queue_jobs')
        .select('*')
        .eq('job_id', jobId)
        .single();
      
      if (error) throw error;
      
      const isActive = this.activeJobs.has(jobId);
      
      return {
        jobId: job.job_id,
        status: job.status,
        workflowId: job.workflow_id,
        priority: job.priority,
        retryCount: job.retry_count,
        maxRetries: job.max_retries,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        executionTimeMs: job.execution_time_ms,
        lastError: job.last_error,
        isActive,
        result: job.result
      };
      
    } catch (error) {
      console.error(`❌ [QUEUE] Failed to get job status:`, error.message);
      return null;
    }
  }

  // ================================================
  // CANCEL JOB
  // ================================================
  async cancelJob(jobId) {
    try {
      // Check if job is currently running
      if (this.activeJobs.has(jobId)) {
        const jobInfo = this.activeJobs.get(jobId);
        clearTimeout(jobInfo.timeout);
        this.activeJobs.delete(jobId);
      }
      
      const { data, error } = await supabase
        .from('queue_jobs')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('job_id', jobId)
        .in('status', ['pending', 'scheduled', 'running'])
        .select();
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        console.log(`🛑 [QUEUE] Job ${jobId} cancelled`);
        return { success: true, cancelled: true };
      }
      
      return { success: false, message: 'Job not found or already completed' };
      
    } catch (error) {
      console.error(`❌ [QUEUE] Failed to cancel job:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // ================================================
  // RETRY FAILED JOB
  // ================================================
  async retryJob(jobId) {
    try {
      const { data, error } = await supabase
        .from('queue_jobs')
        .update({
          status: 'pending',
          retry_count: 0,
          last_error: null,
          retry_at: null,
          completed_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('job_id', jobId)
        .eq('status', 'failed')
        .select();
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        console.log(`🔄 [QUEUE] Job ${jobId} queued for retry`);
        return { success: true, retried: true };
      }
      
      return { success: false, message: 'Job not found or not failed' };
      
    } catch (error) {
      console.error(`❌ [QUEUE] Failed to retry job:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // ================================================
  // GET QUEUE STATISTICS
  // ================================================
  async getQueueStats() {
    try {
      const [
        pendingResult,
        runningResult,
        completedResult,
        failedResult,
        cancelledResult,
        scheduledResult
      ] = await Promise.all([
        supabase.from('queue_jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('queue_jobs').select('id', { count: 'exact', head: true }).eq('status', 'running'),
        supabase.from('queue_jobs').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
        supabase.from('queue_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
        supabase.from('queue_jobs').select('id', { count: 'exact', head: true }).eq('status', 'cancelled'),
        supabase.from('queue_jobs').select('id', { count: 'exact', head: true }).eq('status', 'scheduled')
      ]);
      
      // Get dead letter queue count
      const { count: dlqCount } = await supabase
        .from('dead_letter_queue')
        .select('id', { count: 'exact', head: true });
      
      // Get average execution time
      const { data: avgData } = await supabase
        .from('queue_jobs')
        .select('execution_time_ms')
        .eq('status', 'completed')
        .not('execution_time_ms', 'is', null)
        .limit(100);
      
      let avgExecutionTime = 0;
      if (avgData && avgData.length > 0) {
        const sum = avgData.reduce((acc, job) => acc + (job.execution_time_ms || 0), 0);
        avgExecutionTime = Math.round(sum / avgData.length);
      }
      
      const stats = {
        pending: pendingResult.count || 0,
        running: runningResult.count || 0,
        completed: completedResult.count || 0,
        failed: failedResult.count || 0,
        cancelled: cancelledResult.count || 0,
        scheduled: scheduledResult.count || 0,
        deadLetterQueue: dlqCount || 0,
        activeJobs: this.activeJobs.size,
        maxConcurrent: QUEUE_CONFIG.maxConcurrentJobs,
        avgExecutionTimeMs: avgExecutionTime,
        timestamp: new Date().toISOString()
      };
      
      return stats;
      
    } catch (error) {
      console.error('❌ [QUEUE] Failed to get stats:', error.message);
      return {
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        scheduled: 0,
        deadLetterQueue: 0,
        activeJobs: this.activeJobs.size,
        error: error.message
      };
    }
  }

  // ================================================
  // LOG STATISTICS
  // ================================================
  async logStats() {
    const stats = await this.getQueueStats();
    console.log(`📊 [QUEUE] Stats: P:${stats.pending} R:${stats.running} C:${stats.completed} F:${stats.failed} DLQ:${stats.deadLetterQueue} Avg:${stats.avgExecutionTimeMs}ms`);
  }

  // ================================================
  // CLEAN UP OLD JOBS
  // ================================================
  async cleanupOldJobs() {
    const cutoffDate = new Date(Date.now() - QUEUE_CONFIG.cleanupAge).toISOString();
    
    try {
      // Delete old completed jobs
      const { count: completedDeleted } = await supabase
        .from('queue_jobs')
        .delete()
        .eq('status', 'completed')
        .lt('completed_at', cutoffDate);
      
      // Delete old failed jobs
      const { count: failedDeleted } = await supabase
        .from('queue_jobs')
        .delete()
        .eq('status', 'failed')
        .lt('completed_at', cutoffDate);
      
      // Delete old cancelled jobs
      const { count: cancelledDeleted } = await supabase
        .from('queue_jobs')
        .delete()
        .eq('status', 'cancelled')
        .lt('completed_at', cutoffDate);
      
      const totalDeleted = (completedDeleted || 0) + (failedDeleted || 0) + (cancelledDeleted || 0);
      
      if (totalDeleted > 0) {
        console.log(`🧹 [QUEUE] Cleaned up ${totalDeleted} old jobs (completed: ${completedDeleted || 0}, failed: ${failedDeleted || 0}, cancelled: ${cancelledDeleted || 0})`);
      }
      
      // Clean up dead letter queue (older than 30 days)
      const dlqCutoff = new Date(Date.now() - 2592000000).toISOString(); // 30 days
      const { count: dlqDeleted } = await supabase
        .from('dead_letter_queue')
        .delete()
        .lt('created_at', dlqCutoff);
      
      if (dlqDeleted && dlqDeleted > 0) {
        console.log(`🧹 [QUEUE] Cleaned up ${dlqDeleted} old dead letter queue entries`);
      }
      
    } catch (error) {
      console.error('❌ [QUEUE] Cleanup error:', error.message);
    }
  }

  // ================================================
  // GET DEAD LETTER QUEUE
  // ================================================
  async getDeadLetterQueue(limit = 50, offset = 0) {
    try {
      const { data, error, count } = await supabase
        .from('dead_letter_queue')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      
      if (error) throw error;
      
      return {
        jobs: data || [],
        total: count || 0,
        limit,
        offset
      };
      
    } catch (error) {
      console.error('❌ [QUEUE] Failed to get dead letter queue:', error.message);
      return { jobs: [], total: 0, error: error.message };
    }
  }

  // ================================================
  // RETRY DEAD LETTER JOB
  // ================================================
  async retryDeadLetterJob(dlqId) {
    try {
      // Get the dead letter entry
      const { data: dlqJob, error: fetchError } = await supabase
        .from('dead_letter_queue')
        .select('*')
        .eq('id', dlqId)
        .single();
      
      if (fetchError) throw fetchError;
      
      // Re-add to queue
      const result = await this.addToQueue(
        dlqJob.workflow_id,
        dlqJob.trigger_data,
        dlqJob.user_id,
        { maxRetries: 3 }
      );
      
      // Delete from dead letter queue
      await supabase
        .from('dead_letter_queue')
        .delete()
        .eq('id', dlqId);
      
      console.log(`🔄 [QUEUE] Retried dead letter job ${dlqId}, new job: ${result.jobId}`);
      return { success: true, newJobId: result.jobId };
      
    } catch (error) {
      console.error('❌ [QUEUE] Failed to retry dead letter job:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ================================================
  // CLEAR QUEUE
  // ================================================
  async clearQueue(status = null) {
    try {
      let query = supabase.from('queue_jobs').delete();
      
      if (status) {
        query = query.eq('status', status);
      }
      
      const { count, error } = await query;
      
      if (error) throw error;
      
      console.log(`🧹 [QUEUE] Cleared ${count || 0} jobs${status ? ` with status ${status}` : ''}`);
      return { success: true, cleared: count || 0 };
      
    } catch (error) {
      console.error('❌ [QUEUE] Failed to clear queue:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ================================================
  // SHUTDOWN QUEUE SERVICE
  // ================================================
  async shutdown() {
    console.log('🛑 [QUEUE] Shutting down queue service...');
    
    // Stop workers
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }
    
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    
    // Wait for active jobs to complete (max 30 seconds)
    const maxWaitTime = 30000;
    const startWait = Date.now();
    
    while (this.activeJobs.size > 0 && (Date.now() - startWait) < maxWaitTime) {
      console.log(`   Waiting for ${this.activeJobs.size} active jobs to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Force cancel remaining active jobs
    for (const [jobId, jobInfo] of this.activeJobs) {
      clearTimeout(jobInfo.timeout);
      console.log(`   Cancelling job ${jobId}`);
    }
    
    this.activeJobs.clear();
    this.jobHandlers.clear();
    
    console.log('✅ [QUEUE] Queue service shut down');
  }
}

// Create singleton instance
const queueService = new QueueService();

// Auto-initialize
queueService.initialize().catch(error => {
  console.error('❌ [QUEUE] Failed to initialize:', error.message);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM signal');
  await queueService.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT signal');
  await queueService.shutdown();
  process.exit(0);
});

// Export both the instance and individual functions for backward compatibility
module.exports = {
  // Main queue service instance
  queueService,
  
  // Backward compatible functions
  addToQueue: (workflowId, triggerData, userId, priority) => 
    queueService.addToQueue(workflowId, triggerData, userId, { priority }),
  
  getQueueStats: () => queueService.getQueueStats(),
  
  // New functions
  addBatch: (jobs) => queueService.addBatch(jobs),
  getJobStatus: (jobId) => queueService.getJobStatus(jobId),
  cancelJob: (jobId) => queueService.cancelJob(jobId),
  retryJob: (jobId) => queueService.retryJob(jobId),
  registerHandler: (workflowId, handler) => queueService.registerHandler(workflowId, handler),
  getDeadLetterQueue: (limit, offset) => queueService.getDeadLetterQueue(limit, offset),
  retryDeadLetterJob: (dlqId) => queueService.retryDeadLetterJob(dlqId),
  clearQueue: (status) => queueService.clearQueue(status),
  shutdown: () => queueService.shutdown()
};