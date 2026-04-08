cat > backend/error-handler.js << 'EOF'
const { supabase } = require('./database-supabase');
const workflowExecutor = require('./workflow/workflow-executor');

class WorkflowErrorHandler {
  constructor() {
    this.errorHandlers = new Map();
  }
  
  async registerErrorHandler(workflowId, errorWorkflowId, errorTypes = ['all']) {
    const handler = {
      errorWorkflowId,
      errorTypes,
      created_at: new Date().toISOString(),
    };
    
    this.errorHandlers.set(workflowId, handler);
    
    // Store in database
    await supabase.from('error_handlers').upsert({
      workflow_id: workflowId,
      error_workflow_id: errorWorkflowId,
      error_types: errorTypes,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workflow_id' });
    
    console.log(`✅ Error handler registered: ${workflowId} -> ${errorWorkflowId}`);
  }
  
  async handleError(workflowId, error, executionId, triggerData, userId) {
    const handler = this.errorHandlers.get(workflowId);
    
    if (!handler) {
      console.log(`No error handler for workflow ${workflowId}`);
      return false;
    }
    
    // Check if error type matches
    const matches = handler.errorTypes.includes('all') || 
                    handler.errorTypes.includes(error.type) ||
                    handler.errorTypes.includes(error.code);
    
    if (!matches) {
      console.log(`Error type ${error.type} not handled for workflow ${workflowId}`);
      return false;
    }
    
    console.log(`🔄 Executing error handler for workflow ${workflowId}`);
    
    // Prepare error context
    const errorContext = {
      original_workflow_id: workflowId,
      original_execution_id: executionId,
      error: {
        message: error.message,
        type: error.type,
        code: error.code,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      },
      trigger_data: triggerData,
      handled_by: 'error_handler',
    };
    
    try {
      // Execute the error handling workflow
      const result = await workflowExecutor.executeWorkflow(
        handler.errorWorkflowId,
        errorContext,
        userId
      );
      
      // Log error handling
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
      
      console.log(`✅ Error handled successfully by workflow ${handler.errorWorkflowId}`);
      return true;
      
    } catch (handlerError) {
      console.error(`❌ Error handler failed:`, handlerError);
      
      await supabase.from('error_handler_logs').insert({
        id: require('uuid').v4(),
        workflow_id: workflowId,
        error_workflow_id: handler.errorWorkflowId,
        execution_id: executionId,
        error_message: error.message,
        handler_error: handlerError.message,
        handled: false,
        created_at: new Date().toISOString(),
      });
      
      return false;
    }
  }
  
  async loadErrorHandlers() {
    const { data: handlers, error } = await supabase
      .from('error_handlers')
      .select('*');
    
    if (!error && handlers) {
      handlers.forEach(handler => {
        this.errorHandlers.set(handler.workflow_id, {
          errorWorkflowId: handler.error_workflow_id,
          errorTypes: handler.error_types,
          created_at: handler.created_at,
        });
      });
      console.log(`✅ Loaded ${handlers.length} error handlers`);
    }
  }
}

module.exports = new WorkflowErrorHandler();
EOF