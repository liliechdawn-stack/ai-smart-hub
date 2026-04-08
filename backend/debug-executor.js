cat > backend/debug-executor.js << 'EOF'
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('./database-supabase');

class DebugExecutor {
  constructor() {
    this.debugSessions = new Map();
  }
  
  async startDebugSession(workflowId, userId, triggerData = {}) {
    const sessionId = uuidv4();
    
    const session = {
      id: sessionId,
      workflowId,
      userId,
      triggerData,
      currentNode: null,
      executionHistory: [],
      breakpoints: new Set(),
      status: 'debugging',
      startedAt: new Date().toISOString(),
    };
    
    this.debugSessions.set(sessionId, session);
    
    // Store in database
    await supabase.from('debug_sessions').insert({
      id: sessionId,
      workflow_id: workflowId,
      user_id: userId,
      status: 'debugging',
      created_at: new Date().toISOString(),
    });
    
    return sessionId;
  }
  
  async step(sessionId, action = 'next') {
    const session = this.debugSessions.get(sessionId);
    if (!session) throw new Error('Debug session not found');
    
    if (action === 'pause') {
      session.status = 'paused';
      return { status: 'paused', currentNode: session.currentNode };
    }
    
    if (action === 'resume') {
      session.status = 'debugging';
      return await this.executeNextNode(session);
    }
    
    if (action === 'stop') {
      session.status = 'stopped';
      this.debugSessions.delete(sessionId);
      await supabase.from('debug_sessions').update({ status: 'stopped' }).eq('id', sessionId);
      return { status: 'stopped' };
    }
    
    return await this.executeNextNode(session);
  }
  
  async executeNextNode(session) {
    // Get workflow
    const { data: workflow } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', session.workflowId)
      .single();
    
    const nodes = workflow.nodes || [];
    const edges = workflow.edges || [];
    
    // Find next node to execute
    let nextNode = null;
    
    if (!session.currentNode) {
      // First node - find start nodes
      const startNodes = nodes.filter(node => {
        const hasIncoming = edges.some(edge => edge.target === node.id);
        return !hasIncoming;
      });
      nextNode = startNodes[0];
    } else {
      // Find next node based on edges
      const outgoingEdges = edges.filter(edge => edge.source === session.currentNode.id);
      if (outgoingEdges.length > 0) {
        nextNode = nodes.find(n => n.id === outgoingEdges[0].target);
      }
    }
    
    if (!nextNode) {
      // Execution complete
      session.status = 'completed';
      await supabase.from('debug_sessions').update({ status: 'completed' }).eq('id', session.id);
      return { status: 'completed', executionHistory: session.executionHistory };
    }
    
    // Check breakpoint
    if (session.breakpoints.has(nextNode.id)) {
      session.status = 'paused_at_breakpoint';
      return { status: 'paused_at_breakpoint', currentNode: nextNode, breakpoint: true };
    }
    
    // Execute the node in debug mode
    const nodeResult = await this.executeNodeDebug(nextNode, session);
    
    session.currentNode = nextNode;
    session.executionHistory.push({
      nodeId: nextNode.id,
      nodeType: nextNode.type,
      nodeName: nextNode.name,
      timestamp: new Date().toISOString(),
      input: nodeResult.input,
      output: nodeResult.output,
      duration: nodeResult.duration,
    });
    
    // Broadcast debug update via WebSocket
    const io = require('socket.io').of('/');
    io.to(`debug:${session.id}`).emit('debug_step', {
      node: nextNode,
      result: nodeResult,
      history: session.executionHistory,
    });
    
    return {
      status: 'running',
      currentNode: nextNode,
      nodeResult: nodeResult,
      executionHistory: session.executionHistory,
      nodeIndex: session.executionHistory.length,
    };
  }
  
  async executeNodeDebug(node, session) {
    const startTime = Date.now();
    
    // Mock execution for debugging
    const input = session.triggerData;
    
    let output = {};
    switch (node.type) {
      case 'trigger':
        output = { received: true, data: input };
        break;
      case 'send_email':
        output = { sent: true, to: node.config?.to, subject: node.config?.subject };
        break;
      case 'condition':
        const conditionFn = new Function('data', `try { ${node.config?.condition || 'return true;'} } catch(e) { return false; }`);
        const result = conditionFn(input);
        output = { condition: result, evaluated: true };
        break;
      default:
        output = { executed: true, nodeType: node.type };
    }
    
    return {
      input,
      output,
      duration: Date.now() - startTime,
      success: true,
    };
  }
  
  setBreakpoint(sessionId, nodeId) {
    const session = this.debugSessions.get(sessionId);
    if (session) {
      session.breakpoints.add(nodeId);
      return true;
    }
    return false;
  }
  
  removeBreakpoint(sessionId, nodeId) {
    const session = this.debugSessions.get(sessionId);
    if (session) {
      session.breakpoints.delete(nodeId);
      return true;
    }
    return false;
  }
  
  getSession(sessionId) {
    return this.debugSessions.get(sessionId);
  }
}

module.exports = new DebugExecutor();
EOF