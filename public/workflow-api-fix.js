// API Fix for Workflow Studio
const WORKFLOW_API = window.location.origin + '/api';

async function executeWorkflowReal(nodes, edges, inputData) {
    const response = await fetch(`${WORKFLOW_API}/workflows/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ nodes, edges, input_data: inputData })
    });
    if (!response.ok) throw new Error(await response.text());
    return await response.json();
}

async function saveWorkflowReal(name, nodes, edges, workflowId) {
    const method = workflowId ? 'PUT' : 'POST';
    const url = workflowId ? `${WORKFLOW_API}/workflows/${workflowId}` : `${WORKFLOW_API}/workflows`;
    const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ name, nodes, edges })
    });
    if (!response.ok) throw new Error(await response.text());
    return await response.json();
}

window.executeWorkflowLocally = async function(inputData) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#10B981;color:white;padding:12px 20px;border-radius:8px;z-index:10000';
    toast.textContent = '🚀 Executing workflow...';
    document.body.appendChild(toast);
    
    try {
        const result = await executeWorkflowReal(workflowNodes, workflowEdges, inputData);
        toast.textContent = '✅ Workflow completed!';
        setTimeout(() => toast.remove(), 2000);
        return result;
    } catch (error) {
        toast.style.background = '#EF4444';
        toast.textContent = '❌ Execution failed: ' + error.message;
        setTimeout(() => toast.remove(), 3000);
        throw error;
    }
};
