import { useState } from 'react';
import type { CookieJarBlock } from '@cyberlab/core';
import { Icon } from '../../icons.js';

/**
 * The cookie attribute playground.
 *
 * Cookie attributes are taught as a list to memorise and then misremembered
 * forever. Here they are a machine: flip an attribute, pick a situation, and
 * the widget answers the only question that matters — *is the cookie sent?* —
 * and says which rule decided. The rules below are the real ones from RFC 6265bis
 * and the SameSite spec, not a simplification: Secure gates the scheme,
 * SameSite gates cross-site requests by kind, and HttpOnly does not affect
 * sending at all, only whether script can read it. That last one is the
 * misconception this block exists to kill.
 */

type SameSite = 'Strict' | 'Lax' | 'None';

interface Attributes {
  httpOnly: boolean;
  secure: boolean;
  sameSite: SameSite;
}

interface Verdict {
  sent: boolean;
  reason: string;
  /** The attribute that decided, for the highlight. */
  decidedBy: keyof Attributes | 'none';
}

/** The actual browser decision, in the order a browser applies it. */
function evaluate(
  attributes: Attributes,
  scenario: { crossSite: boolean; fromScript?: boolean; url: string },
): Verdict {
  const isHttps = scenario.url.startsWith('https://');

  if (attributes.secure && !isHttps) {
    return {
      sent: false,
      reason: 'Secure impone HTTPS: su http:// il cookie non viene inviato affatto.',
      decidedBy: 'secure',
    };
  }
  if (attributes.sameSite === 'None' && !attributes.secure) {
    return {
      sent: false,
      reason: 'SameSite=None senza Secure viene rifiutato dai browser moderni: il cookie non è nemmeno impostato.',
      decidedBy: 'sameSite',
    };
  }
  if (!scenario.crossSite) {
    return {
      sent: true,
      reason: 'Richiesta same-site: nessuna restrizione SameSite si applica.',
      decidedBy: 'none',
    };
  }
  if (attributes.sameSite === 'Strict') {
    return {
      sent: false,
      reason: 'SameSite=Strict blocca ogni richiesta cross-site, anche cliccando un link.',
      decidedBy: 'sameSite',
    };
  }
  if (attributes.sameSite === 'Lax') {
    if (scenario.fromScript) {
      return {
        sent: false,
        reason: 'SameSite=Lax invia il cookie solo su navigazioni top-level GET. Questa non lo è.',
        decidedBy: 'sameSite',
      };
    }
    return {
      sent: true,
      reason: 'SameSite=Lax consente le navigazioni top-level GET: il cookie parte.',
      decidedBy: 'sameSite',
    };
  }
  return {
    sent: true,
    reason: 'SameSite=None: il cookie viaggia anche cross-site. È esattamente lo scenario che rende possibile il CSRF.',
    decidedBy: 'sameSite',
  };
}

