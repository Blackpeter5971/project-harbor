import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

const input = z.object({
  goal: z.string().trim().min(2).max(200),
  company: z.object({ name: z.string().max(48), sector: z.string().max(40), cash: z.number().finite(), reputation: z.number().finite(), employees: z.number().int().min(0).max(10000), products: z.array(z.string().max(60)).max(12), expansions: z.array(z.string().max(40)).max(8), history: z.array(z.object({ revenue: z.number().finite(), expenses: z.number().finite(), netProfit: z.number().finite() })).max(4) }),
});

/** Advises a fictional company owner. Public game helper: input is capped, no private data. */
export const adviseBusiness = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => {
    const { generateResponse, GatewayError } = await import('@lovable.dev/ai-gateway');
    const c = data.company;
    try {
      const res = await generateResponse({
        model: 'openai/gpt-6-astra',
        instructions: 'You are a board advisor in a business/politics simulation game. Give a tailored next-quarter strategy in at most 3 short sentences, concrete and actionable using game levers: hire/fire staff, launch or reprice products, expansions (branch, machinery, marketing, R&D), inject capital, dividends, appoint a GM, bid on government contracts, or sell the company. Output plain text only.',
        input: `Owner goal: ${data.goal}\nCompany: ${c.name} (${c.sector}). Cash $${Math.round(c.cash)}. Reputation ${Math.round(c.reputation)}/100. Staff ${c.employees}. Products: ${c.products.join(', ') || 'none'}. Expansions: ${c.expansions.join(', ') || 'none'}.\nLast quarters (revenue/expenses/net): ${c.history.map(h => `${Math.round(h.revenue)}/${Math.round(h.expenses)}/${Math.round(h.netProfit)}`).join('; ') || 'no history yet'}`,
      });
      const text = res.output.flatMap(o => o.type === 'message' ? o.content : []).map(x => x.type === 'output_text' ? x.text : '').join('').trim();
      if (!text) return { ok: false as const, error: 'The advisor had nothing to say. Try a different goal.' };
      return { ok: true as const, text: text.slice(0, 600) };
    } catch (e) {
      if (e instanceof GatewayError) { console.error('adviseBusiness failed', e.code, e.httpStatus); return { ok: false as const, error: e.httpStatus === 402 ? 'AI credits are used up.' : e.httpStatus === 429 ? 'The advisor is busy. Try again shortly.' : 'The advisor is unavailable right now.' }; }
      throw e;
    }
  });
