/* UI-only: lets the turn report ask the treasury panel to open a given tab. Never touches the save. */
let pending: string | null = null;
export const requestTreasuryTab = (tab: string) => { pending = tab; if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('treasury-tab', { detail: tab })); };
export const takeTreasuryTab = () => { const t = pending; pending = null; return t; };
