import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

const effectsSchema = z.object({
  variables: z.record(z.string(), z.number()).optional(),
  relationships: z.record(z.string(), z.number()).optional(),
  setFlags: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  delayed: z.array(z.object({ inTurns: z.number(), flag: z.string(), value: z.union([z.string(), z.number(), z.boolean()]).optional() })).max(10).optional(),
  career: z.object({ approval: z.number().optional(), reputation: z.number().optional(), momentum: z.number().optional() }).optional(),
});

const input = z.object({
  scenarioTitle: z.string().max(80),
  chapter: z.string().max(200),
  tone: z.enum(['keep', 'dramatic', 'romantic', 'tense', 'witty']),
  note: z.string().max(300).optional(),
  characters: z.array(z.object({ id: z.string().max(40), name: z.string().max(60), role: z.string().max(80) })).max(8),
  event: z.object({
    title: z.string().max(120), speaker: z.string().max(60), dialogue: z.string().max(1200),
    flagsAll: z.array(z.string().max(60)).max(10), flagsNone: z.array(z.string().max(60)).max(10),
    choices: z.array(z.object({ id: z.string().max(60), label: z.string().max(160), preview: z.string().max(300), effects: effectsSchema })).min(1).max(6),
  }),
});

/** Drafts alternate wording for one story event. Never changes effects; output is only a proposal. */
export const draftStoryEvent = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => {
    const { generateResponse, GatewayError } = await import('@lovable.dev/ai-gateway');
    const ids = data.event.choices.map(c => c.id);
    const schema = {
      type: 'object', additionalProperties: false, required: ['dialogue', 'choices'],
      properties: {
        dialogue: { type: 'string' },
        choices: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'label', 'preview'], properties: { id: { type: 'string', enum: ids }, label: { type: 'string' }, preview: { type: 'string' } } } },
      },
    };
    try {
      const res = await generateResponse({
        model: 'openai/gpt-6-astra',
        reasoning: { effort: 'low' },
        text: { format: { type: 'json_schema', name: 'story_event_draft', strict: true, schema } },
        instructions: `You are a narrative editor for a fictional political drama game. Rewrite one story event's wording.
Rules: keep the same speaker, characters and situation. Dialogue under 600 characters, spoken by the speaker. Return one entry per original choice id, same ids. Each label is a short action (max 80 chars). Each preview is a one-sentence consequence hint (max 180 chars) that honestly reflects that choice's effects (direction of variable, relationship and career changes, flags set, delayed consequences) without numbers. Never invent outcomes the effects don't support. No real living politicians.`,
        input: JSON.stringify(data),
      } as Parameters<typeof generateResponse>[0]);
      const text = res.output.flatMap(o => o.type === 'message' ? o.content : []).map(c => c.type === 'output_text' ? c.text : '').join('').trim();
      if (!text) return { ok: false as const, error: 'The writer came back empty. Try again.' };
      const parsed = JSON.parse(text) as { dialogue: string; choices: { id: string; label: string; preview: string }[] };
      return { ok: true as const, draft: { dialogue: parsed.dialogue.slice(0, 900), choices: parsed.choices.filter(c => ids.includes(c.id)).map(c => ({ id: c.id, label: c.label.slice(0, 120), preview: c.preview.slice(0, 240) })) } };
    } catch (e) {
      if (e instanceof GatewayError) { console.error('draftStoryEvent failed', e.code, e.httpStatus); return { ok: false as const, error: e.httpStatus === 402 ? 'AI credits are used up.' : e.httpStatus === 429 ? 'Too many drafts right now. Try again shortly.' : 'The writer is unavailable right now.' }; }
      console.error('draftStoryEvent error', e);
      return { ok: false as const, error: 'The draft could not be read. Try again.' };
    }
  });
