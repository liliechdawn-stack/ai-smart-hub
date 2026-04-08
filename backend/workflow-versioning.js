// ================================================
// WORKFLOW VERSIONING - Simple Version Control
// ================================================

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('./database-supabase');

class WorkflowVersioning {
  async saveVersion(workflowId, userId, name, nodes, edges, changeNote = '') {
    const { data: versions } = await supabase
      .from('workflow_versions')
      .select('version')
      .eq('workflow_id', workflowId)
      .order('version', { ascending: false })
      .limit(1);
    
    const nextVersion = (versions && versions[0]?.version || 0) + 1;
    
    const { data, error } = await supabase
      .from('workflow_versions')
      .insert({
        id: uuidv4(),
        workflow_id: workflowId,
        user_id: userId,
        version: nextVersion,
        name: name,
        nodes: nodes,
        edges: edges,
        change_note: changeNote,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  async getVersions(workflowId, limit = 20) {
    const { data, error } = await supabase
      .from('workflow_versions')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('version', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  }
  
  async rollbackToVersion(workflowId, version) {
    const { data: versionData, error: fetchError } = await supabase
      .from('workflow_versions')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('version', version)
      .single();
    
    if (fetchError) throw new Error('Version not found');
    
    const { data, error } = await supabase
      .from('workflows')
      .update({
        nodes: versionData.nodes,
        edges: versionData.edges,
        name: versionData.name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  async compareVersions(workflowId, version1, version2) {
    const [v1, v2] = await Promise.all([
      supabase.from('workflow_versions').select('*').eq('workflow_id', workflowId).eq('version', version1).single(),
      supabase.from('workflow_versions').select('*').eq('workflow_id', workflowId).eq('version', version2).single(),
    ]);
    
    return {
      version1: { version: version1, nodeCount: v1.data?.nodes?.length || 0 },
      version2: { version: version2, nodeCount: v2.data?.nodes?.length || 0 },
      differences: { hasChanges: JSON.stringify(v1.data?.nodes) !== JSON.stringify(v2.data?.nodes) }
    };
  }
}

module.exports = new WorkflowVersioning();