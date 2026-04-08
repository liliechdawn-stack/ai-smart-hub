// ================================================
// DEBUG EXECUTOR - Step-by-step debugging
// ================================================

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
      status: 'debugging',
      startedAt: new Date().toISOString(),
    };
    
    this.debugSessions.set(sessionId, session);
    
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
    
    if (action === 'stop') {
      session.status = 'stopped';
      this.debugSessions.delete(sessionId);
      await supabase.from('debug_sessions').update({ status: 'stopped' }).eq('id', sessionId);
      return { status: 'stopped' };
    }
    
    // Get workflow
    const { data: workflow } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', session.workflowId)
      .single();
    
    const nodes = workflow?.nodes || [];
    
    if (!session.currentNode) {
      // First node
      session.currentNode = nodes[0];
      return { status: 'running', currentNode: session.currentNode, nodeIndex: 0 };
    }
    
    // Find next node
    const currentIndex = nodes.findIndex(n => n.id === session.currentNode?.id);
    const nextNode = nodes[currentIndex + 1];
    
    if (!nextNode) {
      session.status = 'completed';
      return { status: 'completed', executionHistory: session.executionHistory };
    }
    
    session.currentNode = nextNode;
    session.executionHistory.push({
      nodeId: nextNode.id,
      nodeType: nextNode.type,
      timestamp: new Date().toISOString(),
    });
    
    return {
      status: 'running',
      currentNode: nextNode,
      executionHistory: session.executionHistory,
      nodeIndex: currentIndex + 1,
    };
  }
  
  setBreakpoint(sessionId, nodeId) {
    const session = this.debugSessions.get(sessionId);
    if (session) return true;
    return false;
  }
  
  removeBreakpoint(sessionId, nodeId) {
    return true;
  }
  
  getSession(sessionId) {
    return this.debugSessions.get(sessionId);
  }
}

module.exports = new DebugExecutor();