'use client';

/**
 * Liste der vier Beispiel-Cases (DESIGN_SPEC §3.4) als Akkordeon.
 *
 * - <ul> mit 4 <li>, je <button aria-expanded aria-controls="case-<id>-panel">: Nummer,
 *   Titel, Schwerpunkte als Namen, Badge „Beispiel“ (sichtbar in jeder Zeile).
 *   Accessible Name nur der Titel (aria-labelledby); Schwerpunkte und Badge als Beschreibung
 *   (aria-describedby), Trenner „ · “ wird als Komma vorgelesen. Der Zustand steht in aria-expanded.
 * - Panel: Teaser, Detail, Leistungsnamen als Tags, statisches Poster (role="img").
 * - Hover (Maus/Stift) und Fokus: Titel x +12 px (Spring 400/30), 6°-Unterstrich scaleX 0 → 1 (350 ms).
 * - Akkordeon: motion height auto, 0,35 s, --ease-out-expo; danach Event 'pm:layout'.
 * - Mobil: Karte mit Poster oben (16:10). Reduced: keine Bewegung, keine Hoehenanimation.
 *
 * Kunden-Feedback 2026-10-14: keine Poster-Vorschau mehr, die dem Mauszeiger folgt
 * (wirkte unruhig und verdeckte den Text), und keine nackten Schwerpunkt-Nummern.
 */
import { useEffect, useState, type PointerEvent } from 'react';
import { m } from 'motion/react';
import { Copy, copyAttrs } from '@/components/copy/Copy';
import { COPY } from '@/content/site';
import type { CaseCopy, CopyText, LeistungNum } from '@/content/types';
import type { CaseId } from '@/lib/scene/ids';
import { useUi } from '@/lib/scene/store';
import CasePoster, { ExampleBadge } from './CasePoster';

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
const ACCORDION_S = 0.35;
const TITLE_SHIFT_PX = 12;
const UI_SPRING = { type: 'spring', stiffness: 400, damping: 30 } as const;
const INSTANT = { duration: 0 } as const;

/*
 * Reflow (WCAG 1.4.10): Lange Woerter wie „Bildungsanbieter“ trennen (lang de-AT, hyphens) und
 * brechen notfalls irgendwo um, statt die Seite bei 320 px zu verbreitern.
 * Niedrige Viewports (≤ 480 px Hoehe, z. B. 400 % Zoom): kompaktere Zeilen, damit ein fokussierter
 * Button moeglichst ganz in den Viewport passt (WCAG 2.4.11/2.4.12).
 */
// Klassen stehen ausgeschrieben im Quelltext, damit Tailwind sie findet (keine zusammengesetzten Namen).
const BUTTON_CLASS =
  'grid w-full grid-cols-[auto_1fr] items-start gap-x-4 py-6 text-left text-ink lg:scroll-mt-28 lg:gap-x-8 lg:py-8 [@media(max-height:480px)]:py-3';
const BUTTON_BODY_CLASS = 'flex min-w-0 flex-col gap-5 [@media(max-height:480px)]:gap-2';
const TITLE_CLASS = [
  'relative block w-fit max-w-full font-display text-[clamp(1.75rem,4vw,3.5rem)] font-extrabold leading-[1.05] tracking-[-0.01em] wdth-100',
  'hyphens-auto [overflow-wrap:anywhere]',
  '[@media(max-height:480px)]:text-[clamp(1.25rem,3vw,2rem)]',
].join(' ');

const SERVICE_TITLES: ReadonlyMap<LeistungNum, CopyText> = new Map<LeistungNum, CopyText>(
  COPY.leistungen.items.map((item) => [item.num, item.title]),
);

const CASES: readonly CaseCopy[] = COPY.arbeiten.cases;

const panelId = (id: CaseId): string => `case-${id}-panel`;
const buttonId = (id: CaseId): string => `case-${id}-button`;
const titleId = (id: CaseId): string => `case-${id}-title`;
const servicesId = (id: CaseId): string => `case-${id}-services`;
const badgeId = (id: CaseId): string => `case-${id}-badge`;
const caseNumber = (index: number): string => String(index + 1).padStart(2, '0');

