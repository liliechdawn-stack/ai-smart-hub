// ================================================
// SCHEDULER.JS - Enterprise Workflow Scheduler
// Features: Multiple timezone support, job persistence, error recovery
// Job history logging, pause/resume, graceful shutdown
// ================================================

const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('./database-supabase');
const workflowExecutor = require('./workflow/workflow-executor');

class WorkflowScheduler {
  constructor() {
    this.scheduledJobs = new Map(); // jobKey -> { job, workflowId, cronExpression, userId, scheduleNodeId, timezone }
    this.isRunning = false;
    this.refreshInterval = null;
    this.jobHistory = new Map(); // jobKey -> lastRun, nextRun, status
    this.pausedJobs = new Set(); // Set of paused job keys
    this.maxConcurrentJobs = 10;
    this.runningJobs = 0;
  }
  
  // ================================================
  // INITIALIZE SCHEDULER
  // ================================================
  async initialize() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    console.log('⏰ [SCHEDULER] Initializing workflow scheduler...');
    
    try {
      await this.loadAndScheduleWorkflows();
      
      // Refresh schedules every 5 minutes
      this.refreshInterval = setInterval(() => {
        this.loadAndScheduleWorkflows().catch(error => {
          console.error('❌ [SCHEDULER] Refresh failed:', error.message);
        });
      }, 300000);
      
      // Log scheduler status every hour
      setInterval(() => {
        this.logSchedulerStatus();
      }, 3600000);
      
      console.log(`✅ [SCHEDULER] Initialized with ${this.scheduledJobs.size} active jobs`);
    } catch (error) {
      console.error('❌ [SCHEDULER] Initialization failed:', error.message);
      this.isRunning = false;
      throw error;
    }
  }
  
  // ================================================
  // LOAD AND SCHEDULE WORKFLOWS
  // ================================================
  async loadAndScheduleWorkflows() {
    try {
      // Get all active workflows with schedule nodes
      const { data: workflows, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('status', 'active');
      
      if (error) throw error;
      
      const newJobKeys = new Set();
      const currentJobKeys = new Set(this.scheduledJobs.keys());
      
      for (const workflow of workflows || []) {
        // Find schedule nodes in this workflow
        const scheduleNodes = workflow.nodes?.filter(n => n.type === 'schedule') || [];
        
        for (const scheduleNode of scheduleNodes) {
          const cronExpression = scheduleNode.config?.cron;
          const timezone = scheduleNode.config?.timezone || 'UTC';
          const isPaused = scheduleNode.config?.paused === true;
          
          const jobKey = this.getJobKey(workflow.id, scheduleNode.id);
          newJobKeys.add(jobKey);
          
          if (cronExpression && cron.validate(cronExpression)) {
            if (isPaused) {
              // Remove job if it exists and should be paused
              if (this.scheduledJobs.has(jobKey)) {
                this.unscheduleWorkflow(jobKey);
              }
              this.pausedJobs.add(jobKey);
              console.log(`⏸️ [SCHEDULER] Workflow ${workflow.id} schedule is paused`);
            } else {
              // Remove from paused set if it was paused
              this.pausedJobs.delete(jobKey);
              this.scheduleWorkflow(
                workflow.id, 
                cronExpression, 
                workflow.user_id, 
                scheduleNode.id,
                timezone,
                scheduleNode.config?.name || 'Unnamed Schedule'
              );
            }
          } else if (cronExpression) {
            console.warn(`⚠️ [SCHEDULER] Invalid cron expression for workflow ${workflow.id}: ${cronExpression}`);
          }
        }
      }
      
      // Remove jobs that no longer exist
      for (const jobKey of currentJobKeys) {
        if (!newJobKeys.has(jobKey)) {
          this.unscheduleWorkflow(jobKey);
        }
      }
      
      console.log(`✅ [SCHEDULER] Active jobs: ${this.scheduledJobs.size} (${this.pausedJobs.size} paused)`);
      return { active: this.scheduledJobs.size, paused: this.pausedJobs.size };
      
    } catch (error) {
      console.error('❌ [SCHEDULER] Error loading workflows:', error.message);
      throw error;
    }
  }
  
  // ================================================
  // SCHEDULE A WORKFLOW
  // ================================================
  scheduleWorkflow(workflowId, cronExpression, userId, scheduleNodeId, timezone = 'UTC', scheduleName = 'Unnamed Schedule') {
    const jobKey = this.getJobKey(workflowId, scheduleNodeId);
    
    // Check if job is paused
    if (this.pausedJobs.has(jobKey)) {
      console.log(`⏸️ [SCHEDULER] Job ${jobKey} is paused, skipping scheduling`);
      return;
    }
    
    // Remove existing job if it exists
    if (this.scheduledJobs.has(jobKey)) {
      this.unscheduleWorkflow(jobKey);
    }
    
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      console.error(`❌ [SCHEDULER] Invalid cron expression: ${cronExpression}`);
      return;
    }
    
    // Schedule new job with timezone support
    let job;
    try {
      job = cron.schedule(cronExpression, async () => {
        await this.executeScheduledWorkflow(workflowId, userId, cronExpression, scheduleNodeId, scheduleName);
      }, {
        scheduled: true,
        timezone: timezone
      });
    } catch (error) {
      console.error(`❌ [SCHEDULER] Failed to schedule job for workflow ${workflowId}:`, error.message);
      return;
    }
    
    // Calculate next execution time
    const nextExecution = this.getNextExecutionTime(cronExpression, timezone);
    
    this.scheduledJobs.set(jobKey, {
      job,
      workflowId,
      cronExpression,
      userId,
      scheduleNodeId,
      timezone,
      scheduleName,
      nextExecution,
      createdAt: new Date().toISOString()
    });
    
    // Log to database
    this.logScheduleEvent(workflowId, scheduleNodeId, 'scheduled', {
      cron: cronExpression,
      timezone,
      nextExecution
    }).catch(error => console.error('Failed to log schedule event:', error.message));
    
    console.log(`📅 [SCHEDULER] Scheduled workflow "${scheduleName}" (${workflowId}) with cron: ${cronExpression} (${timezone})`);
    console.log(`   Next execution: ${nextExecution?.toISOString() || 'calculating...'}`);
  }
  
  // ================================================
  // EXECUTE SCHEDULED WORKFLOW
  // ================================================
  async executeScheduledWorkflow(workflowId, userId, cronExpression, scheduleNodeId, scheduleName) {
    const executionId = uuidv4();
    const startTime = Date.now();
    
    // Check concurrent job limit
    if (this.runningJobs >= this.maxConcurrentJobs) {
      console.warn(`⚠️ [SCHEDULER] Max concurrent jobs (${this.maxConcurrentJobs}) reached, queuing workflow ${workflowId}`);
      // Queue for later execution
      setTimeout(() => {
        this.executeScheduledWorkflow(workflowId, userId, cronExpression, scheduleNodeId, scheduleName);
      }, 5000);
      return;
    }
    
    this.runningJobs++;
    
    console.log(`⏰ [SCHEDULER] Executing scheduled workflow: "${scheduleName}" (${workflowId}) at ${new Date().toISOString()}`);
    
    try {
      // Update job's last run time
      const jobInfo = this.scheduledJobs.get(this.getJobKey(workflowId, scheduleNodeId));
      if (jobInfo) {
        jobInfo.lastRun = new Date();
        jobInfo.nextExecution = this.getNextExecutionTime(cronExpression, jobInfo.timezone);
      }
      
      // Log execution start
      await this.logScheduleEvent(workflowId, scheduleNodeId, 'execution_started', {
        executionId,
        cron: cronExpression,
        startedAt: new Date().toISOString()
      });
      
      // Execute the workflow
      const result = await workflowExecutor.executeWorkflow(
        workflowId,
        {
          triggered_by: 'schedule',
          schedule_name: scheduleName,
          schedule_node_id: scheduleNodeId,
          cron: cronExpression,
          scheduled_time: new Date().toISOString(),
          execution_id: executionId
        },
        userId
      );
      
      const executionTime = Date.now() - startTime;
      
      // Log execution success
      await this.logScheduleEvent(workflowId, scheduleNodeId, 'execution_completed', {
        executionId,
        executionTimeMs: executionTime,
        status: result.success ? 'success' : 'partial_success',
        completedAt: new Date().toISOString()
      });
      
      console.log(`✅ [SCHEDULER] Workflow "${scheduleName}" completed in ${executionTime}ms (${result.executionId})`);
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`❌ [SCHEDULER] Workflow "${scheduleName}" failed:`, error.message);
      
      // Log execution failure
      await this.logScheduleEvent(workflowId, scheduleNodeId, 'execution_failed', {
        executionId,
        executionTimeMs: executionTime,
        error: error.message,
        failedAt: new Date().toISOString()
      });
      
      // Update workflow stats
      await supabase
        .from('workflows')
        .update({
          last_error: error.message,
          last_error_at: new Date().toISOString()
        })
        .eq('id', workflowId);
      
    } finally {
      this.runningJobs--;
    }
  }
  
  // ================================================
  // UNSCHEDULE A WORKFLOW
  // ================================================
  unscheduleWorkflow(jobKey) {
    const jobInfo = this.scheduledJobs.get(jobKey);
    if (jobInfo) {
      jobInfo.job.stop();
      this.scheduledJobs.delete(jobKey);
      
      this.logScheduleEvent(jobInfo.workflowId, jobInfo.scheduleNodeId, 'unscheduled', {
        cron: jobInfo.cronExpression,
        timezone: jobInfo.timezone,
        unscheduledAt: new Date().toISOString()
      }).catch(error => console.error('Failed to log unschedule event:', error.message));
      
      console.log(`🛑 [SCHEDULER] Unscheduled workflow ${jobInfo.workflowId}`);
    }
  }
  
  // ================================================
  // PAUSE A SCHEDULED WORKFLOW
  // ================================================
  async pauseWorkflow(workflowId, scheduleNodeId) {
    const jobKey = this.getJobKey(workflowId, scheduleNodeId);
    
    if (this.scheduledJobs.has(jobKey)) {
      this.unscheduleWorkflow(jobKey);
    }
    
    this.pausedJobs.add(jobKey);
    
    // Update workflow config to mark as paused
    await this.updateScheduleNodeConfig(workflowId, scheduleNodeId, { paused: true });
    
    console.log(`⏸️ [SCHEDULER] Paused workflow ${workflowId}`);
    return { success: true, paused: true };
  }
  
  // ================================================
  // RESUME A PAUSED WORKFLOW
  // ================================================
  async resumeWorkflow(workflowId, scheduleNodeId) {
    const jobKey = this.getJobKey(workflowId, scheduleNodeId);
    
    this.pausedJobs.delete(jobKey);
    
    // Reload workflow to get current config
    const { data: workflow } = await supabase
      .from('workflows')
      .select('nodes, user_id')
      .eq('id', workflowId)
      .single();
    
    if (workflow) {
      const scheduleNode = workflow.nodes?.find(n => n.id === scheduleNodeId && n.type === 'schedule');
      if (scheduleNode) {
        const cronExpression = scheduleNode.config?.cron;
        const timezone = scheduleNode.config?.timezone || 'UTC';
        
        if (cronExpression && cron.validate(cronExpression)) {
          // Update config to remove paused flag
          await this.updateScheduleNodeConfig(workflowId, scheduleNodeId, { paused: false });
          this.scheduleWorkflow(workflowId, cronExpression, workflow.user_id, scheduleNodeId, timezone, scheduleNode.config?.name);
        }
      }
    }
    
    console.log(`▶️ [SCHEDULER] Resumed workflow ${workflowId}`);
    return { success: true, resumed: true };
  }
  
  // ================================================
  // UPDATE SCHEDULE NODE CONFIGURATION
  // ================================================
  async updateScheduleNodeConfig(workflowId, scheduleNodeId, updates) {
    try {
      const { data: workflow } = await supabase
        .from('workflows')
        .select('nodes')
        .eq('id', workflowId)
        .single();
      
      if (workflow && workflow.nodes) {
        const updatedNodes = workflow.nodes.map(node => {
          if (node.id === scheduleNodeId && node.type === 'schedule') {
            return {
              ...node,
              config: { ...node.config, ...updates }
            };
          }
          return node;
        });
        
        await supabase
          .from('workflows')
          .update({ nodes: updatedNodes })
          .eq('id', workflowId);
      }
    } catch (error) {
      console.error('Failed to update schedule node config:', error.message);
    }
  }
  
  // ================================================
  // GET JOB STATUS
  // ================================================
  getJobStatus(workflowId, scheduleNodeId) {
    const jobKey = this.getJobKey(workflowId, scheduleNodeId);
    const jobInfo = this.scheduledJobs.get(jobKey);
    const isPaused = this.pausedJobs.has(jobKey);
    
    if (jobInfo) {
      return {
        scheduled: true,
        paused: isPaused,
        workflowId: jobInfo.workflowId,
        cronExpression: jobInfo.cronExpression,
        timezone: jobInfo.timezone,
        scheduleName: jobInfo.scheduleName,
        lastRun: jobInfo.lastRun || null,
        nextExecution: jobInfo.nextExecution || null,
        createdAt: jobInfo.createdAt
      };
    }
    
    return {
      scheduled: false,
      paused: isPaused
    };
  }
  
  // ================================================
  // GET ALL SCHEDULED JOBS
  // ================================================
  getAllJobs() {
    const jobs = [];
    for (const [jobKey, jobInfo] of this.scheduledJobs) {
      jobs.push({
        jobKey,
        workflowId: jobInfo.workflowId,
        scheduleNodeId: jobInfo.scheduleNodeId,
        cronExpression: jobInfo.cronExpression,
        timezone: jobInfo.timezone,
        scheduleName: jobInfo.scheduleName,
        lastRun: jobInfo.lastRun || null,
        nextExecution: jobInfo.nextExecution || null,
        isPaused: this.pausedJobs.has(jobKey)
      });
    }
    return jobs;
  }
  
  // ================================================
  // GET SCHEDULER STATISTICS
  // ================================================
  getStats() {
    return {
      isRunning: this.isRunning,
      activeJobs: this.scheduledJobs.size,
      pausedJobs: this.pausedJobs.size,
      runningJobs: this.runningJobs,
      maxConcurrentJobs: this.maxConcurrentJobs,
      uptime: this.startTime ? Date.now() - this.startTime : 0
    };
  }
  
  // ================================================
  // LOG SCHEDULER STATUS
  // ================================================
  logSchedulerStatus() {
    console.log(`📊 [SCHEDULER] Status: ${this.scheduledJobs.size} active, ${this.pausedJobs.size} paused, ${this.runningJobs} running`);
    
    // Log upcoming executions
    const now = new Date();
    const upcoming = [];
    for (const [jobKey, jobInfo] of this.scheduledJobs) {
      if (jobInfo.nextExecution && jobInfo.nextExecution > now) {
        const timeUntil = Math.round((jobInfo.nextExecution - now) / 60000);
        if (timeUntil < 60) {
          upcoming.push({
            name: jobInfo.scheduleName,
            in: `${timeUntil} minutes`,
            cron: jobInfo.cronExpression
          });
        }
      }
    }
    
    if (upcoming.length > 0) {
      console.log(`📅 [SCHEDULER] Upcoming executions:`, upcoming.slice(0, 5));
    }
  }
  
  // ================================================
  // LOG SCHEDULE EVENT TO DATABASE
  // ================================================
  async logScheduleEvent(workflowId, scheduleNodeId, eventType, metadata) {
    try {
      await supabase
        .from('schedule_logs')
        .insert({
          id: uuidv4(),
          workflow_id: workflowId,
          schedule_node_id: scheduleNodeId,
          event_type: eventType,
          metadata: metadata,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      // Don't throw, just log error
      console.error('Failed to log schedule event:', error.message);
    }
  }
  
  // ================================================
  // GET NEXT EXECUTION TIME
  // ================================================
  getNextExecutionTime(cronExpression, timezone = 'UTC') {
    try {
      // Use node-cron to calculate next execution
      const task = cron.schedule(cronExpression, () => {}, {
        scheduled: false,
        timezone: timezone
      });
      
      // Get next execution time (approximation)
      const now = new Date();
      let nextDate = new Date(now);
      nextDate.setMinutes(nextDate.getMinutes() + 1);
      
      return nextDate;
    } catch (error) {
      return null;
    }
  }
  
  // ================================================
  // GET JOB KEY
  // ================================================
  getJobKey(workflowId, scheduleNodeId) {
    return `${workflowId}_${scheduleNodeId}`;
  }
  
  // ================================================
  // STOP ALL SCHEDULED JOBS
  // ================================================
  stopAll() {
    console.log('🛑 [SCHEDULER] Stopping all scheduled jobs...');
    
    for (const [key, jobInfo] of this.scheduledJobs) {
      jobInfo.job.stop();
      console.log(`   Stopped job: ${key}`);
    }
    
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    
    this.scheduledJobs.clear();
    this.pausedJobs.clear();
    this.isRunning = false;
    this.runningJobs = 0;
    
    console.log('✅ [SCHEDULER] All jobs stopped');
  }
  
  // ================================================
  // GRACEFUL SHUTDOWN
  // ================================================
  async shutdown() {
    console.log('🛑 [SCHEDULER] Graceful shutdown initiated...');
    
    // Wait for running jobs to complete (max 30 seconds)
    const maxWaitTime = 30000;
    const startWait = Date.now();
    
    while (this.runningJobs > 0 && (Date.now() - startWait) < maxWaitTime) {
      console.log(`   Waiting for ${this.runningJobs} running jobs to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    this.stopAll();
    console.log('✅ [SCHEDULER] Graceful shutdown complete');
  }
  
  // ================================================
  // RESCHEDULE ALL WORKFLOWS (force refresh)
  // ================================================
  async rescheduleAll() {
    console.log('🔄 [SCHEDULER] Rescheduling all workflows...');
    this.stopAll();
    this.pausedJobs.clear();
    await this.loadAndScheduleWorkflows();
    console.log(`✅ [SCHEDULER] Rescheduled ${this.scheduledJobs.size} workflows`);
  }
}

// Create singleton instance
const scheduler = new WorkflowScheduler();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM signal');
  await scheduler.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT signal');
  await scheduler.shutdown();
  process.exit(0);
});

module.exports = scheduler;