export function CookieJar({ block }: { block: CookieJarBlock }) {
  const [attributes, setAttributes] = useState<Attributes>({
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  });
  const [scenarioId, setScenarioId] = useState(block.scenarios[0]?.id ?? '');

  const scenario = block.scenarios.find((s) => s.id === scenarioId) ?? block.scenarios[0];
  const verdict = scenario
    ? evaluate(attributes, scenario)
    : { sent: false, reason: 'Nessuno scenario.', decidedBy: 'none' as const };

  const setCookieHeader = [
    `${block.cookieName}=${block.cookieValue}`,
    'Path=/',
    attributes.httpOnly ? 'HttpOnly' : null,
    attributes.secure ? 'Secure' : null,
    `SameSite=${attributes.sameSite}`,
  ]
    .filter(Boolean)
    .join('; ');

  const highlight = (key: keyof Attributes) =>
    verdict.decidedBy === key ? 'border-[var(--color-signal)] bg-[color-mix(in_oklab,var(--color-signal)_12%,transparent)]' : 'border-[var(--color-line)]';

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-abyss-900)]">
      <div className="border-b border-[var(--color-line)] bg-[var(--color-abyss-800)] px-4 py-2 text-[12px] font-medium text-[var(--color-ink-300)]">
        Cookie playground · <span className="mono text-[var(--color-ink-100)]">{block.cookieName}</span>
      </div>

      {/* the header the server would send */}
      <div className="border-b border-[var(--color-line)] px-4 py-2.5">
        <div className="mb-1 text-[10.5px] uppercase tracking-wider text-[var(--color-ink-500)]">Set-Cookie</div>
        <code className="mono block break-all text-[12px] text-[var(--color-flux)]">{setCookieHeader}</code>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-2">
        {/* attributes */}
        <div className="space-y-2">
          <div className="text-[10.5px] uppercase tracking-wider text-[var(--color-ink-500)]">Attributi</div>

          <button
            onClick={() => setAttributes((a) => ({ ...a, httpOnly: !a.httpOnly }))}
            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] transition-colors ${highlight('httpOnly')}`}
          >
            <Toggle on={attributes.httpOnly} />
            <div className="flex-1">
              <div className="mono text-[var(--color-ink-100)]">HttpOnly</div>
              <div className="text-[11px] text-[var(--color-ink-500)]">
                {attributes.httpOnly ? 'document.cookie non lo vede' : 'leggibile da JavaScript — un XSS lo ruba'}
              </div>
            </div>
          </button>

          <button
            onClick={() => setAttributes((a) => ({ ...a, secure: !a.secure }))}
            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] transition-colors ${highlight('secure')}`}
          >
            <Toggle on={attributes.secure} />
            <div className="flex-1">
              <div className="mono text-[var(--color-ink-100)]">Secure</div>
              <div className="text-[11px] text-[var(--color-ink-500)]">
                {attributes.secure ? 'solo su HTTPS' : 'viaggia anche in chiaro su HTTP'}
              </div>
            </div>
          </button>

          <div className={`rounded-lg border px-3 py-2 transition-colors ${highlight('sameSite')}`}>
            <div className="mono mb-1.5 text-[12px] text-[var(--color-ink-100)]">SameSite</div>
            <div className="flex gap-1">
              {(['Strict', 'Lax', 'None'] as SameSite[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setAttributes((a) => ({ ...a, sameSite: value }))}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
                    attributes.sameSite === value
                      ? 'bg-[var(--color-signal)] text-white'
                      : 'bg-[var(--color-abyss-700)] text-[var(--color-ink-400)] hover:text-[var(--color-ink-200)]'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* scenario + verdict */}
        <div className="space-y-2">
          <div className="text-[10.5px] uppercase tracking-wider text-[var(--color-ink-500)]">Situazione</div>
          <div className="space-y-1">
            {block.scenarios.map((s) => (
              <button
                key={s.id}
                onClick={() => setScenarioId(s.id)}
                className={`w-full rounded-lg border px-3 py-1.5 text-left text-[11.5px] transition-colors ${
                  scenarioId === s.id
                    ? 'border-[var(--color-line-strong)] bg-[var(--color-abyss-700)] text-[var(--color-ink-100)]'
                    : 'border-[var(--color-line)] text-[var(--color-ink-400)] hover:text-[var(--color-ink-200)]'
                }`}
              >
                <div>{s.label}</div>
                <div className="mono text-[10px] text-[var(--color-ink-500)]">{s.url}</div>
              </button>
            ))}
          </div>

          <div
            className={`rounded-lg border p-3 ${
              verdict.sent
                ? 'border-[var(--color-flux-dim)] bg-[color-mix(in_oklab,var(--color-flux)_8%,transparent)]'
                : 'border-[var(--color-breach-dim)] bg-[color-mix(in_oklab,var(--color-breach)_8%,transparent)]'
            }`}
          >
            <div
              className="flex items-center gap-1.5 text-[12.5px] font-semibold"
              style={{ color: verdict.sent ? 'var(--color-flux)' : 'var(--color-breach)' }}
            >
              {verdict.sent ? <Icon.check size={14} /> : <Icon.x size={13} />}
              {verdict.sent ? 'Cookie inviato' : 'Cookie NON inviato'}
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--color-ink-400)]">{verdict.reason}</p>
            {scenario?.fromScript && (
              <p className="mt-1.5 border-t border-[var(--color-line)] pt-1.5 text-[11px] text-[var(--color-ink-500)]">
                Nota: <span className="mono">HttpOnly</span> non c’entra con l’invio. Decide solo se{' '}
                <span className="mono">document.cookie</span> può <em>leggerlo</em>
                {attributes.httpOnly ? ' — e ora non può.' : ' — e ora può.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors ${
        on
          ? 'border-[var(--color-flux)] bg-[var(--color-flux)] text-[var(--color-abyss-900)]'
          : 'border-[var(--color-line-strong)] text-transparent'
      }`}
    >
      <Icon.check size={11} />
    </span>
  );
}
