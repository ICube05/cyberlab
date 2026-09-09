import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useStore } from '../../store.js';

/**
 * A real terminal, wired to the lab's shell.
 *
 * xterm.js handles rendering and input; every entered line becomes a
 * `shell.exec` action, and the server's genuine shell interpreter answers. The
 * prompt reflects the lab's real shell context, so when a `sudo` escalation
 * changes the user, the prompt changes with it.
 */
export function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const lineRef = useRef('');
  const historyRef = useRef<string[]>([]);
  const histIndexRef = useRef(-1);
  const busyRef = useRef(false);

  // Read the current shell context imperatively to keep the prompt fresh.
  const getShell = () => useStore.getState().lab?.shell;
  const runAction = useStore.getState().runAction;

  useEffect(() => {
    const term = new XTerm({
      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      fontSize: 12.5,
      lineHeight: 1.35,
      cursorBlink: true,
      theme: {
        background: '#070a11',
        foreground: '#ccd4e0',
        cursor: '#4f8cff',
        black: '#10151f',
        red: '#ff5d6c',
        green: '#34e2b0',
        yellow: '#ffb454',
        blue: '#4f8cff',
        magenta: '#a98bff',
        cyan: '#5fd7e0',
        white: '#ccd4e0',
        brightBlack: '#6b7688',
      },
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current!);
    fit.fit();
    termRef.current = term;

    const banner = [
      '\x1b[38;2;79;140;255m  CyberLab\x1b[0m lab shell — ambiente isolato, nessuna rete reale.',
      '\x1b[38;2;107;118;136m  Digita `help` per i comandi. Prova: id, sudo -l, ls -la\x1b[0m',
      '',
    ];
    for (const line of banner) term.writeln(line);
    prompt(term);

    const onData = term.onData((data) => handleData(term, data));
    const onResize = () => fit.fit();
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(containerRef.current!);

    return () => {
      onData.dispose();
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function promptString(): string {
    const shell = getShell();
    const user = shell?.user ?? 'seba';
    const host = shell?.host ?? 'lab';
    const cwd = shell?.cwd ?? '~';
    const color = user === 'root' ? '\x1b[38;2;255;93;108m' : '\x1b[38;2;52;226;176m';
    return `${color}${user}@${host}\x1b[0m:\x1b[38;2;79;140;255m${cwd}\x1b[0m${user === 'root' ? '# ' : '$ '}`;
  }

  function prompt(term: XTerm) {
    term.write('\r\n' + promptString());
  }

  async function handleData(term: XTerm, data: string) {
    if (busyRef.current) return;
    const code = data.charCodeAt(0);

    if (data === '\r') {
      const command = lineRef.current.trim();
      term.write('\r\n');
      lineRef.current = '';
      if (!command) {
        term.write(promptString());
        return;
      }
      historyRef.current.push(command);
      histIndexRef.current = historyRef.current.length;
      if (command === 'clear') {
        term.clear();
        term.write(promptString());
        return;
      }
      busyRef.current = true;
      const res = await runAction({ type: 'shell.exec', command });
      busyRef.current = false;
      if (res?.result.type === 'shell.result') {
        const r = res.result.result;
        if (r.stdout) term.write(r.stdout.replace(/\n/g, '\r\n') + '\r\n');
        if (r.stderr) term.write('\x1b[38;2;255;93;108m' + r.stderr.replace(/\n/g, '\r\n') + '\x1b[0m\r\n');
      } else if (res?.result.type === 'error') {
        term.write('\x1b[38;2;255;93;108m' + res.result.message + '\x1b[0m\r\n');
      }
      term.write(promptString());
      return;
    }

    if (code === 127) {
      if (lineRef.current.length > 0) {
        lineRef.current = lineRef.current.slice(0, -1);
        term.write('\b \b');
      }
      return;
    }

    if (data === '\x1b[A') {
      // up: history
      if (histIndexRef.current > 0) {
        histIndexRef.current -= 1;
        replaceLine(term, historyRef.current[histIndexRef.current] ?? '');
      }
      return;
    }
    if (data === '\x1b[B') {
      if (histIndexRef.current < historyRef.current.length - 1) {
        histIndexRef.current += 1;
        replaceLine(term, historyRef.current[histIndexRef.current] ?? '');
      } else {
        histIndexRef.current = historyRef.current.length;
        replaceLine(term, '');
      }
      return;
    }
    if (data === '\x03') {
      term.write('^C');
      lineRef.current = '';
      term.write(promptString());
      return;
    }
    if (code < 32) return;

    lineRef.current += data;
    term.write(data);
  }

  function replaceLine(term: XTerm, next: string) {
    term.write('\r\x1b[K' + promptString() + next);
    lineRef.current = next;
  }

  return <div ref={containerRef} className="h-full w-full bg-[var(--color-abyss-900)]" />;
}
