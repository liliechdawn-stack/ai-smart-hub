// ================================================
// SIMPLE QUEUE SERVICE - No Redis Required
// ================================================

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('./database-supabase');
const workflowExecutor = require('./workflow/workflow-executor');

async function addToQueue(workflowId, triggerData, userId, priority = 1) {
  const executionId = uuidv4();
  
  try {
    // Store job in database
    await supabase.from('queue_jobs').insert({
      id: uuidv4(),
      job_id: executionId,
      workflow_id: workflowId,
      user_id: userId,
      status: 'pending',
      priority: priority,
      created_at: new Date().toISOString(),
    });
    
    // Execute immediately (simple queue)
    const result = await workflowExecutor.executeWorkflow(
      workflowId,
      triggerData,
      userId
    );
    
    // Update job status
    await supabase.from('queue_jobs')
      .update({
        status: 'completed',
        result: result,
        completed_at: new Date().toISOString()
      })
      .eq('job_id', executionId);
    
    return { jobId: executionId, result };
    
  } catch (error) {
    await supabase.from('queue_jobs')
      .update({
        status: 'failed',
        error: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('job_id', executionId);
    
    throw error;
  }
}

async function getQueueStats() {
  const { data: pending } = await supabase
    .from('queue_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  
  const { data: running } = await supabase
    .from('queue_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'running');
  
  const { data: completed } = await supabase
    .from('queue_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed');
  
  const { data: failed } = await supabase
    .from('queue_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed');
  
  return {
    pending: pending || 0,
    running: running || 0,
    completed: completed || 0,
    failed: failed || 0
  };
}

module.exports = { addToQueue, getQueueStats };