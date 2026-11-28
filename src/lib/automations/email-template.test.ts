import { describe, expect, it } from 'vitest';
import {
  interpolateEmailTemplate,
  renderAutomationEmailHtml,
} from './email-template';

describe('interpolateEmailTemplate', () => {
  it('interpolates conversation details and leaves no unknown placeholders', () => {
    expect(
      interpolateEmailTemplate(
        '{{contact.name}} ({{contact.phone}}): {{message.text}} — {{conversation.url}} {{unknown.value}}',
        {
          contactName: 'Ada',
          contactPhone: '+10000000000',
          agentName: 'Grace',
          messageText: 'Need help',
          conversationUrl: 'https://crm.example.com/inbox?c=conversation-1',
        }
      )
    ).toBe(
      'Ada (+10000000000): Need help — https://crm.example.com/inbox?c=conversation-1 '
    );
  });

  it('supports the assigned-agent placeholder', () => {
    expect(
      interpolateEmailTemplate('Assigned to {{agent.name}}', {
        contactName: '',
        contactPhone: '',
        agentName: 'Grace',
        messageText: '',
        conversationUrl: '',
      })
    ).toBe('Assigned to Grace');
  });

  it('renders a branded HTML email and escapes message content', () => {
    const html = renderAutomationEmailHtml(
      'El cliente escribió: <script>alert("x")</script>\nAbrir: https://crm.example.com/inbox?c=abc&view=1'
    );

    expect(html).toContain('background-color:#7c3aed');
    expect(html).toContain('WA CRM');
    expect(html).toContain(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>'
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain(
      'href="https://crm.example.com/inbox?c=abc&amp;view=1"'
    );
  });
});
