import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X } from 'lucide-react';
import type { Hero, HeroVideoShowcaseSpec } from '../game/types';
import { formatNumber } from '../utils/formatNumber';
import './HeroVideoShowcase.css';

interface HeroVideoShowcaseProps {
  hero: Hero;
  onClose: () => void;
  portrait: string;
  showcase: HeroVideoShowcaseSpec;
}

// Lightweight "living hero" showcase: a poster shows instantly, then a small,
// seamlessly-looping AI-generated idle clip fades in over it. One at a time,
// lazy-loaded and portal-mounted like AngelShowcase, but a plain <video> rather
// than a WebGL scene. Respects prefers-reduced-motion (poster only).
export function HeroVideoShowcase({ hero, onClose, portrait, showcase }: HeroVideoShowcaseProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reduceMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

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

  const showVideo = !reduceMotion && !failed;

  return createPortal(
    <section
      aria-labelledby="video-showcase-title"
      aria-modal="true"
      className="video-showcase"
      data-ready={ready && showVideo ? 'true' : 'false'}
      ref={dialogRef}
      role="dialog"
    >
      <div className="video-showcase-atmosphere" aria-hidden="true" />

      <div className="video-showcase-stage">
        <img className="video-showcase-poster" alt="" decoding="async" src={portrait} />
        {showVideo && (
          <video
            className="video-showcase-media"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            poster={portrait}
            onCanPlay={() => setReady(true)}
            onError={() => setFailed(true)}
          >
            <source src={showcase.video} type="video/mp4" />
          </video>
        )}
      </div>

      <header className="video-showcase-header">
        <span className="video-showcase-rarity">
          <Sparkles size={13} aria-hidden="true" /> {hero.rarity}
        </span>
        <h2 id="video-showcase-title">{hero.name}</h2>
        <p>{showcase.tagline}</p>
      </header>

      <button
        aria-label="Close hero showcase"
        autoFocus
        className="video-showcase-close"
        onClick={onClose}
        title="Close"
        type="button"
      >
        <X aria-hidden="true" size={22} />
      </button>

      <footer className="video-showcase-footer">
        <div className="video-showcase-stat">
          <span>Ascension {hero.ascension}</span>
          <strong>
            {formatNumber(hero.power)} <small>power</small>
          </strong>
        </div>
      </footer>
    </section>,
    document.body,
  );
}
