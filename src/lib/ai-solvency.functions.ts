import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

const n = z.number().finite();
const input = z.object({
  goal: z.string().trim().min(2).max(200),
  money: z.object({ cash: n, arrears: n, obligations: n, taxDue: n, income: n, stance: z.enum(['honest', 'loophole', 'evade']), exposure: n, housing: z.string().max(40), lifestyle: z.string().max(40) }),
});

/** Personal-finance advisor for a fictional game character. Public game helper: input is capped, no private data. */
export const adviseSolvency = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => {
    const { generateResponse, GatewayError } = await import('@lovable.dev/ai-gateway');
    const m = data.money;
    try {
      const res = await generateResponse({
        model: 'openai/gpt-6-astra',
        instructions: 'You are a personal finance advisor in a politics simulation game. In at most 3 short sentences, give a concrete plan to stay solvent next quarter using game levers: move to cheaper housing, lower lifestyle or diet tier, take a job or promotion, withdraw business dividends, take or repay a bank loan, sell a vehicle, or change tax filing stance (note audit and scandal risk of deductions or evasion). Output plain text only.',
        input: `Goal: ${data.goal}\nCash $${Math.round(m.cash)}. Past-due bills $${Math.round(m.arrears)}. Compulsory bills next quarter $${Math.round(m.obligations)}. Tax due $${Math.round(m.taxDue)}. Last quarter income $${Math.round(m.income)}. Tax stance ${m.stance}, audit exposure ${Math.round(m.exposure)}%. Home: ${m.housing}. Lifestyle: ${m.lifestyle}.`,
      });
      const text = res.output.flatMap(o => o.type === 'message' ? o.content : []).map(x => x.type === 'output_text' ? x.text : '').join('').trim();
      if (!text) return { ok: false as const, error: 'The advisor had nothing to say. Try a different goal.' };
      return { ok: true as const, text: text.slice(0, 600) };
    } catch (e) {
      if (e instanceof GatewayError) { console.error('adviseSolvency failed', e.code, e.httpStatus); return { ok: false as const, error: e.httpStatus === 402 ? 'AI credits are used up.' : e.httpStatus === 429 ? 'The advisor is busy. Try again shortly.' : 'The advisor is unavailable right now.' }; }
      throw e;
    }
  });
