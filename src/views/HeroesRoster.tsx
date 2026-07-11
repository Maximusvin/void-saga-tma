import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowDownWideNarrow,
  Check,
  Coins,
  Crown,
  Maximize2,
  Plus,
  ShieldMinus,
  Sparkles,
  Swords,
  Zap,
} from 'lucide-react';
import { HeroPortrait } from '../components/HeroPortrait';
import {
  RARITY_ORDER,
  getAscensionShardCost,
  getHeroCombatFocus,
  getHeroLevelCap,
  getHeroTemplateById,
  getHeroUpgradeQuote,
  getNextHeroPower,
  getPassivePower,
  getUpgradeCost,
  isHeroAtLevelCap,
} from '../game/balance';
import { compareGameNumbers, type GameNumber } from '../game/gameNumber';
import type { Hero, HeroUpgradeAmount } from '../game/types';
import { MAX_ACTIVE_WARBAND_HEROES } from '../game/warband';
import { formatNumber } from '../utils/formatNumber';
import { triggerHaptic } from '../utils/haptics';
import './HeroesRoster.css';

const AngelShowcase = lazy(() => import('./AngelShowcase').then(module => ({
  default: module.AngelShowcase,
})));

const HeroVideoShowcase = lazy(() => import('./HeroVideoShowcase').then(module => ({
  default: module.HeroVideoShowcase,
})));

type HeroFilter = 'all' | 'warband';
type HeroSort = 'rarity' | 'power' | 'level';

interface HeroesRosterProps {
  activeHeroIds: string[];
  ascendHero: (id: string) => boolean;
  gold: GameNumber;
  heroes: Hero[];
  setActiveWarband: (heroIds: string[]) => Promise<boolean>;
  upgradeHero: (id: string, amount: HeroUpgradeAmount) => boolean;
}

interface HeroCardProps {
  active: boolean;
  eager: boolean;
  gold: GameNumber;
  hero: Hero;
  onPreview: (hero: Hero) => void;
  onProgress: (hero: Hero) => void;
  onToggle: (hero: Hero) => void;
  progress: 'ascend' | 'upgrade' | null;
  upgradeAmount: HeroUpgradeAmount;
}

const HeroCard = memo(function HeroCard({
  active,
  eager,
  gold,
  hero,
  onPreview,
  onProgress,
  onToggle,
  progress,
  upgradeAmount,
}: HeroCardProps) {
  const template = getHeroTemplateById(hero.templateId);
  const atLevelCap = isHeroAtLevelCap(hero);
  const levelCap = getHeroLevelCap(hero);
  const ascensionCost = getAscensionShardCost(hero);
  const canAscend = atLevelCap && hero.shards >= ascensionCost;
  const upgradeQuote = getHeroUpgradeQuote(hero, gold, upgradeAmount);
  const canUpgrade = !atLevelCap && upgradeQuote.levelsGained > 0;
  const displayedUpgradeCost = canUpgrade ? upgradeQuote.goldCost : getUpgradeCost(hero);
  const nextPower = upgradeQuote.levelsGained > 0 ? upgradeQuote.power : getNextHeroPower(hero);
  const style = {
    '--hero-accent': template?.accentColor ?? '#9eb8b5',
  } as CSSProperties;

  return (
    <article
      className={`hero-card rarity-${hero.rarity.toLowerCase()} ${active ? 'active' : ''}`}
      data-active={active ? 'true' : 'false'}
      data-progress={progress ?? 'idle'}
      style={style}
    >
      <div className="hero-card-visual">
        <HeroPortrait eager={eager} hero={hero} />
        {(template?.showcase || template?.videoShowcase) && (
          <button
            aria-label={`Preview ${hero.name} animation`}
            className="hero-preview-action"
            data-preview-hero-id={hero.id}
            onClick={() => onPreview(hero)}
            title="View animated hero"
            type="button"
          >
            <Maximize2 aria-hidden="true" size={16} />
          </button>
        )}
        <span className="hero-rarity">{hero.rarity}</span>
        <span className="hero-level">Lv.{hero.level}</span>
        {active && <span className="hero-active-mark"><Check size={12} /> Active</span>}
      </div>

      <div className="hero-card-copy">
        <div className="hero-title-row">
          <div>
            <h3>{hero.name}</h3>
            <p>{template?.combatRole ?? 'Riftbound'} · {getHeroCombatFocus(hero)}</p>
          </div>
          <strong><Zap size={12} />{formatNumber(hero.power)}</strong>
        </div>

        <div className="hero-progress-copy">
          <span>
            {atLevelCap
              ? `Ascension ${hero.ascension}`
              : `${upgradeQuote.levelsGained > 0 ? `+${upgradeQuote.levelsGained}` : 'Next'} ${formatNumber(nextPower)}`}
          </span>
          <span>{atLevelCap ? `${hero.shards}/${ascensionCost}` : `${hero.level}/${levelCap}`}</span>
        </div>

        <div className="hero-card-actions">
          <button
            aria-label={active ? `Remove ${hero.name} from Warband` : `Add ${hero.name} to Warband`}
            aria-pressed={active}
            className="hero-team-action"
            onClick={() => onToggle(hero)}
            title={active ? 'Remove from Warband' : 'Add or swap into Warband'}
            type="button"
          >
            {active ? <ShieldMinus size={17} /> : <Plus size={18} />}
          </button>
          <button
            className="hero-upgrade-action"
            disabled={atLevelCap ? !canAscend : !canUpgrade}
            onClick={() => onProgress(hero)}
            type="button"
          >
            {atLevelCap ? <Sparkles size={15} /> : <Coins size={15} />}
            <span>
              <b>{atLevelCap ? 'Ascend' : `Upgrade${upgradeQuote.levelsGained > 1 ? ` +${upgradeQuote.levelsGained}` : ''}`}</b>
              <small>{atLevelCap ? `${hero.shards}/${ascensionCost} shards` : formatNumber(displayedUpgradeCost)}</small>
            </span>
          </button>
        </div>
      </div>
      {progress && (
        <span className="hero-progress-flash" role="status">
          {progress === 'ascend' ? 'Ascended' : 'Power increased'}
        </span>
      )}
    </article>
  );
});

