import { useEffect, useRef, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, GitMerge, LockKeyhole, Server, Sparkles, Users, X } from 'lucide-react';
import type { RealmContext, RealmDirectory, RealmSummary } from '../shared/realm';
import './RealmSwitcher.css';

interface RealmSwitcherProps {
  activeRealm: RealmContext;
  busy: boolean;
  directory: RealmDirectory;
  onClose: () => void;
  onSelect: (realm: RealmSummary) => Promise<boolean>;
}

const getRealmAction = (realm: RealmSummary, activeCharacterId: string) => {
  if (realm.characterId === activeCharacterId) {
    return { disabled: true, label: 'Active' };
  }
  if (realm.characterId) {
    return { disabled: false, label: 'Continue' };
  }
  if (realm.kind === 'standard' && realm.status === 'open') {
    return { disabled: false, label: 'Start fresh' };
  }
  return { disabled: true, label: 'Locked' };
};

export function RealmSwitcher({
  activeRealm,
  busy,
  directory,
  onClose,
  onSelect,
}: RealmSwitcherProps) {
  const reducedMotion = useReducedMotion();
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleDialogKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !sheetRef.current) {
        return;
      }
      const focusable = [...sheetRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', handleDialogKeyboard);
    return () => {
      window.removeEventListener('keydown', handleDialogKeyboard);
      document.querySelector<HTMLButtonElement>('.player-hud')?.focus();
    };
  }, [busy, onClose]);

  const selectRealm = (realm: RealmSummary) => {
    if (busy) {
      return;
    }
    void onSelect(realm).then(switched => {
      if (switched) {
        onClose();
      }
    });
  };

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="realm-switcher-backdrop"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={() => !busy && onClose()}
      role="presentation"
    >
      <motion.section
        animate={{ y: 0 }}
        aria-busy={busy}
        aria-labelledby="realm-switcher-title"
        aria-modal="true"
        className="realm-switcher-sheet"
        exit={{ y: reducedMotion ? 0 : '100%' }}
        initial={{ y: reducedMotion ? 0 : '100%' }}
        onClick={event => event.stopPropagation()}
        role="dialog"
        ref={sheetRef}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
      >
        <header className="realm-switcher-header">
          <span className="realm-switcher-mark" aria-hidden="true"><Server size={20} /></span>
          <div>
            <span>Realm network</span>
            <h2 id="realm-switcher-title">World Servers</h2>
          </div>
          <button autoFocus aria-label="Close server selection" disabled={busy} onClick={onClose} type="button">
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="active-realm-strip">
          <span>Active realm</span>
          <strong>{activeRealm.canonicalRealmCode}</strong>
          {activeRealm.originRealmCode !== activeRealm.canonicalRealmCode && (
            <small>Origin {activeRealm.originRealmCode}</small>
          )}
        </div>

        <div className="realm-list" aria-label="Available world servers">
          {directory.realms.map(realm => {
            const action = getRealmAction(realm, activeRealm.characterId);
            const fill = Math.min(100, (realm.population / Math.max(1, realm.softCapacity)) * 100);
            const isMerged = realm.canonicalRealmId !== realm.id;
            return (
              <article className={`realm-row ${realm.isRecommended ? 'recommended' : ''}`} key={realm.id}>
                <span className="realm-row-emblem" aria-hidden="true">
                  {isMerged ? <GitMerge size={19} /> : realm.status === 'open' ? <Sparkles size={19} /> : <LockKeyhole size={18} />}
                </span>
                <div className="realm-row-copy">
                  <div>
                    <strong>{realm.code}</strong>
                    {realm.isRecommended && <span>New</span>}
                    {isMerged && <span>{realm.canonicalRealmCode}</span>}
                  </div>
                  <small><Users size={12} aria-hidden="true" /> {realm.population.toLocaleString()}</small>
                  <span
                    aria-hidden="true"
                    className="realm-population-track"
                    style={{ '--realm-fill': `${fill}%` } as CSSProperties}
                  />
                </div>
                <button
                  className={action.disabled ? 'realm-action-disabled' : ''}
                  disabled={busy || action.disabled}
                  onClick={() => selectRealm(realm)}
                  type="button"
                >
                  {realm.characterId === activeRealm.characterId && <Check size={14} aria-hidden="true" />}
                  {busy && !action.disabled ? 'Wait' : action.label}
                </button>
              </article>
            );
          })}
        </div>
      </motion.section>
    </motion.div>
  );
}
