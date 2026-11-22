import React, { useEffect, useState } from 'react';
import { getPushSubscription, installPlatform, isStandalone, pushSupported, subscribePush } from '../api';
import { AsyncButton, btn, homeCard, primary } from '../ui';

// ONBOARDING PROMPTS (Add to Home Screen + Enable notifications), Nov 2026.
// Two-stage setup for new family members, shown on Home and right after
// joining a group:
// Stage 1 (NOT standalone): "Add to Home Screen" — the prerequisite on
// iPhone, where push only works from the Home Screen app. Platform-
// specific steps. Dismissible per session.
// Stage 2 (standalone, push supported, not subscribed, permission not
// denied): "Enable notifications" — one tap on Enable, then Allow on the
// system prompt. Dismissible per session (reappears on next visit); the
// You > Notifications toggle is the permanent fallback.
// Dismissal is stored in sessionStorage (one key per stage), so it hides
// for the rest of this browser session and comes back on the next visit.
// When permission is 'denied' the Stage 2 banner hides — the app cannot
// fix a browser-level denial, and the You toggle explains it instead.
// (SettingsView keeps its own inline toggle logic, already verified — this
// component uses the shared subscribePush/getPushSubscription helpers in
// api.ts rather than refactoring it.)
export const A2HS_DISMISS_KEY = 'dont-ngiao-a2hs-dismissed';
export const PUSH_PROMPT_DISMISS_KEY = 'dont-ngiao-push-prompt-dismissed';
export function OnboardingPrompts() {
  const [dismissedA2hs, setDismissedA2hs] = useState(() => { try { return sessionStorage.getItem(A2HS_DISMISS_KEY) === '1'; } catch { return false; } });
  const [dismissedPush, setDismissedPush] = useState(() => { try { return sessionStorage.getItem(PUSH_PROMPT_DISMISS_KEY) === '1'; } catch { return false; } });
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');
  const standalone = isStandalone();
  const supported = pushSupported();
  useEffect(() => {
    if (!standalone || !supported) { setPushEnabled(false); return; }
    let cancelled = false;
    getPushSubscription().then((sub) => { if (!cancelled) setPushEnabled(!!sub); }).catch(() => { if (!cancelled) setPushEnabled(false); });
    return () => { cancelled = true; };
  }, [standalone, supported]);
  function dismissA2hs() { try { sessionStorage.setItem(A2HS_DISMISS_KEY, '1'); } catch { /* ignore */ } setDismissedA2hs(true); }
  function dismissPush() { try { sessionStorage.setItem(PUSH_PROMPT_DISMISS_KEY, '1'); } catch { /* ignore */ } setDismissedPush(true); }
  async function enablePush() {
    if (pushBusy) return;
    setPushError(''); setPushBusy(true);
    try { await subscribePush(); setPushEnabled(true); }
    catch (e: any) { setPushError(e?.message || 'Could not enable notifications.'); }
    finally { setPushBusy(false); }
  }
  // Stage 1: not standalone — Add to Home Screen comes first. On iPhone
  // push cannot work from Safari, so there is no notification prompt here.
  if (!standalone && !dismissedA2hs) {
    const platform = installPlatform();
    const steps = platform === 'ios'
      ? 'Share > Add to Home Screen > Add, then open it from the new app icon to enable notifications.'
      : platform === 'android'
      ? 'Three dots > Add to Home screen > Add, then open it from the new app icon to enable notifications.'
      : 'Use your browser\'s menu to add this site to your Home Screen, then open it from the new app icon to enable notifications.';
    return (<div style={{...homeCard, background:'var(--tint-bg)', marginBottom:12}}>
      <strong>Add Don&apos;t Ngiao to your Home Screen</strong>
      <p style={{fontSize:13, color:'var(--muted)', margin:'6px 0 12px'}}>{steps}</p>
      <div style={{display:'flex', gap:8}}><button style={{...btn, flex:1}} onClick={dismissA2hs}>Not now</button></div>
    </div>);
  }
  // Stage 2: standalone, push supported, not yet subscribed, permission
  // not denied — the one-tap Enable prompt. Hidden when already on,
  // when push is unsupported, when permission is denied (the You toggle
  // explains the browser-level block), or when dismissed this session.
  if (!standalone || !supported || pushEnabled !== false || dismissedPush) return null;
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return null;
  return (<div style={{...homeCard, background:'var(--tint-bg)', marginBottom:12}}>
    <strong>Get notified when someone adds an expense</strong>
    <p style={{fontSize:13, color:'var(--muted)', margin:'6px 0 12px'}}>New expense, edited / deleted, and settle — only for groups you&apos;re in. One tap here, then Allow.</p>
    {pushError && <p style={{color:'var(--danger-text)', fontSize:13}}>{pushError}</p>}
    <div style={{display:'flex', gap:8}}>
      <AsyncButton style={{...primary, flex:1, padding:'9px 14px', fontSize:15}} disabled={pushBusy} onClick={enablePush}>{pushBusy ? 'Enabling…' : 'Enable notifications'}</AsyncButton>
      <button style={btn} onClick={dismissPush}>Not now</button>
    </div>
  </div>);
}
