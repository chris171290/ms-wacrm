import { supabaseAdmin } from './admin-client';
import { runAutomationsForTrigger } from './engine';

interface UnansweredAutomation {
  id: string;
  account_id: string;
  trigger_config: unknown;
}

interface UnansweredConversation {
  conversation_id: string;
  contact_id: string;
  assigned_agent_id: string;
  last_customer_message_id: string;
  last_customer_message_at: string;
  last_customer_message_text: string | null;
}

export interface UnansweredSweepResult {
  automations: number;
  candidates: number;
  alerts_sent: number;
  failed: number;
}

export async function sweepUnansweredConversations(): Promise<UnansweredSweepResult> {
  const db = supabaseAdmin();
  const result: UnansweredSweepResult = {
    automations: 0,
    candidates: 0,
    alerts_sent: 0,
    failed: 0,
  };

  const { data: automations, error: automationsError } = await db
    .from('automations')
    .select('id, account_id, trigger_config')
    .eq('trigger_type', 'unanswered_conversation')
    .eq('is_active', true);

  if (automationsError) {
    throw new Error(
      `unanswered automation scan failed: ${automationsError.message}`
    );
  }
  if (!automations?.length) return result;

  for (const automation of automations as UnansweredAutomation[]) {
    result.automations++;
    const config = (automation.trigger_config ?? {}) as Record<string, unknown>;
    const timeoutMinutes = config.timeout_minutes;
    if (
      typeof timeoutMinutes !== 'number' ||
      !Number.isInteger(timeoutMinutes) ||
      timeoutMinutes < 1 ||
      timeoutMinutes > 10080
    ) {
      console.error(
        '[unanswered-cron] invalid timeout configuration',
        automation.id
      );
      result.failed++;
      continue;
    }

    const cutoff = new Date(Date.now() - timeoutMinutes * 60_000).toISOString();
    const { data: conversations, error: conversationsError } = await db.rpc(
      'get_unanswered_conversations',
      {
        p_automation_id: automation.id,
        p_account_id: automation.account_id,
        p_cutoff: cutoff,
      }
    );
    if (conversationsError) {
      console.error('[unanswered-cron] conversation scan failed', {
        automationId: automation.id,
        error: conversationsError.message,
      });
      result.failed++;
      continue;
    }

    for (const conversation of (conversations ??
      []) as UnansweredConversation[]) {
      result.candidates++;
      const { data: alertId, error: claimError } = await db.rpc(
        'claim_unanswered_conversation_alert',
        {
          p_account_id: automation.account_id,
          p_automation_id: automation.id,
          p_conversation_id: conversation.conversation_id,
          p_inbound_message_id: conversation.last_customer_message_id,
        }
      );
      if (claimError) {
        console.error('[unanswered-cron] alert claim failed', {
          automationId: automation.id,
          conversationId: conversation.conversation_id,
          error: claimError.message,
        });
        result.failed++;
        continue;
      }
      if (typeof alertId !== 'string') continue;

      const executions = await runAutomationsForTrigger({
        accountId: automation.account_id,
        automationId: automation.id,
        triggerType: 'unanswered_conversation',
        contactId: conversation.contact_id,
        context: {
          conversation_id: conversation.conversation_id,
          unanswered_message_id: conversation.last_customer_message_id,
          message_text: conversation.last_customer_message_text ?? '',
        },
      });
      const execution = executions.find(
        (item) => item.automation_id === automation.id
      );
      const sent = execution?.status === 'success';
      const { error: updateError } = await db
        .from('unanswered_conversation_alerts')
        .update(
          sent
            ? {
                status: 'sent',
                sent_at: new Date().toISOString(),
                last_error: null,
              }
            : {
                status: 'failed',
                last_error:
                  'Automation execution failed; inspect automation logs.',
              }
        )
        .eq('id', alertId);

      if (updateError) {
        console.error('[unanswered-cron] alert status update failed', {
          alertId,
          error: updateError.message,
        });
        result.failed++;
      } else if (sent) {
        result.alerts_sent++;
      } else {
        console.error('[unanswered-cron] alert automation failed', {
          automationId: automation.id,
          conversationId: conversation.conversation_id,
        });
        result.failed++;
      }
    }
  }

  return result;
}