export function HeroesRoster({
  activeHeroIds,
  ascendHero,
  gold,
  heroes,
  setActiveWarband,
  upgradeHero,
}: HeroesRosterProps) {
  const [filter, setFilter] = useState<HeroFilter>('all');
  const [progress, setProgress] = useState<{ heroId: string; type: 'ascend' | 'upgrade' } | null>(null);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [showcaseHero, setShowcaseHero] = useState<Hero | null>(null);
  const [sort, setSort] = useState<HeroSort>('rarity');
  const [teamPending, setTeamPending] = useState(false);
  const [upgradeAmount, setUpgradeAmount] = useState<HeroUpgradeAmount>(1);
  const progressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeHeroIdSet = useMemo(() => new Set(activeHeroIds), [activeHeroIds]);
  const heroesById = useMemo(() => new Map(heroes.map(hero => [hero.id, hero])), [heroes]);
  const activeHeroes = useMemo(
    () => activeHeroIds.flatMap(heroId => {
      const activeHero = heroesById.get(heroId);
      return activeHero ? [activeHero] : [];
    }),
    [activeHeroIds, heroesById],
  );
  const teamPower = useMemo(() => getPassivePower(activeHeroes), [activeHeroes]);
  const visibleHeroes = useMemo(() => {
    const filteredHeroes = filter === 'warband'
      ? heroes.filter(hero => activeHeroIdSet.has(hero.id))
      : heroes;

    return [...filteredHeroes].sort((left, right) => {
      if (sort === 'power') {
        const powerOrder = compareGameNumbers(right.power, left.power);
        return powerOrder !== 0 ? powerOrder : right.level - left.level;
      }
      if (sort === 'level') {
        return right.level - left.level || RARITY_ORDER[right.rarity] - RARITY_ORDER[left.rarity];
      }
      return RARITY_ORDER[right.rarity] - RARITY_ORDER[left.rarity] || right.level - left.level;
    });
  }, [activeHeroIdSet, filter, heroes, sort]);

  useEffect(() => {
    if (selectedSlot >= Math.max(1, activeHeroIds.length)) {
      setSelectedSlot(Math.max(0, activeHeroIds.length - 1));
    }
  }, [activeHeroIds.length, selectedSlot]);

  useEffect(() => () => {
    if (progressTimeoutRef.current) {
      clearTimeout(progressTimeoutRef.current);
    }
  }, []);

  const showProgress = useCallback((heroId: string, type: 'ascend' | 'upgrade') => {
    if (progressTimeoutRef.current) {
      clearTimeout(progressTimeoutRef.current);
    }
    setProgress({ heroId, type });
    progressTimeoutRef.current = setTimeout(() => setProgress(null), 700);
  }, []);

  const handleProgress = useCallback((hero: Hero) => {
    const atLevelCap = isHeroAtLevelCap(hero);
    const changed = atLevelCap
      ? ascendHero(hero.id)
      : upgradeHero(hero.id, upgradeAmount);
    if (!changed) {
      return;
    }
    triggerHaptic('heavy');
    showProgress(hero.id, atLevelCap ? 'ascend' : 'upgrade');
  }, [ascendHero, showProgress, upgradeAmount, upgradeHero]);

  const handleTeamToggle = useCallback(async (hero: Hero) => {
    if (teamPending) {
      return;
    }

    const isActive = activeHeroIdSet.has(hero.id);
    let nextHeroIds: string[];
    if (isActive) {
      nextHeroIds = activeHeroIds.filter(heroId => heroId !== hero.id);
    } else if (activeHeroIds.length < MAX_ACTIVE_WARBAND_HEROES) {
      nextHeroIds = [...activeHeroIds, hero.id];
    } else {
      nextHeroIds = activeHeroIds.map((heroId, index) => index === selectedSlot ? hero.id : heroId);
    }

    setTeamPending(true);
    const changed = await setActiveWarband(nextHeroIds);
    setTeamPending(false);
    if (changed) {
      triggerHaptic('medium');
    }
  }, [activeHeroIdSet, activeHeroIds, selectedSlot, setActiveWarband, teamPending]);

  const handleShowcaseClose = useCallback(() => {
    const previewHeroId = showcaseHero?.id;
    setShowcaseHero(null);
    if (previewHeroId) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLButtonElement>(
          `[data-preview-hero-id="${previewHeroId}"]`,
        )?.focus({ preventScroll: true });
      });
    }
  }, [showcaseHero]);

  const showcaseTemplate = showcaseHero ? getHeroTemplateById(showcaseHero.templateId) : null;

  return (
    <div className="view-container roster-view">
      <section className="warband-command" aria-labelledby="warband-title">
        <div className="warband-heading">
          <div>
            <span className="warband-kicker"><Crown size={12} /> Active formation</span>
            <h1 id="warband-title">Warband</h1>
          </div>
          <div className="warband-power">
            <small>Team power</small>
            <strong><Zap size={14} /> {formatNumber(teamPower)}</strong>
          </div>
        </div>

        <div className="active-warband-slots" aria-label={`${activeHeroes.length} of 4 active heroes`}>
          {Array.from({ length: MAX_ACTIVE_WARBAND_HEROES }, (_, index) => {
            const activeHero = activeHeroes[index];
            return activeHero ? (
              <button
                aria-label={`Select slot ${index + 1}, ${activeHero.name}`}
                aria-pressed={selectedSlot === index}
                className={`active-hero-slot ${selectedSlot === index ? 'selected' : ''}`}
                key={activeHero.id}
                onClick={() => setSelectedSlot(index)}
                type="button"
              >
                <HeroPortrait animated eager hero={activeHero} />
                <span>{index + 1}</span>
                <b>Lv.{activeHero.level}</b>
              </button>
            ) : (
              <span className="active-hero-slot empty" key={`empty-${index}`}>
                <Plus size={20} />
                <span>{index + 1}</span>
              </span>
            );
          })}
        </div>
      </section>

      <section className="roster-collection" aria-labelledby="collection-title">
        <div className="roster-toolbar">
          <div className="collection-heading">
            <span>Collection</span>
            <h2 id="collection-title">Heroes <b>{heroes.length}</b></h2>
          </div>
          <div className="roster-filters">
            <div className="roster-filter-tabs" aria-label="Hero filter">
              <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')} type="button">All</button>
              <button aria-pressed={filter === 'warband'} onClick={() => setFilter('warband')} type="button">
                <Swords size={13} /> Team
              </button>
            </div>
            <label className="hero-sort">
              <ArrowDownWideNarrow size={15} />
              <span className="sr-only">Sort heroes</span>
              <select onChange={event => setSort(event.target.value as HeroSort)} value={sort}>
                <option value="rarity">Rarity</option>
                <option value="power">Power</option>
                <option value="level">Level</option>
              </select>
            </label>
          </div>
        </div>

        <div className="upgrade-mode" aria-label="Upgrade amount">
          {([1, 10, 'max'] as const).map(amount => (
            <button
              aria-pressed={upgradeAmount === amount}
              key={amount}
              onClick={() => setUpgradeAmount(amount)}
              type="button"
            >
              {amount === 'max' ? 'MAX' : `+${amount}`}
            </button>
          ))}
        </div>

        {visibleHeroes.length === 0 ? (
          <div className="roster-empty">
            <Sparkles size={24} />
            <p>{heroes.length === 0 ? 'Your first riftbound hero awaits.' : 'No heroes in this formation.'}</p>
          </div>
        ) : (
          <div className="roster-grid" data-hero-count={visibleHeroes.length}>
            {visibleHeroes.map((hero, index) => (
              <HeroCard
                active={activeHeroIdSet.has(hero.id)}
                eager={index < 4}
                gold={gold}
                hero={hero}
                key={hero.id}
                onPreview={setShowcaseHero}
                onProgress={handleProgress}
                onToggle={handleTeamToggle}
                progress={progress?.heroId === hero.id ? progress.type : null}
                upgradeAmount={upgradeAmount}
              />
            ))}
          </div>
        )}
        <span className="sr-only" aria-live="polite">
          {teamPending ? 'Updating Warband' : `${activeHeroes.length} active heroes`}
        </span>
      </section>
      {showcaseHero && showcaseTemplate?.showcase && (
        <Suspense fallback={null}>
          <AngelShowcase
            hero={showcaseHero}
            onClose={handleShowcaseClose}
            portrait={showcaseTemplate.portrait}
            showcase={showcaseTemplate.showcase}
          />
        </Suspense>
      )}
      {showcaseHero && showcaseTemplate?.videoShowcase && !showcaseTemplate.showcase && (
        <Suspense fallback={null}>
          <HeroVideoShowcase
            hero={showcaseHero}
            onClose={handleShowcaseClose}
            portrait={showcaseTemplate.videoShowcase.poster}
            showcase={showcaseTemplate.videoShowcase}
          />
        </Suspense>
      )}
    </div>
  );
}
