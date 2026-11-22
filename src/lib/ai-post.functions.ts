import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

const input = z.object({
  topic: z.string().trim().min(2).max(200),
  type: z.enum(['campaign', 'policy', 'rebuttal', 'praise']),
  persona: z.object({ name: z.string().max(40), party: z.string().max(20), state: z.string().max(30), role: z.string().max(120), background: z.string().max(40), recent: z.array(z.string().max(160)).max(4) }),
});

/** Drafts an in-character post for the player. Public game helper: no private data, input is capped. */
export const draftPost = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => {
    const { generateResponse, GatewayError } = await import('@lovable.dev/ai-gateway');
    const p = data.persona;
    try {
      const res = await generateResponse({
        model: 'openai/gpt-6-astra',
        instructions: `You write posts for S, a short-form social platform, for a fictional American politician in a simulation game. Stay in character. Max 260 characters, 0-2 hashtags, at most one emoji. No real living politicians. Output only the post text.`,
        input: `Politician: ${p.name}, ${p.party}, ${p.state}. Role: ${p.role}. Background: ${p.background}. Recent: ${p.recent.join('; ') || 'none'}.\nPost style: ${data.type}.\nTopic or career event: ${data.topic}`,
      });
      const text = res.output.flatMap(o => o.type === 'message' ? o.content : []).map(c => c.type === 'output_text' ? c.text : '').join('').trim().replace(/^"|"$/g, '');
      if (!text) return { ok: false as const, error: 'The writer came back empty. Try another topic.' };
      return { ok: true as const, text: text.slice(0, 280) };
    } catch (e) {
      if (e instanceof GatewayError) { console.error('draftPost failed', e.code, e.httpStatus); return { ok: false as const, error: e.httpStatus === 402 ? 'AI credits are used up.' : e.httpStatus === 429 ? 'Too many drafts right now. Try again shortly.' : 'The writer is unavailable right now.' }; }
      throw e;
    }
  });
