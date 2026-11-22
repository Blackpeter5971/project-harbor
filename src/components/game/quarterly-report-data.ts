import type { Career } from '@/lib/game/career';

export const reportMoney = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Math.abs(value));
export const reportNumber = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
export const signedReportNumber = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${reportNumber(Math.abs(value))}`;

/** Read-only presentation of the closed quarter; never settles accounts or changes a save. */
export function quarterlyReportData(career: Career) {
  const end = new Date(`${career.date}T00:00:00Z`);
  const start = new Date(end); start.setUTCMonth(start.getUTCMonth() - 3);
  const last = new Date(end); last.setUTCMonth(last.getUTCMonth() - 1);
  const month = (date: Date) => date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  const startKey = start.toISOString().slice(0, 10);
  const entries = career.ledger.filter(entry => entry.month >= startKey && entry.month <= career.date);
  const group = (positive: boolean) => {
    const totals = new Map<string, number>();
    for (const entry of entries) {
      if (positive ? entry.amount <= 0 : entry.amount >= 0) continue;
      totals.set(entry.label, (totals.get(entry.label) ?? 0) + Math.abs(entry.amount));
    }
    return [...totals].map(([label, amount]) => ({ label, amount }));
  };
  const income = group(true), expenses = group(false);
  const totalIncome = income.reduce((sum, entry) => sum + entry.amount, 0);
  const totalExpenses = expenses.reduce((sum, entry) => sum + entry.amount, 0);
  const lines = career.report?.lines ?? [];
  const stats = lines.find(line => /^Reputation\s+[\d.,]+/.test(line));
  const delta = (name: string) => {
    const match = stats?.match(new RegExp(`${name}\\s+[\\d.,]+\\s+\\(([+−-])[\\s]*([\\d.,]+)\\)`));
    return match ? Number((match[2] ?? '0').replaceAll(',', '')) * (match[1] === '+' ? 1 : -1) : 0;
  };
  const approval = lines.find(line => /^Approval (rose|fell)/.test(line))?.match(/\(([+−-]?)([\d.]+)\)/);
  const approvalDelta = approval ? Number(approval[2]) * (approval[1] === '-' || approval[1] === '−' ? -1 : 1) : 0;
  const highlights = [...new Set(lines.map(line => line.trim()).filter(Boolean))].filter(line => {
    if (/^(Income:|Office income:|Job income:|Expenses this turn:|Reputation\s+[\d.,]+|Communication\s+[\d.,]+|Well-being:|Groceries:|Lifestyle:|Healthcare:|Government treasury:|Bank:.*(?:credited|deducted)|Approval (rose|fell)|An invitation|The Courier|A quiet|.*actions available\.)/i.test(line)) return false;
    if (/\b(debug|undefined|NaN|revision|watermark|trace)\b|needs .+|begins\.$/i.test(line)) return false;
    // Routine receipts belong in finances, not milestone banners.
    if (/\$/.test(line) && /paid|collected|deducted|expenses|upkeep|repayment|taxes/i.test(line) && !/alert|warning|overdue|could not|unpaid/i.test(line)) return false;
    return /promot|offer|birthday|milestone|elected|election|won|lost|passed|veto|signed|completed|opened|ended|resign|alert|warning|unpaid|could not|crisis|scandal|investig|convict|acquit|available now|performance standards|bonus withheld/i.test(line);
  });
  return { title: `${month(start)} – ${month(last)} ${last.getUTCFullYear()}`, income, expenses, totalIncome, totalExpenses,
    net: totalIncome - totalExpenses, reputationDelta: delta('Reputation'), experienceDelta: delta('Experience'), approvalDelta, highlights };
}