// ================================================
// ERROR HANDLER - Simple error handling
// ================================================

const { supabase } = require('./database-supabase');
const workflowExecutor = require('./workflow/workflow-executor');

class WorkflowErrorHandler {
  constructor() {
    this.errorHandlers = new Map();
  }
  
  async registerErrorHandler(workflowId, errorWorkflowId, errorTypes = ['all']) {
    this.errorHandlers.set(workflowId, { errorWorkflowId, errorTypes });
    
    await supabase.from('error_handlers').upsert({
      workflow_id: workflowId,
      error_workflow_id: errorWorkflowId,
      error_types: errorTypes,
      updated_at: new Date().toISOString(),
    });
    
    return true;
  }
  
  async handleError(workflowId, error, executionId, triggerData, userId) {
    const handler = this.errorHandlers.get(workflowId);
    if (!handler) return false;
    
    console.log(`🔄 Executing error handler for workflow ${workflowId}`);
    
    const errorContext = {
      original_workflow_id: workflowId,
      original_execution_id: executionId,
      error: {
        message: error.message,
        timestamp: new Date().toISOString(),
      },
      trigger_data: triggerData,
    };
    
    try {
      const result = await workflowExecutor.executeWorkflow(
        handler.errorWorkflowId,
        errorContext,
        userId
      );
      
      await supabase.from('error_handler_logs').insert({
        id: require('uuid').v4(),
        workflow_id: workflowId,
        error_workflow_id: handler.errorWorkflowId,
        execution_id: executionId,
        error_message: error.message,
        handled: true,
        result: result,
        created_at: new Date().toISOString(),
      });
      
      return true;
    } catch (handlerError) {
      console.error('Error handler failed:', handlerError);
      return false;
    }
  }
  
  async loadErrorHandlers() {
    const { data: handlers } = await supabase.from('error_handlers').select('*');
    if (handlers) {
      handlers.forEach(handler => {
        this.errorHandlers.set(handler.workflow_id, {
          errorWorkflowId: handler.error_workflow_id,
          errorTypes: handler.error_types,
        });
      });
    }
    console.log(`✅ Loaded ${handlers?.length || 0} error handlers`);
  }
}

module.exports = new WorkflowErrorHandler();