/** Scroll-Kanal misst danach neu (ScrollTrigger.refresh, debounced). */
function notifyLayout(): void {
  window.dispatchEvent(new Event('pm:layout'));
}

const isHoverPointer = (e: PointerEvent): boolean => e.pointerType === 'mouse' || e.pointerType === 'pen';

/** Schwerpunkt-Namen eines Cases in Originalreihenfolge, z. B. „Webdesign & WordPress · Digitale Kommunikation“. */
function serviceTitles(services: readonly LeistungNum[]): readonly CopyText[] {
  return services.flatMap((num) => {
    const title = SERVICE_TITLES.get(num);
    return title ? [title] : [];
  });
}

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

function ToggleIcon({ isOpen, reduced }: { isOpen: boolean; reduced: boolean }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path d="M2 8h12" />
      <path
        d="M8 2v12"
        className={reduced ? '' : 'transition-transform duration-[350ms] ease-out-expo'}
        style={{ transformOrigin: '8px 8px', transform: isOpen ? 'scaleY(0)' : 'scaleY(1)' }}
      />
    </svg>
  );
}

interface CasePanelProps {
  readonly item: CaseCopy;
  readonly isOpen: boolean;
  readonly reduced: boolean;
}

function CasePanel({ item, isOpen, reduced }: CasePanelProps) {
  return (
    <m.div
      id={panelId(item.id)}
      role="region"
      aria-labelledby={buttonId(item.id)}
      inert={!isOpen}
      className="overflow-hidden"
      initial={false}
      animate={
        isOpen
          ? { height: 'auto', visibility: 'visible' }
          : { height: 0, transitionEnd: { visibility: 'hidden' } }
      }
      transition={reduced ? INSTANT : { duration: ACCORDION_S, ease: EASE_OUT_EXPO }}
      onAnimationComplete={notifyLayout}
    >
      <div className="grid gap-6 pb-8 pt-1 lg:grid-cols-8 lg:gap-x-8 lg:pb-12 lg:pl-[4.5rem]">
        <div className="lg:col-span-5">
          <Copy as="p" value={item.teaser} className="lead text-ink" />
          <Copy
            as="p"
            value={item.detail}
            className="mt-4 max-w-[62ch] text-[1.0625rem] leading-[1.6] text-ink lg:text-[1.125rem]"
          />
          <ul className="mt-6 flex flex-wrap gap-2">
            {serviceTitles(item.services).map((title) => (
              <li
                key={title.text}
                {...copyAttrs(title)}
                className="inline-flex items-center rounded-full border border-ink px-3 py-1.5 text-[0.9375rem] leading-[1.3] text-ink"
              >
                {title.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="hidden lg:col-span-3 lg:block">
          <CasePoster item={item} ratio="portrait" />
        </div>
      </div>
    </m.div>
  );
}

interface CaseRowProps {
  readonly item: CaseCopy;
  readonly index: number;
  readonly isOpen: boolean;
  readonly isHighlighted: boolean;
  readonly reduced: boolean;
  readonly onToggle: (id: CaseId) => void;
  readonly onHover: (id: CaseId, isHovering: boolean) => void;
  readonly onFocusChange: (id: CaseId, hasFocus: boolean) => void;
}

function CaseRow({ item, index, isOpen, isHighlighted, reduced, onToggle, onHover, onFocusChange }: CaseRowProps) {
  const toggleLabel = isOpen ? COPY.ui.caseClose : COPY.ui.caseOpen;
  const shift = isHighlighted && !reduced ? TITLE_SHIFT_PX : 0;
  const services = serviceTitles(item.services);

  return (
    <li className="reveal border-t border-line-light bg-paper-2 last:border-b lg:bg-transparent">
      <div className="lg:hidden">
        <CasePoster item={item} ratio="landscape" />
      </div>
      <div className="px-4 sm:px-6 lg:px-0">
        <button
          id={buttonId(item.id)}
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId(item.id)}
          aria-labelledby={titleId(item.id)}
          aria-describedby={`${servicesId(item.id)} ${badgeId(item.id)}`}
          onClick={() => onToggle(item.id)}
          onPointerEnter={(e) => isHoverPointer(e) && onHover(item.id, true)}
          onPointerLeave={(e) => isHoverPointer(e) && onHover(item.id, false)}
          onFocus={() => onFocusChange(item.id, true)}
          onBlur={() => onFocusChange(item.id, false)}
          className={BUTTON_CLASS}
        >
          <span
            aria-hidden="true"
            className="w-10 pt-[0.4em] font-round text-base font-semibold tabular-nums text-muted-light"
          >
            {caseNumber(index)}
          </span>
          <span className={BUTTON_BODY_CLASS}>
            <m.span
              id={titleId(item.id)}
              className={TITLE_CLASS}
              initial={false}
              animate={{ x: shift }}
              transition={reduced ? INSTANT : UI_SPRING}
            >
              <Copy value={item.title} />
              <span
                aria-hidden="true"
                className={[
                  'absolute left-0 top-full mt-[0.3em] block h-[3px] w-[2.5em] origin-left bg-brand',
                  reduced ? '' : 'transition-transform duration-[350ms] ease-out-expo',
                ].join(' ')}
                style={{ transform: `rotate(-6deg) scaleX(${isHighlighted ? 1 : 0})` }}
              />
            </m.span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span id={servicesId(item.id)} className="font-sans text-[0.9375rem] leading-[1.4] text-muted-light">
                {services.map((title, i) => (
                  <span key={title.text} {...copyAttrs(title)}>
                    {/* Sichtbar „ · “, vorgelesen als Komma-Pause (WCAG 4.1.2) */}
                    {i > 0 && (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span className="sr-only">, </span>
                      </>
                    )}
                    {title.text}
                  </span>
                ))}
              </span>
              <ExampleBadge id={badgeId(item.id)} />
              <span className="ml-auto inline-flex items-center gap-2 font-sans text-[0.875rem] font-semibold uppercase tracking-[0.08em] wdth-75">
                <span data-copy-status={COPY.ui.meta.status}>{toggleLabel}</span>
                <ToggleIcon isOpen={isOpen} reduced={reduced} />
              </span>
            </span>
          </span>
        </button>
        <CasePanel item={item} isOpen={isOpen} reduced={reduced} />
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------

export default function CaseList() {
  const reduced = useUi((s) => s.motion === 'reduced');
  const [openIds, setOpenIds] = useState<ReadonlySet<CaseId>>(() => new Set());
  const [hoverId, setHoverId] = useState<CaseId | null>(null);
  const [focusId, setFocusId] = useState<CaseId | null>(null);

  const highlighted = hoverId ?? focusId;

  // Ohne Hoehenanimation meldet onAnimationComplete nicht verlaesslich: direkt melden.
  useEffect(() => {
    if (reduced) notifyLayout();
  }, [openIds, reduced]);

  const toggle = (id: CaseId): void => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hover = (id: CaseId, isHovering: boolean): void => {
    setHoverId((prev) => (isHovering ? id : prev === id ? null : prev));
  };

  const changeFocus = (id: CaseId, hasFocus: boolean): void => {
    setFocusId((prev) => (hasFocus ? id : prev === id ? null : prev));
  };

  return (
    <ul className="cases flex flex-col gap-4 lg:gap-0">
      {CASES.map((item, index) => (
        <CaseRow
          key={item.id}
          item={item}
          index={index}
          isOpen={openIds.has(item.id)}
          isHighlighted={highlighted === item.id}
          reduced={reduced}
          onToggle={toggle}
          onHover={hover}
          onFocusChange={changeFocus}
        />
      ))}
    </ul>
  );
}
