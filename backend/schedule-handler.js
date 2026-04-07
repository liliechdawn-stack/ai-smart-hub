// ================================================
// SCHEDULE HANDLER - CRON JOB EXECUTION
// ================================================

const cronParser = require('cron-parser');
const { supabase } = require('./database-supabase');
const workflowExecutor = require('./workflow/workflow-executor');

class ScheduleHandler {
  constructor() {
    this.intervals = new Map();
    this.start();
  }
  
  async start() {
    console.log('⏰ Starting schedule handler...');
    await this.loadSchedules();
    
    // Check every minute for schedules that need to run
    setInterval(() => this.checkSchedules(), 60000);
  }
  
  async loadSchedules() {
    try {
      const { data: schedules, error } = await supabase
        .from('schedule_registrations')
        .select('*, workflows!inner(*)')
        .eq('is_active', true);
      
      if (error) throw error;
      
      for (const schedule of schedules) {
        this.updateNextRunTime(schedule);
      }
      
      console.log(`📅 Loaded ${schedules.length} active schedules`);
    } catch (error) {
      console.error('Error loading schedules:', error);
    }
  }
  
  async checkSchedules() {
    try {
      const now = new Date();
      
      const { data: schedules, error } = await supabase
        .from('schedule_registrations')
        .select('*')
        .eq('is_active', true)
        .lte('next_run_at', now.toISOString());
      
      if (error) throw error;
      
      for (const schedule of schedules) {
        await this.executeSchedule(schedule);
        await this.updateNextRunTime(schedule);
      }
    } catch (error) {
      console.error('Error checking schedules:', error);
    }
  }
  
  async executeSchedule(schedule) {
    console.log(`⏰ Executing scheduled workflow: ${schedule.workflow_id}`);
    
    try {
      await supabase
        .from('schedule_registrations')
        .update({ last_run_at: new Date().toISOString() })
        .eq('id', schedule.id);
      
      await workflowExecutor.executeWorkflow(
        schedule.workflow_id,
        { scheduled: true, schedule_id: schedule.id, triggered_at: new Date().toISOString() },
        schedule.user_id
      );
    } catch (error) {
      console.error(`Schedule execution failed for ${schedule.id}:`, error);
    }
  }
  
  async updateNextRunTime(schedule) {
    try {
      const interval = cronParser.parseExpression(schedule.cron_expression, {
        tz: schedule.timezone || 'UTC'
      });
      const nextRun = interval.next().toDate();
      
      await supabase
        .from('schedule_registrations')
        .update({ next_run_at: nextRun.toISOString() })
        .eq('id', schedule.id);
    } catch (error) {
      console.error(`Error updating next run time for schedule ${schedule.id}:`, error);
    }
  }
  
  async registerSchedule(userId, workflowId, cronExpression, timezone = 'UTC') {
    try {
      const interval = cronParser.parseExpression(cronExpression, { tz: timezone });
      const nextRun = interval.next().toDate();
      
      const { data, error } = await supabase
        .from('schedule_registrations')
        .insert({
          user_id: userId,
          workflow_id: workflowId,
          cron_expression: cronExpression,
          timezone: timezone,
          is_active: true,
          next_run_at: nextRun.toISOString(),
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Error registering schedule:', error);
      throw error;
    }
  }
}

module.exports = new ScheduleHandler();