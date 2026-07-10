import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crown, Sparkles, X } from 'lucide-react';
import type { Hero, HeroShowcaseSpec } from '../game/types';
import { formatNumber } from '../utils/formatNumber';
import { triggerHaptic } from '../utils/haptics';
import { AngelShowcaseScene } from './AngelShowcaseScene';
import './AngelShowcase.css';

interface AngelShowcaseProps {
  hero: Hero;
  onClose: () => void;
  portrait: string;
  showcase: HeroShowcaseSpec;
}

export function AngelShowcase({ hero, onClose, portrait, showcase }: AngelShowcaseProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [surgeSignal, setSurgeSignal] = useState(0);

  const unleashSurge = useCallback(() => {
    if (!ready || loadFailed) {
      return;
    }
    triggerHaptic('heavy');
    setSurgeSignal(signal => signal + 1);
  }, [loadFailed, ready]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }

      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      )];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyboard);
    };
  }, [onClose]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const timeout = window.setTimeout(() => setSurgeSignal(signal => signal + 1), 620);
    return () => window.clearTimeout(timeout);
  }, [ready]);

  return createPortal(
    <section
      aria-labelledby="angel-showcase-title"
      aria-modal="true"
      className="angel-showcase"
      data-ready={ready ? 'true' : 'false'}
      data-surge-signal={surgeSignal}
      ref={dialogRef}
      role="dialog"
    >
      <div className="angel-showcase-atmosphere" aria-hidden="true" />
      <div className="angel-showcase-fallback" data-visible={!ready || loadFailed ? 'true' : 'false'}>
        <img alt="" decoding="async" src={portrait} />
        {!loadFailed && <span>Awakening celestial form</span>}
      </div>

      {!loadFailed && (
        <AngelShowcaseScene
          onError={() => setLoadFailed(true)}
          onReady={() => setReady(true)}
          showcase={showcase}
          surgeSignal={surgeSignal}
        />
      )}

      <header className="angel-showcase-header">
        <span className="angel-showcase-rarity"><Crown size={13} aria-hidden="true" /> Mythic ascension</span>
        <h2 id="angel-showcase-title">{hero.name}</h2>
        <p>Celestial Dragon Sovereign</p>
      </header>

      <button
        aria-label="Close hero showcase"
        autoFocus
        className="angel-showcase-close"
        onClick={onClose}
        title="Close"
        type="button"
      >
        <X aria-hidden="true" size={22} />
      </button>

      <footer className="angel-showcase-footer">
        <div className="angel-showcase-stat">
          <span>Ascension {hero.ascension}</span>
          <strong>{formatNumber(hero.power)} <small>power</small></strong>
        </div>
        <button
          aria-label="Unleash Celestial Surge"
          className="angel-surge-action"
          disabled={!ready || loadFailed}
          onClick={unleashSurge}
          title="Celestial Surge"
          type="button"
        >
          <span aria-hidden="true"><Sparkles size={25} /></span>
          <b>Celestial Surge</b>
        </button>
      </footer>

      {loadFailed && (
        <div className="angel-showcase-error" role="status">
          Celestial form is temporarily unavailable.
        </div>
      )}
    </section>,
    document.body,
  );
}
