import type { Bindings } from '../types/index.js';
import { TEAMS } from '../types/index.js';
import { processTeamReminders } from '../services/reminder-service.js';

/**
 * Cron 핸들러: Cycle 기반 리마인더
 * 평일 09:30 KST (UTC 00:30) 실행
 */
export async function handleCycleReminder(env: Bindings): Promise<void> {
  console.log('=== Cycle Reminder Started ===');
  console.log('Time:', new Date().toISOString());

  let totalNoCycle = 0;
  let totalOverdue = 0;
  let totalSkipped = 0;

  for (const team of TEAMS) {
    console.log(`\n--- Processing ${team.name} team ---`);

    try {
      const result = await processTeamReminders(team, env);
      totalNoCycle += result.noCycle;
      totalOverdue += result.overdue;
      totalSkipped += result.skipped;

      console.log(`[${team.name}] No-cycle reminders: ${result.noCycle}`);
      console.log(`[${team.name}] Overdue reminders: ${result.overdue}`);
      if (result.skipped > 0) {
        console.log(`[${team.name}] Skipped (batch limit): ${result.skipped}`);
      }
    } catch (err) {
      console.error(`[${team.name}] Error:`, err);
    }
  }

  console.log('\n=== Cycle Reminder Completed ===');
  console.log(`Total no-cycle reminders: ${totalNoCycle}`);
  console.log(`Total overdue reminders: ${totalOverdue}`);
  if (totalSkipped > 0) {
    console.log(`Total skipped (will process next run): ${totalSkipped}`);
  }
}
