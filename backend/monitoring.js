// Track real-time executions
const WebSocket = require('ws');
const wsClients = new Set();

function broadcastExecutionUpdate(execution) {
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'execution_update',
        data: execution
      }));
    }
  });
}

// WebSocket server for real-time updates
function initWebSocket(server) {
  const wss = new WebSocket.Server({ server });
  
  wss.on('connection', (ws) => {
    wsClients.add(ws);
    ws.on('close', () => wsClients.delete(ws));
  });
}

// Hook into workflow executor to send updates
const originalExecuteWorkflow = workflowExecutor.executeWorkflow;
workflowExecutor.executeWorkflow = async function(...args) {
  const promise = originalExecuteWorkflow.apply(this, args);
  
  // Monitor and broadcast updates
  promise.then(result => {
    broadcastExecutionUpdate({
      workflow_id: args[0],
      status: 'completed',
      execution_id: result.executionId,
      timestamp: new Date().toISOString()
    });
  }).catch(error => {
    broadcastExecutionUpdate({
      workflow_id: args[0],
      status: 'failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  });
  
  return promise;
};