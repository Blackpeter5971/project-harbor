import { useEffect, useState } from 'react';
import { CloudUpload, Download, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { CLOUD_KEY_STORE, CLOUD_LAST_STORE, CloudSaveValidationError, collectCloudPayload, formatRecoveryKey, generateRecoveryKey, isRecoveryKey, restoreCloudPayload, validateCloudPayload } from '@/lib/game/cloud-save';

export function CloudSavePanel() {
  const [key, setKey] = useState('');
  const [last, setLast] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    try {
      let k = localStorage.getItem(CLOUD_KEY_STORE);
      if (!k) { k = generateRecoveryKey(); localStorage.setItem(CLOUD_KEY_STORE, k); }
      setKey(k); setLast(localStorage.getItem(CLOUD_LAST_STORE) ?? '');
    } catch { setMsg('Device storage is unavailable. Cloud saving cannot start.'); }
  }, []);

  async function upload() {
    if (busy || !isRecoveryKey(key)) return;
    setBusy(true); setMsg('');
    try {
      const payload = validateCloudPayload(collectCloudPayload(localStorage));
      const { data, error } = await supabase.rpc('cloud_save_put', { _key: key, _payload: payload });
      if (error) throw error;
      const when = new Date(data).toLocaleString();
      setLast(when); setMsg('Career saved to the cloud.');
      try { localStorage.setItem(CLOUD_LAST_STORE, when); } catch { /* Upload succeeded even if timestamp storage is full. */ }
    } catch (error) { setMsg(error instanceof CloudSaveValidationError ? error.message : 'Could not save to the cloud. Check your internet and try again.'); }
    finally { setBusy(false); }
  }

  async function restore() {
    if (busy) return;
    const k = formatRecoveryKey(input);
    if (!isRecoveryKey(k)) { setMsg('Enter your full recovery key.'); return; }
    if (!confirm('Restoring will replace careers, coins and story progress on this phone with the cloud backup. Continue?')) return;
    setBusy(true); setMsg('');
    try {
      const { data, error } = await supabase.rpc('cloud_save_get', { _key: k });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) { setMsg('No save found for that key.'); return; }
      restoreCloudPayload(localStorage, row.payload);
      localStorage.setItem(CLOUD_KEY_STORE, k);
      localStorage.setItem(CLOUD_LAST_STORE, new Date(row.updated_at).toLocaleString());
      setMsg('Career restored. Reloading…');
      window.location.reload();
    } catch (error) { setMsg(error instanceof CloudSaveValidationError ? error.message : 'Could not restore the save. Check your internet and available device storage, then try again.'); }
    finally { setBusy(false); }
  }

  async function copyKey() {
    try { await navigator.clipboard.writeText(key); setMsg('Key copied.'); }
    catch { setMsg('Could not copy. Write down your recovery key instead.'); }
  }

  return <div className="cloud-save-settings">
    <strong>Cloud Save</strong>
    <span className="text-xs text-muted-foreground">Keep this recovery key safe. Anyone with it can access or replace your backup.</span>
    <div className="flex items-center gap-2 min-w-0">
      <code className="text-sm flex-1 min-w-0 break-all select-all" aria-label="Your recovery key">{key}</code>
      <Button size="icon" variant="gameQuiet" aria-label="Copy recovery key" title="Copy recovery key" disabled={!key} onClick={copyKey}><Copy /></Button>
    </div>
    <Button variant="gameOutline" disabled={busy || !key} onClick={upload}><CloudUpload />Save career to cloud</Button>
    {last && <span className="text-xs text-muted-foreground">Last cloud save: {last}</span>}
    <label htmlFor="cloud-recovery-key" className="text-xs text-muted-foreground">Recovery key</label>
    <input id="cloud-recovery-key" className="cloud-recovery-input" placeholder="CROS-XXXX-XXXX-XXXX" autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off" disabled={busy} value={input} onChange={e => setInput(formatRecoveryKey(e.target.value))} />
    <Button variant="gameOutline" disabled={busy} onClick={restore}><Download />Restore career from cloud</Button>
    {busy && <span className="text-xs text-muted-foreground" role="status">Connecting to cloud…</span>}
    {msg && <span className="text-xs" role="status">{msg}</span>}
  </div>;
}
