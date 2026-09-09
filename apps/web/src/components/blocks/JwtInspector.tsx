import { useEffect, useState } from 'react';
import type { JwtInspectorBlock } from '@cyberlab/core';
import { Icon } from '../../icons.js';

/**
 * A JWT you can actually tamper with — and a verifier that actually checks.
 *
 * The lesson a static diagram cannot teach is that a JWT is *not encrypted*:
 * the payload is base64url, readable and editable by anyone holding the token.
 * What stops you rewriting `"role": "admin"` is one thing only — the signature.
 * So this widget really recomputes HMAC-SHA256 with Web Crypto over whatever
 * you type. Edit the payload and the verdict turns red; discover the demo
 * secret and it turns green again; switch the algorithm to `none` and watch a
 * naive verifier be defeated by a token with no signature at all.
 */

interface Decoded {
  header: string;
  payload: string;
  signature: string;
  valid: boolean;
  error?: string;
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const withPadding = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  try {
    return decodeURIComponent(
      atob(withPadding)
        .split('')
        .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join(''),
    );
  } catch {
    return '';
  }
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return base64UrlFromBytes(new Uint8Array(signature));
}

function pretty(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

export function JwtInspector({ block }: { block: JwtInspectorBlock }) {
  const initial = block.token.split('.');
  const [header, setHeader] = useState(() => pretty(base64UrlDecode(initial[0] ?? '')));
  const [payload, setPayload] = useState(() => pretty(base64UrlDecode(initial[1] ?? '')));
  const [signature, setSignature] = useState(initial[2] ?? '');
  const [secretGuess, setSecretGuess] = useState('');
  const [state, setState] = useState<Decoded | null>(null);

  const token = `${base64UrlEncode(compact(header))}.${base64UrlEncode(compact(payload))}.${signature}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const signingInput = `${base64UrlEncode(compact(header))}.${base64UrlEncode(compact(payload))}`;
      let alg = 'HS256';
      try {
        alg = String((JSON.parse(header) as { alg?: string }).alg ?? 'HS256');
      } catch {
        /* an invalid header is itself a finding; the verdict below says so. */
      }

      // The `alg: none` case: a verifier that trusts the header skips the check
      // entirely. That is the vulnerability, so the widget models it honestly.
      if (alg.toLowerCase() === 'none') {
        if (!cancelled) {
          setState({
            header,
            payload,
            signature,
            valid: signature === '',
            error:
              signature === ''
                ? 'alg="none": un verificatore ingenuo accetta questo token senza controllare nulla. Chiunque può riscrivere il payload.'
                : 'alg="none" con una firma presente: la maggior parte delle librerie rifiuta questa combinazione.',
          });
        }
        return;
      }

      try {
        const expected = await hmacSha256(secretGuess || block.hmacSecret, signingInput);
        if (!cancelled) {
          setState({
            header,
            payload,
            signature,
            valid: expected === signature,
            ...(expected === signature ? {} : { error: `Firma attesa: ${expected.slice(0, 24)}…` }),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ header, payload, signature, valid: false, error: String(error) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [header, payload, signature, secretGuess, block.hmacSecret]);

  const resign = async () => {
    const signingInput = `${base64UrlEncode(compact(header))}.${base64UrlEncode(compact(payload))}`;
    setSignature(await hmacSha256(secretGuess || block.hmacSecret, signingInput));
  };

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-abyss-900)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-abyss-800)] px-4 py-2">
        <span className="text-[12px] font-medium text-[var(--color-ink-300)]">JWT inspector</span>
        <span
          className={`chip !py-0 !text-[10px] ${
            state?.valid
              ? '!border-[var(--color-flux-dim)] !text-[var(--color-flux)]'
              : '!border-[var(--color-breach-dim)] !text-[var(--color-breach)]'
          }`}
        >
          {state?.valid ? 'firma valida' : 'firma non valida'}
        </span>
      </div>

      {/* the wire format, coloured by part */}
      <div className="border-b border-[var(--color-line)] px-4 py-2.5">
        <div className="mb-1 text-[10.5px] uppercase tracking-wider text-[var(--color-ink-500)]">Token</div>
        <div className="mono break-all text-[11.5px] leading-relaxed">
          <span className="text-[var(--color-breach)]">{base64UrlEncode(compact(header))}</span>
          <span className="text-[var(--color-ink-500)]">.</span>
          <span className="text-[var(--color-violet)]">{base64UrlEncode(compact(payload))}</span>
          <span className="text-[var(--color-ink-500)]">.</span>
          <span className="text-[var(--color-signal)]">{signature || '(nessuna firma)'}</span>
        </div>
        <div className="mt-1 text-[10.5px] text-[var(--color-ink-500)]">
          {token.length} caratteri · nulla qui è cifrato, solo codificato in base64url
        </div>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-2">
        <Editable label="Header" color="var(--color-breach)" value={header} onChange={setHeader} rows={4} />
        <Editable label="Payload" color="var(--color-violet)" value={payload} onChange={setPayload} rows={8} />
      </div>

      <div className="border-t border-[var(--color-line)] px-4 py-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-[10.5px] uppercase tracking-wider text-[var(--color-ink-500)]">
              Segreto usato per verificare
            </label>
            <input
              value={secretGuess}
              onChange={(e) => setSecretGuess(e.target.value)}
              placeholder={`prova a indovinarlo…`}
              className="mono w-full text-[12px]"
            />
          </div>
          <button className="btn" onClick={() => void resign()} title="Rifirma il token con il segreto inserito">
            <Icon.refresh size={13} /> Rifirma
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setHeader(pretty(base64UrlDecode(initial[0] ?? '')));
              setPayload(pretty(base64UrlDecode(initial[1] ?? '')));
              setSignature(initial[2] ?? '');
              setSecretGuess('');
            }}
          >
            Reset
          </button>
        </div>

        <div
          className={`mt-3 rounded-lg border p-2.5 text-[11.5px] ${
            state?.valid
              ? 'border-[var(--color-flux-dim)] bg-[color-mix(in_oklab,var(--color-flux)_8%,transparent)]'
              : 'border-[var(--color-breach-dim)] bg-[color-mix(in_oklab,var(--color-breach)_8%,transparent)]'
          }`}
        >
          <div
            className="flex items-center gap-1.5 font-semibold"
            style={{ color: state?.valid ? 'var(--color-flux)' : 'var(--color-breach)' }}
          >
            {state?.valid ? <Icon.check size={13} /> : <Icon.x size={12} />}
            {state?.valid
              ? 'Il server accetterebbe questo token.'
              : 'Il server rifiuterebbe questo token.'}
          </div>
          {state?.error && <div className="mono mt-1 text-[11px] text-[var(--color-ink-400)]">{state.error}</div>}
        </div>

        {block.hint && <p className="mt-2 text-[11.5px] text-[var(--color-ink-500)]">{block.hint}</p>}
      </div>
    </div>
  );
}

function Editable({
  label,
  color,
  value,
  onChange,
  rows,
}: {
  label: string;
  color: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  let invalid = false;
  try {
    JSON.parse(value);
  } catch {
    invalid = true;
  }
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color }}>
          {label}
        </span>
        {invalid && <span className="text-[10px] text-[var(--color-amber)]">JSON non valido</span>}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        spellCheck={false}
        className="mono w-full resize-y text-[11.5px] leading-relaxed"
      />
    </div>
  );
}

/** Minify without reformatting user intent away — invalid JSON passes through. */
function compact(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json));
  } catch {
    return json;
  }
}
