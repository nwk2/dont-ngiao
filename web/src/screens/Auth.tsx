import { googleAuthUrl } from '../google';
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { AsyncButton, S, btn, homeCard, input, primary, EyeIcon } from '../ui';

export function useBlink() {
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    let alive = true; let t1: any; let t2: any;
    const loop = () => { t1 = setTimeout(() => { if (!alive) return; setBlink(true); t2 = setTimeout(() => { if (!alive) return; setBlink(false); loop(); }, 150); }, 2800 + Math.random() * 2200); };
    loop();
    return () => { alive = false; clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return blink;
}

// Auth corgi (2026-11-05, comparison pick): focus-driven pupils,
// blinking, binocular on hidden password, cover on shown password.
// The bear it was compared against was removed Nov 2026 when email
// registration closed — login keeps the corgi. Corgi markers: tall
// pointy ears, tan face with a white blaze, white muzzle, tongue out.
// Cover paws are white (contrast vs tan face).
export function AuthCorgi({ focus, value, eyesClosed, oneEyePeek }: any) {
  const blink = useBlink();
  const len = (value || '').length;
  const dx = focus ? Math.min(len, 16) * 0.2 - 1.6 : 0;
  const dy = focus ? 4 : 2; // anxious look-down: down even at idle, clearly down when a field is focused
  const eyeRy = blink ? 1 : 9;

  return (<div aria-hidden="true" style={{display:'flex',justifyContent:'center',marginBottom:8}}>
    <svg width="88" height="88" viewBox="0 0 120 120">
      <path d="M22 44 L30 6 L54 32 Z" fill="#d99a5b" stroke="#d99a5b" strokeWidth="4" strokeLinejoin="round" />
      <path d="M98 44 L90 6 L66 32 Z" fill="#d99a5b" stroke="#d99a5b" strokeWidth="4" strokeLinejoin="round" />
      <path d="M29 36 L33 16 L46 29 Z" fill="#f3c6a5" />
      <path d="M91 36 L87 16 L74 29 Z" fill="#f3c6a5" />
      <ellipse cx="60" cy="68" rx="44" ry="38" fill="#d99a5b" />
      <path d="M60 32 L57 58 L60 70 L63 58 Z" fill="#fff8ec" />
      <ellipse cx="60" cy="84" rx="20" ry="13" fill="#fff8ec" />
      <ellipse cx="60" cy="98" rx="7" ry="9" fill="#f48fb1" />
      <path d="M60 96 v6" stroke="#e57373" strokeWidth="1.5" strokeLinecap="round" />
      <ellipse cx="60" cy="78" rx="7" ry="5" fill="#3e2723" />
      <path d="M48 89 Q52 85 56 89 Q60 85 64 89 Q68 85 72 89" fill="none" stroke="#3e2723" strokeWidth="2" strokeLinecap="round" />
      <path d="M36 46 L52 41 M68 41 L84 46" fill="none" stroke="#3e2723" strokeWidth="2.5" strokeLinecap="round" />
      <g>
        {eyesClosed ? (<>
          <path d="M35 58 Q44 52 53 58" fill="none" stroke="#3e2723" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M67 58 Q76 52 85 58" fill="none" stroke="#3e2723" strokeWidth="2.5" strokeLinecap="round" />
        </>) : oneEyePeek ? (<>
          <ellipse cx="44" cy="58" rx="9" ry={eyeRy} fill="#fff" />
          {!blink && <circle cx={44 + dx} cy={58 + dy} r="4.5" fill="#1c1c1e" />}
          <path d="M67 58 Q76 52 85 58" fill="none" stroke="#3e2723" strokeWidth="2.5" strokeLinecap="round" />
        </>) : (<>
          <ellipse cx="44" cy="58" rx="9" ry={eyeRy} fill="#fff" />
          <ellipse cx="76" cy="58" rx="9" ry={eyeRy} fill="#fff" />
          {!blink && (<><circle cx={44 + dx} cy={58 + dy} r="4.5" fill="#1c1c1e" /><circle cx={76 + dx} cy={58 + dy} r="4.5" fill="#1c1c1e" /></>)}
        </>)}
      </g>

    </svg>
  </div>);
}

export function Auth({ onAuth, error, loading, notice, inviteToken, onInvalidInvite }: any) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focus, setFocus] = useState<string|null>(null);
  const [lastField, setLastField] = useState<string|null>(null);
  // INVITE BANNER, Nov 2026: a guest opening an invite link used to see
  // only the generic login screen — nothing said they were invited, or
  // to which group, until AFTER they signed in (the join screen only
  // appears once authed). Resolve the token here (the resolve endpoint
  // is public, no auth needed) and show the invite up front, so they
  // know WHY they are signing in before they do it. If the link is
  // dead/revoked, say so here too, with a way back to the plain login
  // — so they never sign in for a link that can't be used.
  const [invite, setInvite] = useState<any>(null);
  const [inviteState, setInviteState] = useState<'idle'|'loading'|'ready'|'error'>('idle');
  const [inviteError, setInviteError] = useState('');
  useEffect(()=>{ if (!inviteToken) return; let cancelled = false; setInviteState('loading');
    api(`/api/invites/${encodeURIComponent(inviteToken)}`).then((d:any)=>{ if (!cancelled) { setInvite(d); setInviteState('ready'); } }).catch((e:any)=>{ if (!cancelled) { setInviteError(e.message || 'This invite link is invalid or has been revoked'); setInviteState('error'); } });
    return ()=>{ cancelled = true; };
  }, [inviteToken]);
  const passwordRef = useRef<any>(null);
  const focusValue = focus==='email' ? email : focus==='password' ? password : '';
  // Pet placement 2026-11-05: inside the form card, above the first
  // field (Email).
  const pwFocused = focus === 'password';
  const eyesClosed = pwFocused && !showPassword;
  // Peek is sticky: it also fires when the password was the last field
  // touched and is now shown, even if focus was dropped by the toggle
  // tap or an iOS focus quirk. Focusing another field clears it via lastField.
  const oneEyePeek = showPassword && (pwFocused || lastField === 'password');
  const pet = <AuthCorgi focus={focus} value={focusValue} eyesClosed={eyesClosed} oneEyePeek={oneEyePeek} />;
  // SUBMIT DISABLED UNTIL FILLED, Nov 2026: the Log in button used to be
  // live with empty fields — tapping it fired a login round trip that
  // came back "Invalid email or password", which reads as wrong
  // credentials rather than empty fields. The server still rejects empty
  // credentials (401), this just stops the tap. Same rule on the reset
  // and admin-login buttons below.
  const submitDisabled = loading || !email.trim() || !password;
  return (<div style={S}><h1>Duesy</h1><p style={{color:'var(--muted)'}}>Pay your dues, easily.</p>
    {notice && <div style={{...homeCard,background:'var(--tint-bg)',marginBottom:16}}><div style={{fontSize:14,lineHeight:1.45}}>{notice}</div></div>}
    {inviteToken && inviteState==='loading' && <p style={{color:'var(--muted)',fontSize:13}}>Checking your invite…</p>}
    {inviteToken && inviteState==='ready' && invite && <div style={{...homeCard,background:'var(--tint-bg)',marginBottom:16}}>
      <div style={{fontSize:18,fontWeight:700,lineHeight:1.3}}>You're invited to join {invite.groupName}</div>
      <div style={{color:'var(--muted)',marginTop:4}}>{invite.inviterName} invited you to join this group.</div>
      <div style={{fontSize:13,color:'var(--muted)',marginTop:8}}>Log in with email, or continue with Google.</div>
    </div>}
    {inviteToken && inviteState==='error' && <div style={{...homeCard,marginBottom:16}}>
      <div style={{fontWeight:700}}>Invite link</div>
      <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.45,margin:'8px 0'}}>{inviteError}</p>
      <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.45,margin:'0 0 12px'}}>The link may have been revoked, or the group may have been deleted or archived.</p>
      <button style={{...btn,width:'100%',padding:'12px',fontSize:15}} onClick={()=>{ if (onInvalidInvite) onInvalidInvite(); }}>Go to log in</button>
    </div>}
    <div style={homeCard}>
    {error && <p style={{color:'var(--danger-text)',marginTop:0}}>{error}</p>}
    {/* GOOGLE SIGN-IN, Nov 2026: Google signs the user in, or creates
    the account when there is none. No password, no Turnstile (Google
    does the bot check). The button follows Google's brand (white,
    Google "G"). */}
    <button type="button" style={{...btn,width:'100%',padding:'14px',fontSize:16,background:'#fff',color:'#1f1f1f',border:'var(--border-w) solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:12}} onClick={()=>{ window.location.href = googleAuthUrl(); }}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"/></svg>
      <span>Sign in with Google</span>
    </button>
    <div style={{display:'flex',alignItems:'center',gap:12,margin:'4px 0 12px',color:'var(--muted)',fontSize:13}}>
      <span style={{flex:1,height:1,background:'var(--border)'}} />
      <span>or continue with email</span>
      <span style={{flex:1,height:1,background:'var(--border)'}} />
    </div>
    {pet}
    <label>Email</label><input style={input} value={email} onChange={e=>setEmail(e.target.value)} onFocus={()=>{setFocus('email'); setLastField('email');}} onBlur={()=>setFocus(null)} />
    <label>Password</label><div style={{position:'relative',margin:'4px 0 10px'}}><input ref={passwordRef} type={showPassword ? 'text' : 'password'} style={{...input,margin:0,paddingRight:44}} value={password} onChange={e=>setPassword(e.target.value)} onFocus={()=>{setFocus('password'); setLastField('password');}} onBlur={()=>setFocus(null)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',padding:4,cursor:'pointer',display:'flex',lineHeight:1}} onMouseDown={e=>e.preventDefault()} onClick={()=>{setShowPassword(v=>!v); passwordRef.current?.focus();}}><EyeIcon off={showPassword} /></button></div>
    <button style={{...primary, width:'100%', padding:'14px', fontSize:16, opacity: submitDisabled ? 0.6 : 1, cursor: submitDisabled ? 'not-allowed' : 'pointer'}} disabled={submitDisabled} onClick={()=>onAuth(email,password)}>{loading && <span className="btn-spinner" aria-hidden="true" />}{loading ? 'Logging in…' : 'Log in'}</button>
    </div>
    <p style={{color:'var(--muted)',fontSize:13}}>Forgot your password? Ask the admin for a reset link.</p>
  </div>);
}

// ---- Password reset (link the admin sent manually) ----
export function ResetPasswordView({ token }: { token: string }) {
  const [newPassword, setNewPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [done, setDone] = useState(false);
  async function doReset() {
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirm) { setError('Passwords do not match'); return; }
    setError(''); setLoading(true);
    try { await api('/api/auth/reset-password', 'POST', { token, newPassword }); setDone(true); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  if (done) return (<div style={S}><h1>Password reset</h1><div style={homeCard}><p style={{marginTop:0}}>Your password has been changed. You can now log in with the new password.</p><button style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={()=>{ window.location.href = '/'; }}>Go to log in</button></div></div>);
  return (<div style={S}><h1>Reset password</h1><p style={{color:'var(--muted)'}}>Choose a new password. This link is single-use and expires after 24 hours.</p>
    <div style={homeCard}>
    {error && <p style={{color:'var(--danger-text)',marginTop:0}}>{error}</p>}
    <label>New password</label><div style={{position:'relative',margin:'4px 0 10px'}}><input type={showPassword ? 'text' : 'password'} style={{...input,margin:0,paddingRight:44}} value={newPassword} onChange={e=>setNewPassword(e.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',padding:4,cursor:'pointer',display:'flex',lineHeight:1}} onClick={()=>setShowPassword(v=>!v)}><EyeIcon off={showPassword} /></button></div>
    <label>Confirm new password</label><div style={{position:'relative',margin:'4px 0 10px'}}><input type={showPassword ? 'text' : 'password'} style={{...input,margin:0,paddingRight:44}} value={confirm} onChange={e=>setConfirm(e.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',padding:4,cursor:'pointer',display:'flex',lineHeight:1}} onClick={()=>setShowPassword(v=>!v)}><EyeIcon off={showPassword} /></button></div>
    <button style={{...primary, width:'100%', padding:'14px', fontSize:16, opacity: (loading || !newPassword || !confirm) ? 0.6 : 1, cursor: (loading || !newPassword || !confirm) ? 'not-allowed' : 'pointer'}} disabled={loading || !newPassword || !confirm} onClick={doReset}>{loading ? 'Resetting…' : 'Reset password'}</button>
    </div>
  </div>);
}

// INVITE LINK (?invite=<token>), Nov 2026: a public link to join a group.
// Resolves the token (no auth needed to see it), then joins (auth
// required — a guest sees the normal Auth screen first, and the token
// survives in the URL, so after login the join screen appears). After
// joining, onJoined clears the param and opens the group. Joining adds
// a membership for the account (name + email). There is no claim step:
// if the group had a placeholder with this email, signing in with
// Google already activated THAT user row, so the caller IS that user
// and is already a member — the join screen never appears for them. Joining is not a
// money event, so the Log gets no entry for it.
export function InviteView({ token, onJoined, onCancel }: any) {
  const [state, setState] = useState<'loading'|'ready'|'error'>('loading');
  const [invite, setInvite] = useState<any>(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  useEffect(()=>{ let cancelled = false;
    api(`/api/invites/${encodeURIComponent(token)}`).then((d:any)=>{ if (cancelled) return; if (d.alreadyMember) { onJoined(d.groupId); return; } setInvite(d); setState('ready'); }).catch((e:any)=>{ if (!cancelled) { setError(e.message || 'This invite link is invalid or has been revoked'); setState('error'); } });
    return ()=>{ cancelled = true; };
  }, [token]);
  async function join() {
    setError(''); setJoining(true);
    try { const d = await api(`/api/invites/${encodeURIComponent(token)}/join`, 'POST'); onJoined(d.group.id); }
    catch(e:any){ setError(e.message); } finally { setJoining(false); }
  }
  if (state === 'loading') return (<div style={S}><h1>Duesy</h1><p style={{color:'var(--muted)'}}>Checking your invite…</p></div>);
  if (state === 'error') return (<div style={S}><h1>Invite link</h1><div style={homeCard}><p style={{marginTop:0}}>{error}</p><p style={{fontSize:13,color:'var(--muted)'}}>The link may have been revoked, or the group may have been deleted or archived.</p><button style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={onCancel}>Go to Home</button></div></div>);
  return (<div style={S}><h1>You're invited</h1><div style={homeCard}>
    <div style={{fontSize:20,fontWeight:700}}>{invite.groupName}</div>
    <p style={{color:'var(--muted)',marginTop:4}}>{invite.inviterName} invited you to join this group.</p>
    {error && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4}}>{error}</p>}
    <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16}} disabled={joining} onClick={join}>{joining ? 'Joining…' : 'Join group'}</AsyncButton>
    <div style={{marginTop:12}}><button style={{...btn,width:'100%',padding:'14px',fontSize:16}} onClick={onCancel}>Not now</button></div>
    <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.45,marginTop:12}}>Joining adds you to this group, using your account name and email. If someone added you as a placeholder with this email, you're already a member — the group will open instead.</p>
  </div></div>);
}
