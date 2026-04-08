cat > backend/scheduler.js << 'EOF'
const cron = require('node-cron');
const { supabase } = require('./database-supabase');
const workflowExecutor = require('./workflow/workflow-executor');

class WorkflowScheduler {
  constructor() {
    this.scheduledJobs = new Map();
    this.isRunning = false;
  }
  
  async initialize() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    console.log('⏰ Initializing workflow scheduler...');
    await this.loadAndScheduleWorkflows();
    
    // Refresh schedules every 5 minutes
    setInterval(() => this.loadAndScheduleWorkflows(), 300000);
  }
  
  async loadAndScheduleWorkflows() {
    try {
      // Get all active workflows with schedule nodes
      const { data: workflows, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('status', 'active');
      
      if (error) throw error;
      
      for (const workflow of workflows) {
        // Find schedule nodes in this workflow
        const scheduleNodes = workflow.nodes?.filter(n => n.type === 'schedule') || [];
        
        for (const scheduleNode of scheduleNodes) {
          const cronExpression = scheduleNode.config?.cron;
          
          if (cronExpression && cron.validate(cronExpression)) {
            this.scheduleWorkflow(workflow.id, cronExpression, workflow.user_id, scheduleNode.id);
          } else if (cronExpression) {
            console.warn(`Invalid cron expression for workflow ${workflow.id}: ${cronExpression}`);
          }
        }
      }
      
      console.log(`✅ Scheduled ${this.scheduledJobs.size} workflow jobs`);
    } catch (error) {
      console.error('Error loading scheduled workflows:', error);
    }
  }
  
  scheduleWorkflow(workflowId, cronExpression, userId, scheduleNodeId) {
    const jobKey = `${workflowId}_${scheduleNodeId}`;
    
    // Remove existing job if it exists
    if (this.scheduledJobs.has(jobKey)) {
      const oldJob = this.scheduledJobs.get(jobKey);
      oldJob.stop();
      this.scheduledJobs.delete(jobKey);
    }
    
    // Schedule new job
    const job = cron.schedule(cronExpression, async () => {
      console.log(`⏰ Executing scheduled workflow: ${workflowId} at ${new Date().toISOString()}`);
      
      try {
        const result = await workflowExecutor.executeWorkflow(
          workflowId,
          {
            triggered_by: 'schedule',
            scheduled_time: new Date().toISOString(),
            cron: cronExpression,
            schedule_node_id: scheduleNodeId
          },
          userId
        );
        
        console.log(`✅ Scheduled workflow ${workflowId} completed: ${result.executionId}`);
      } catch (error) {
        console.error(`❌ Scheduled workflow ${workflowId} failed:`, error.message);
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });
    
    this.scheduledJobs.set(jobKey, job);
    console.log(`📅 Scheduled workflow ${workflowId} with cron: ${cronExpression}`);
  }
  
  stopAll() {
    for (const [key, job] of this.scheduledJobs) {
      job.stop();
      console.log(`Stopped job: ${key}`);
    }
    this.scheduledJobs.clear();
    this.isRunning = false;
  }
}

module.exports = new WorkflowScheduler();
EOF