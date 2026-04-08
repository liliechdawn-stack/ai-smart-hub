cat > backend/workflow-versioning.js << 'EOF'
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('./database-supabase');

class WorkflowVersioning {
  async saveVersion(workflowId, userId, name, nodes, edges, changeNote = '') {
    const version = await this.getNextVersion(workflowId);
    
    const { data, error } = await supabase
      .from('workflow_versions')
      .insert({
        id: uuidv4(),
        workflow_id: workflowId,
        user_id: userId,
        version: version,
        name: name,
        nodes: nodes,
        edges: edges,
        change_note: changeNote,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Keep only last 50 versions
    await this.cleanupOldVersions(workflowId, 50);
    
    return data;
  }
  
  async getNextVersion(workflowId) {
    const { data } = await supabase
      .from('workflow_versions')
      .select('version')
      .eq('workflow_id', workflowId)
      .order('version', { ascending: false })
      .limit(1);
    
    return (data && data[0]?.version || 0) + 1;
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
    // Get the version to rollback to
    const { data: versionData, error: fetchError } = await supabase
      .from('workflow_versions')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('version', version)
      .single();
    
    if (fetchError) throw new Error('Version not found');
    
    // Update current workflow to this version
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
    
    // Create a new version for the rollback
    await this.saveVersion(
      workflowId,
      versionData.user_id,
      `${versionData.name} (rolled back from v${version})`,
      versionData.nodes,
      versionData.edges,
      `Rolled back to version ${version}`
    );
    
    return data;
  }
  
  async compareVersions(workflowId, version1, version2) {
    const [v1, v2] = await Promise.all([
      supabase.from('workflow_versions').select('*').eq('workflow_id', workflowId).eq('version', version1).single(),
      supabase.from('workflow_versions').select('*').eq('workflow_id', workflowId).eq('version', version2).single(),
    ]);
    
    if (v1.error || v2.error) throw new Error('Version not found');
    
    return {
      version1: { version: version1, name: v1.data.name, nodeCount: v1.data.nodes.length, edgeCount: v1.data.edges.length },
      version2: { version: version2, name: v2.data.name, nodeCount: v2.data.nodes.length, edgeCount: v2.data.edges.length },
      differences: {
        nodesAdded: v2.data.nodes.filter(n => !v1.data.nodes.find(on => on.id === n.id)).length,
        nodesRemoved: v1.data.nodes.filter(n => !v2.data.nodes.find(on => on.id === n.id)).length,
        nodesModified: v2.data.nodes.filter(n => {
          const old = v1.data.nodes.find(on => on.id === n.id);
          return old && JSON.stringify(old.config) !== JSON.stringify(n.config);
        }).length,
      },
    };
  }
  
  async cleanupOldVersions(workflowId, keepCount) {
    const { data: versions } = await supabase
      .from('workflow_versions')
      .select('id, version')
      .eq('workflow_id', workflowId)
      .order('version', { ascending: false });
    
    if (versions && versions.length > keepCount) {
      const toDelete = versions.slice(keepCount);
      for (const version of toDelete) {
        await supabase.from('workflow_versions').delete().eq('id', version.id);
      }
      console.log(`Cleaned up ${toDelete.length} old versions for workflow ${workflowId}`);
    }
  }
}

module.exports = new WorkflowVersioning();
EOF