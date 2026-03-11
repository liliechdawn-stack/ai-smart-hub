// backend/ai-automations.js
const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");

const { authenticateToken } = require("./auth-middleware");
const { supabase } = require("./database-supabase");

// Debug route
router.get("/debug", (req, res) => {
  res.json({
    status: "alive",
    message: "AI Automations router is working!",
    timestamp: new Date().toISOString()
  });
});

// GET all automations
router.get("/automations", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  console.log(`[AI-AUTOMATIONS] GET /automations for user: ${userId}`);

  try {
    const { data: automations, error } = await supabase
      .from('automations')
      .select(`
        id, 
        name as title, 
        icon, 
        trigger_type as trigger, 
        action_type as action, 
        is_active as enabled, 
        status,
        created_at
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Map the data to match frontend expectations
    const mappedAutomations = (automations || []).map(a => ({
      ...a,
      live: a.status === 'active' ? 1 : 0,
      enabled: a.enabled ? 1 : 0
    }));

    console.log(`[AI-AUTOMATIONS] Returning ${mappedAutomations.length} automations`);
    res.json(mappedAutomations);
  } catch (err) {
    console.error("[AI-AUTOMATIONS] Database error:", err.message);
    res.status(500).json({ error: "Database error: " + err.message });
  }
});

// CREATE new automation
router.post("/automations", authenticateToken, bodyParser.json(), async (req, res) => {
  const userId = req.user.id;
  const { title, trigger, action, icon = '⚙️' } = req.body;

  console.log(`[AI-AUTOMATIONS] POST create automation by user ${userId}`);

  if (!title || !trigger || !action) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const { data, error } = await supabase
      .from('automations')
      .insert({
        user_id: userId,
        name: title,
        trigger_type: trigger,
        action_type: action,
        icon: icon,
        is_active: true,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ 
      id: data.id, 
      success: true,
      message: "Automation created successfully" 
    });
  } catch (err) {
    console.error("[AI-AUTOMATIONS] Insert error:", err.message);
    res.status(500).json({ error: "Failed to create automation" });
  }
});

// TOGGLE automation
router.put("/automations/:id/toggle", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  console.log(`[AI-AUTOMATIONS] PUT toggle /automations/${id} by user ${userId}`);

  try {
    // First get current status
    const { data: automation, error: fetchError } = await supabase
      .from('automations')
      .select('is_active, status')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !automation) {
      return res.status(404).json({ error: "Automation not found" });
    }

    // Toggle values
    const newIsActive = !automation.is_active;
    const newStatus = newIsActive ? 'active' : 'paused';

    const { error: updateError } = await supabase
      .from('automations')
      .update({ 
        is_active: newIsActive, 
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId);

    if (updateError) throw updateError;

    res.json({ 
      success: true,
      enabled: newIsActive ? 1 : 0,
      live: newIsActive ? 1 : 0
    });
  } catch (err) {
    console.error("[AI-AUTOMATIONS] Toggle error:", err.message);
    res.status(500).json({ error: "Failed to toggle automation" });
  }
});

// DELETE automation
router.delete("/automations/:id", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  console.log(`[AI-AUTOMATIONS] DELETE /automations/${id} by user ${userId}`);

  try {
    // First check if the automation exists and belongs to the user
    const { data: automation, error: fetchError } = await supabase
      .from('automations')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !automation) {
      return res.status(404).json({ error: "Automation not found" });
    }

    // Delete the automation
    const { error: deleteError } = await supabase
      .from('automations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (deleteError) throw deleteError;

    console.log(`[AI-AUTOMATIONS] Automation ${id} deleted successfully`);
    res.json({ 
      success: true, 
      message: "Automation deleted successfully" 
    });
  } catch (err) {
    console.error("[AI-AUTOMATIONS] Delete error:", err.message);
    res.status(500).json({ error: "Failed to delete automation" });
  }
});

// UPDATE automation
router.put("/automations/:id", authenticateToken, bodyParser.json(), async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { title, trigger, action, icon } = req.body;

  console.log(`[AI-AUTOMATIONS] PUT update /automations/${id} by user ${userId}`);

  const updateData = {};
  
  if (title) updateData.name = title;
  if (trigger) updateData.trigger_type = trigger;
  if (action) updateData.action_type = action;
  if (icon) updateData.icon = icon;
  
  updateData.updated_at = new Date().toISOString();

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  try {
    const { error } = await supabase
      .from('automations')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    res.json({ success: true, message: "Automation updated successfully" });
  } catch (err) {
    console.error("[AI-AUTOMATIONS] Update error:", err.message);
    res.status(500).json({ error: "Failed to update automation" });
  }
});

module.exports = router;