const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");

const { authenticateToken } = require("./auth-middleware");
const { db } = require("./database.js");

// Debug route
router.get("/debug", (req, res) => {
  res.json({
    status: "alive",
    message: "AI Automations router is working!",
    timestamp: new Date().toISOString()
  });
});

// GET all automations
router.get("/automations", authenticateToken, (req, res) => {
  const userId = req.user.id;
  console.log(`[AI-AUTOMATIONS] GET /automations for user: ${userId}`);

  // Removed the problematic columns: trigger_count, success_rate, leads_generated
  db.all(`
    SELECT id, title, icon, trigger, action, enabled, live, created_at
    FROM automations 
    WHERE user_id = ? 
    ORDER BY created_at DESC
  `, [userId], (err, rows) => {
    if (err) {
      console.error("[AI-AUTOMATIONS] Database error:", err.message);
      return res.status(500).json({ error: "Database error: " + err.message });
    }
    console.log(`[AI-AUTOMATIONS] Returning ${rows ? rows.length : 0} automations`);
    res.json(rows || []);
  });
});

// CREATE new automation
router.post("/automations", authenticateToken, bodyParser.json(), (req, res) => {
  const userId = req.user.id;
  const { title, trigger, action, icon = '⚙️' } = req.body;

  console.log(`[AI-AUTOMATIONS] POST create automation by user ${userId}`);

  if (!title || !trigger || !action) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  db.run(`
    INSERT INTO automations (user_id, title, trigger, action, icon, enabled, live, created_at)
    VALUES (?, ?, ?, ?, ?, 1, 1, datetime('now'))
  `, [userId, title, trigger, action, icon], function(err) {
    if (err) {
      console.error("[AI-AUTOMATIONS] Insert error:", err.message);
      return res.status(500).json({ error: "Failed to create automation" });
    }
    res.json({ 
      id: this.lastID, 
      success: true,
      message: "Automation created successfully" 
    });
  });
});

// TOGGLE automation
router.put("/automations/:id/toggle", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  console.log(`[AI-AUTOMATIONS] PUT toggle /automations/${id} by user ${userId}`);

  db.run(`
    UPDATE automations 
    SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END,
        live = CASE WHEN live = 1 THEN 0 ELSE 1 END
    WHERE id = ? AND user_id = ?
  `, [id, userId], function(err) {
    if (err) {
      console.error("[AI-AUTOMATIONS] Toggle error:", err.message);
      return res.status(500).json({ error: "Failed to toggle automation" });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: "Automation not found" });
    }
    res.json({ success: true });
  });
});

// DELETE automation
router.delete("/automations/:id", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  console.log(`[AI-AUTOMATIONS] DELETE /automations/${id} by user ${userId}`);

  // First check if the automation exists and belongs to the user
  db.get(`SELECT id FROM automations WHERE id = ? AND user_id = ?`, [id, userId], (err, row) => {
    if (err) {
      console.error("[AI-AUTOMATIONS] Delete check error:", err.message);
      return res.status(500).json({ error: "Database error" });
    }
    
    if (!row) {
      return res.status(404).json({ error: "Automation not found" });
    }

    // Delete the automation
    db.run(`DELETE FROM automations WHERE id = ? AND user_id = ?`, [id, userId], function(err) {
      if (err) {
        console.error("[AI-AUTOMATIONS] Delete error:", err.message);
        return res.status(500).json({ error: "Failed to delete automation" });
      }
      
      console.log(`[AI-AUTOMATIONS] Automation ${id} deleted successfully`);
      res.json({ 
        success: true, 
        message: "Automation deleted successfully" 
      });
    });
  });
});

// UPDATE automation
router.put("/automations/:id", authenticateToken, bodyParser.json(), (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { title, trigger, action, icon } = req.body;

  console.log(`[AI-AUTOMATIONS] PUT update /automations/${id} by user ${userId}`);

  let updates = [];
  let params = [];

  if (title) {
    updates.push("title = ?");
    params.push(title);
  }
  if (trigger) {
    updates.push("trigger = ?");
    params.push(trigger);
  }
  if (action) {
    updates.push("action = ?");
    params.push(action);
  }
  if (icon) {
    updates.push("icon = ?");
    params.push(icon);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  params.push(id, userId);
  const query = `UPDATE automations SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`;

  db.run(query, params, function(err) {
    if (err) {
      console.error("[AI-AUTOMATIONS] Update error:", err.message);
      return res.status(500).json({ error: "Failed to update automation" });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: "Automation not found" });
    }
    res.json({ success: true, message: "Automation updated successfully" });
  });
});

module.exports = router;