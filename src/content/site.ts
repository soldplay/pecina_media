/**
 * Alle sichtbaren Texte der Website (DESIGN_SPEC §3, §4, §5.5; F_foundation.md).
 *
 * - Jeder Text traegt Status und Quelle (siehe CopyStatus in ./types).
 * - Texte mit Status 'original' sind Zeichen fuer Zeichen gegen die Quellen geprueft:
 *   klartext.org/agb/pecina-media (abgerufen 14.10.2026) und pecinamedia.at/Impressum (BRIEF §1.4).
 *   Weicht ein Quelltext nur in der Markenschreibweise ab (Quelle „Klartext Weiterbildung“, hier
 *   „KLARTEXT! Weiterbildung“), steht er als 'entwurf' mit Vermerk, bis der Kunde freigibt.
 * - Nichts doppelt: Wiederkehrende Werte (Name, Adresse, Telefon, Claims, Bereichsnamen)
 *   sind einmal definiert und werden referenziert bzw. zusammengesetzt.
 * - Keine Texte erfinden. Fehlt einem Paket ein Text, meldet es das dem Integrator.
 */
import type { SectionId, StationId } from '@/lib/scene/ids';
import type {
  CaseCopy,
  CopyGroupMeta,
  CopyList,
  CopyStatus,
  CopyText,
  CreditEntry,
  LeistungCopy,
  NavItem,
  PrincipleCopy,
  ProcessStepCopy,
  StationCopy,
} from '@/content/types';

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------

const c = (text: string, status: CopyStatus, source?: string, note?: string): CopyText =>
  Object.freeze({
    text,
    status,
    ...(source === undefined ? {} : { source }),
    ...(note === undefined ? {} : { note }),
  });

const list = (items: readonly string[], status: CopyStatus, source?: string): CopyList =>
  Object.freeze({
    items: Object.freeze([...items]),
    status,
    ...(source === undefined ? {} : { source }),
  });

/** Setzt Zeilen (z. B. fuer CutHeading `lines`) mit einem Leerzeichen zum Gesamttext zusammen. */
const joinLines = (lines: readonly CopyText[], status: CopyStatus, source: string): CopyText =>
  c(lines.map((line) => line.text).join(' '), status, source);

const spec = (section: string): string => `DESIGN_SPEC ${section}`;

const SRC = {
  agb: 'klartext.org/agb/pecina-media (abgerufen 14.10.2026)',
  impressum: 'Impressum pecinamedia.at (BRIEF §1.4, abgerufen 14.10.2026)',
  klartextNav: 'Navigation klartext.org, Stand 14.10.2026',
  klartextBrand: 'Impressum klartext.org, BRIEF §1.2',
  charta: 'WKO-Liste Charta der Vielfalt, Stand 13.08.2026',
  credits: 'web/CREDITS.md',
  foundation: 'F_foundation.md',
} as const;

// ---------------------------------------------------------------------------
// Stammdaten (einmal definiert, ueberall referenziert)
// ---------------------------------------------------------------------------

const BRAND_NAME = 'Pecina Media';
const LEGAL_NAME = `${BRAND_NAME} KG`;

const ADDRESS_PARTS = {
  street: 'Neustiftgasse 71/1',
  zip: '1070',
  city: 'Wien',
  country: 'AT',
} as const;
const ADDRESS_DISPLAY = c(
  `${ADDRESS_PARTS.street}, ${ADDRESS_PARTS.zip} ${ADDRESS_PARTS.city}`,
  'fakt',
  SRC.impressum,
);

const PHONE_DISPLAY = c('01/944 13 73', 'fakt', SRC.impressum);
/** E-Mail-Adresse laut Impressum (Original); als Kontaktadresse noch offen, siehe SITE.contactEmail. */
const IMPRESSUM_EMAIL = 'info@klartext.org';

/** Feldbezeichnungen laut Impressum, genutzt in Kontakt-Adresse und Impressum. */
const LABEL_PHONE = c('Tel.:', 'fakt', SRC.impressum);
const LABEL_EMAIL = c('E-Mail:', 'fakt', SRC.impressum);

// ---------------------------------------------------------------------------
// Wiederkehrende Texte
// ---------------------------------------------------------------------------

/** Bereichsnamen: Kicker der Sektionen und Labels von Navigation/Menue. */
const LABEL = {
  start: c('Start', 'entwurf', spec('§4.3')),
  haltung: c('Haltung', 'entwurf', spec('§3.2')),
  leistungen: c(
    'Schwerpunkte',
    'entwurf',
    spec('§4.2, §4.3'),
    'abgeleitet aus der Original-Zwischenzeile „Unsere Schwerpunkte:“',
  ),
  arbeiten: c('Arbeiten', 'entwurf', spec('§3.4')),
  prozess: c('Prozess', 'entwurf', spec('§3.5')),
  klartext: c('KLARTEXT!', 'fakt', SRC.klartextBrand, 'Markenname'),
  kontakt: c('Kontakt', 'entwurf', spec('§3.7')),
} as const satisfies Record<SectionId, CopyText>;

const HEADLINE_LINES = [
  c('Design mit Strategie.', 'original', SRC.agb),
  c('Kommunikation mit Wirkung.', 'original', SRC.agb),
] as const;
const HEADLINE = joinLines(HEADLINE_LINES, 'original', SRC.agb);

const LEAD = c('Bei Pecina Media entstehen Marken, die im Gedächtnis bleiben.', 'original', SRC.agb);

const CONTACT_CTA_LINES = [
  c('Kontaktiere', 'original', SRC.agb),
  c('uns!', 'original', SRC.agb),
] as const;
const CONTACT_CTA = joinLines(CONTACT_CTA_LINES, 'original', SRC.agb);

const SCHWERPUNKTE_EYEBROW = c('Unsere Schwerpunkte:', 'original', SRC.agb);

const KLARTEXT_BRAND = c('KLARTEXT! Weiterbildung', 'fakt', SRC.klartextBrand);

const PRINCIPLES = [
  {
    num: '01',
    title: c('Strategie', 'entwurf', spec('§3.2')),
    text: c('Erst verstehen, dann gestalten. Jede Idee braucht ein Ziel.', 'entwurf', spec('§3.2')),
  },
  {
    num: '02',
    title: c('Kreativität', 'entwurf', spec('§3.2')),
    text: c('Mutig im Entwurf. Genau im Detail.', 'entwurf', spec('§3.2')),
  },
  {
    num: '03',
    title: c('Technologie', 'entwurf', spec('§3.2')),
    text: c('Neue Werkzeuge? Gern. Solange sie dem Handwerk dienen.', 'entwurf', spec('§3.2')),
  },
] as const satisfies readonly PrincipleCopy[];

const IMPRESSUM_TITLE = c('Impressum', 'entwurf', spec('§3.8, §4.9'), 'Seitentitel');
const DATENSCHUTZ_TITLE = c('Datenschutz', 'entwurf', spec('§3.8, §4.9'), 'Seitentitel');

// ---------------------------------------------------------------------------
// SITE
// ---------------------------------------------------------------------------

export const SITE = {
  name: BRAND_NAME,
  legalName: LEGAL_NAME,
  locale: 'de-AT',
  url: c('https://pecinamedia.at', 'offen', 'BRIEF §9, Kundenfrage 18 (Domain/Hosting)'),
  contactEmail: c(
    IMPRESSUM_EMAIL,
    'offen',
    SRC.impressum,
    'Alternative buero@pecinamedia.at (Footer pecinamedia.at), BRIEF §9, Kundenfrage 6',
  ),
  phone: {
    display: PHONE_DISPLAY,
    href: 'tel:+4319441373',
    intl: '+43 1 9441373',
  },
  address: {
    ...ADDRESS_PARTS,
    display: ADDRESS_DISPLAY,
  },
  /** Konstante, kein new Date() (Server Components, Cache Components). */
  copyright: `© 2026 ${LEGAL_NAME}`,
} as const;

// ---------------------------------------------------------------------------
// NAV
// ---------------------------------------------------------------------------

const navItem = (id: SectionId, num: string, inHeader: boolean): NavItem =>
  Object.freeze({ id, num, label: LABEL[id].text, inHeader, status: LABEL[id].status });

export const NAV = [
  navItem('start', '00', false),
  navItem('haltung', '01', false),
  navItem('leistungen', '02', true),
  navItem('arbeiten', '03', true),
  navItem('prozess', '04', true),
  navItem('klartext', '05', false),
  navItem('kontakt', '06', true),
] as const satisfies readonly NavItem[];

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

/** Charta-der-Vielfalt-Hinweis in der Haltung nur mit Kundenfreigabe (DESIGN_SPEC §3.2). */
export const SHOW_CHARTA: boolean = false;

// ---------------------------------------------------------------------------
// COPY
// ---------------------------------------------------------------------------

const UI_META: CopyGroupMeta = { status: 'entwurf', source: `${spec('§4')}, ${SRC.foundation}` };
const SCENE3D_META: CopyGroupMeta = {
  status: 'entwurf',
  source: `${spec('§3.2, §3.3')}, ${SRC.foundation}`,
};
const CREDITS_META: CopyGroupMeta = { status: 'fakt', source: SRC.credits };

/**
 * Bezeichnungen aus dem Footer-Credit (§3.8), einmal definiert: im Footer-Text und als
 * Zwischenlabels der Credits auf /impressum (von P9 gemeldet, Integration 14.10.2026).
 */
const CREDIT_LABELS = {
  assets: c('3D-Modelle & HDRI', 'entwurf', spec('§3.8'), 'Teil des freiwilligen Footer-Credits'),
  fonts: c('Schriften', 'entwurf', spec('§3.8'), 'Teil des freiwilligen Footer-Credits'),
} as const;

export const COPY = {
  /**
   * Metadaten der Startseite (<title>, Meta-Description, OG). Wortlaut aus F_foundation.md,
   * zusammengesetzt aus Stammdaten und Original-Texten; Kundenfreigabe offen.
   * Das Titel-Template der Unterseiten (`%s – ${SITE.legalName}`) ist ein Format und steht in app/layout.tsx.
   */
  meta: {
    title: c(
      `${LEGAL_NAME} – ${HEADLINE.text}`,
      'entwurf',
      SRC.foundation,
      'Zusammensetzung aus SITE.legalName und Start-H1 (original)',
    ),
    description: c(
      `${LEAD.text} Kreativagentur in ${ADDRESS_PARTS.zip} ${ADDRESS_PARTS.city} für Corporate Identity, Webdesign, Social Media, Content, Print und KI-gestützte Kreativlösungen.`,
      'entwurf',
      SRC.foundation,
      'Satz 1 = Start-Lead (original), Satz 2 Entwurf',
    ),
  },

  /** Bedienelemente und aria-Labels (reine Strings, Status in `meta`). */
  ui: {
    meta: UI_META,
    skip: 'Zum Inhalt springen',
    menu: 'Menü',
    menuClose: 'Menü schließen',
    navLabel: 'Hauptnavigation',
    logoLabel: `${LEGAL_NAME} – zur Startseite`,
    motion: 'Bewegung reduzieren',
    /** Mit fuehrendem Leerzeichen, als sr-only-Zusatz an externe Links. */
    external: ' (externe Website)',
    exampleBadge: 'Beispiel',
    caseOpen: 'Details anzeigen',
    caseClose: 'Details ausblenden',
    menuContact: LABEL.kontakt.text,
  },

  /** §3.1 */
  start: {
    kicker: c('Kreativagentur · Wien-Neubau', 'entwurf', spec('§3.1'), 'Selbstbeschreibung; 1070 = Neubau'),
    h1: HEADLINE,
    h1Lines: HEADLINE_LINES,
    lead: LEAD,
    ctaPrimary: CONTACT_CTA,
    ctaSecondary: c(
      SCHWERPUNKTE_EYEBROW.text.replace(/:$/, ''),
      'original',
      SRC.agb,
      'Zwischenzeile der Quelle ohne Doppelpunkt',
    ),
    interlude: c('Ein Schnitt – und das Rauschen ist weg.', 'entwurf', spec('§3.1')),
  },

  /** §3.2 */
  haltung: {
    kicker: LABEL.haltung,
    h2: c('Analoges Handwerk. Digitale Werkzeuge.', 'entwurf', spec('§3.2')),
    paragraphs: [
      c(
        'Als Kreativagentur hinter KLARTEXT! Weiterbildung entwickeln wir durchdachte Design- und Kommunikationslösungen für Unternehmen, Bildungseinrichtungen und Selbstständige.',
        'entwurf',
        `${SRC.agb}; Quelle schreibt „Klartext Weiterbildung“`,
        'Markenschreibweise angeglichen, Freigabe offen',
      ),
      c(
        'Wir verbinden kreatives Design mit moderner Technologie und strategischem Marketing. So entstehen Websites, Corporate Designs, Printmedien und digitale Inhalte, die nicht nur professionell aussehen, sondern auch Ergebnisse erzielen.',
        'original',
        SRC.agb,
      ),
      c(
        'Jedes Projekt wird individuell entwickelt – mit dem Anspruch, Qualität, Funktionalität und Ästhetik perfekt miteinander zu verbinden.',
        'original',
        SRC.agb,
      ),
    ],
    principles: PRINCIPLES,
    /** Nur rendern, wenn SHOW_CHARTA true ist. */
    charta: c(
      'Wir haben die Charta der Vielfalt unterzeichnet.',
      'fakt',
      SRC.charta,
      'nur mit Kundenfreigabe (SHOW_CHARTA)',
    ),
  },

  /** §3.3 */
  leistungen: {
    eyebrow: SCHWERPUNKTE_EYEBROW,
    h2: c('Acht Schwerpunkte. Acht Schnitte.', 'entwurf', spec('§3.3.0')),
    intro: c(
      'Vier Werkstücke vom Werktisch, acht Schnitte vom Analogen ins Digitale. Jeder Schnitt steht für einen unserer Schwerpunkte.',
      'entwurf',
      spec('§3.3.0'),
    ),
    stations: {
      marke: {
        label: c('Marke', 'entwurf', spec('§3.3.1')),
        numeral: 'I',
        subline: c('Wofür du stehst. Und wie man es sieht.', 'entwurf', spec('§3.3.1')),
      },
      bildschirm: {
        label: c('Bildschirm', 'entwurf', spec('§3.3.2')),
        numeral: 'II',
        subline: c('Wo man dich findet. Und wo man dir folgt.', 'entwurf', spec('§3.3.2')),
      },
      papier: {
        label: c('Papier', 'entwurf', spec('§3.3.3')),
        numeral: 'III',
        subline: c('Was man liest. Und was man in der Hand hält.', 'entwurf', spec('§3.3.3')),
      },
      kopf: {
        label: c('Kopf', 'entwurf', spec('§3.3.4')),
        numeral: 'IV',
        subline: c('Wie du sprichst. Und womit wir denken.', 'entwurf', spec('§3.3.4')),
      },
    } as const satisfies Record<StationId, StationCopy>,
    /** 8 Schwerpunkte in Originalreihenfolge (Titel original, Rest Entwurf). */
    items: [
      {
        num: '01',
        id: 'leistung-01',
        station: 'marke',
        beat: 'marke:a',
        title: c('Corporate Identity & Branding', 'original', SRC.agb),
        claim: c('Erkennbar statt austauschbar.', 'entwurf', spec('§3.3.1')),
        text: c(
          'Wir finden heraus, wofür du stehst, und übersetzen das in einen Auftritt, der überall mit einer Stimme spricht: Farben, Schriften, Bildsprache und Tonalität als System, das mit dir wächst – von der Visitenkarte bis zum Social-Profil.',
          'entwurf',
          spec('§3.3.1'),
        ),
        tags: list(['Markenstrategie', 'Corporate Design', 'Styleguide'], 'entwurf', spec('§3.3.1')),
      },
      {
        num: '02',
        id: 'leistung-02',
        station: 'marke',
        beat: 'marke:b',
        title: c('Logo- und Grafikdesign', 'original', SRC.agb),
        claim: c('Ein Schnitt. Und es sitzt.', 'entwurf', spec('§3.3.1')),
        text: c(
          'Ein gutes Logo funktioniert auf dem Kugelschreiber genauso wie auf der Hausfassade. Wir skizzieren von Hand, verfeinern am Rechner und liefern saubere Vektordaten für jedes Format – dazu Grafiken, Icons und Illustrationen aus einem Guss.',
          'entwurf',
          spec('§3.3.1'),
        ),
        tags: list(['Logo & Wortmarke', 'Icons', 'Illustration'], 'entwurf', spec('§3.3.1')),
      },
      {
        num: '03',
        id: 'leistung-03',
        station: 'bildschirm',
        beat: 'bildschirm:a',
        title: c('Webdesign & WordPress', 'original', SRC.agb),
        claim: c('Schön anzusehen. Leicht zu pflegen.', 'entwurf', spec('§3.3.2')),
        text: c(
          'Wir gestalten Websites, die auf jedem Bildschirm funktionieren und schnell laden. Mit WordPress pflegst du deine Inhalte danach selbst – ohne Programmierkenntnisse und ohne jedes Mal bei uns anrufen zu müssen.',
          'entwurf',
          spec('§3.3.2'),
        ),
        tags: list(['Konzept', 'Webdesign', 'WordPress', 'Einschulung'], 'entwurf', spec('§3.3.2')),
      },
      {
        num: '04',
        id: 'leistung-04',
        station: 'bildschirm',
        beat: 'bildschirm:b',
        title: c('Social Media Marketing', 'original', SRC.agb),
        claim: c('Weniger posten. Mehr sagen.', 'entwurf', spec('§3.3.2')),
        text: c(
          'Wir entwickeln Formate, Redaktionspläne und Visuals für deine Kanäle – abgestimmt auf deine Zielgruppe statt auf den Trend der Woche. Damit dein Feed nach dir aussieht und nicht nach Vorlage.',
          'entwurf',
          spec('§3.3.2'),
        ),
        tags: list(['Strategie', 'Redaktionsplan', 'Formate', 'Visuals'], 'entwurf', spec('§3.3.2')),
      },
      {
        num: '05',
        id: 'leistung-05',
        station: 'papier',
        beat: 'papier:a',
        title: c('Content Creation & Copywriting', 'original', SRC.agb),
        claim: c('Worte mit Haltung. Inhalte mit Absicht.', 'entwurf', spec('§3.3.3')),
        text: c(
          'Gute Texte klingen nach dir, nicht nach Textbaustein. Wir schreiben Headlines, Webtexte, Posts und Broschüren und entwickeln Inhalte, die zu deinem Kanal passen – vom ersten Satz bis zum letzten Call-to-Action.',
          'entwurf',
          spec('§3.3.3'),
        ),
        tags: list(
          ['Copywriting', 'Headlines', 'Content-Formate', 'Storytelling'],
          'entwurf',
          spec('§3.3.3'),
        ),
      },
      {
        num: '06',
        id: 'leistung-06',
        station: 'papier',
        beat: 'papier:b',
        title: c('Printmedien & Werbematerialien', 'original', SRC.agb),
        claim: c('Zum Anfassen gemacht. Zum Aufheben gedacht.', 'entwurf', spec('§3.3.3')),
        text: c(
          'Flyer, Folder, Plakate, Geschäftsausstattung: Wir gestalten Drucksachen, die man gern in der Hand hält, und liefern druckfertige Daten für jedes Format.',
          'entwurf',
          spec('§3.3.3'),
        ),
        tags: list(
          ['Geschäftsausstattung', 'Flyer & Folder', 'Plakate', 'Werbemittel'],
          'entwurf',
          spec('§3.3.3'),
        ),
      },
      {
        num: '07',
        id: 'leistung-07',
        station: 'kopf',
        beat: 'kopf:a',
        title: c('Digitale Kommunikation', 'original', SRC.agb),
        claim: c('Ein Absender. Viele Kanäle.', 'entwurf', spec('§3.3.4')),
        text: c(
          'Newsletter, Präsentationen, Website, Social Media: Wir sorgen dafür, dass deine Botschaft überall ankommt und überall gleich klingt – mit Plan, mit System und mit Blick fürs Ganze.',
          'entwurf',
          spec('§3.3.4'),
        ),
        tags: list(
          ['Newsletter', 'Präsentationen', 'Kanalplanung', 'Kampagnen'],
          'entwurf',
          spec('§3.3.4'),
        ),
      },
      {
        num: '08',
        id: 'leistung-08',
        station: 'kopf',
        beat: 'kopf:b',
        title: c('Kreative Lösungen mit KI-Unterstützung', 'original', SRC.agb),
        claim: c('Die Maschine sortiert. Der Mensch entscheidet.', 'entwurf', spec('§3.3.4')),
        text: c(
          'KI ist bei uns Werkzeug, nicht Ersatz. Wir nutzen sie für Recherche, Varianten und Visualisierungen – entscheiden, auswählen und verfeinern tun Menschen.',
          'entwurf',
          spec('§3.3.4'),
        ),
        tags: list(
          ['Ideenfindung', 'Varianten', 'Visualisierung', 'Workflows'],
          'entwurf',
          spec('§3.3.4'),
        ),
        note: c(
          'Links: Marmor. Rechts: Rechenleistung. Dazwischen: wir.',
          'entwurf',
          spec('§3.3.4'),
          'Humor-Freigabe offen',
        ),
      },
    ] as const satisfies readonly LeistungCopy[],
  },

  /** §3.4 */
  arbeiten: {
    kicker: LABEL.arbeiten,
    h2: c('Vier Beispiele. Keine Namen.', 'entwurf', spec('§3.4')),
    lead: c(
      'Echte Projekte zeigen wir hier, sobald die Freigaben da sind. Bis dahin: vier Beispiele dafür, wie wir an Aufgaben herangehen.',
      'entwurf',
      spec('§3.4'),
    ),
    disclaimer: c(
      'Alle Cases in diesem Bereich sind Beispiele und zeigen keine realen Kund:innen.',
      'entwurf',
      spec('§3.4'),
      'Pflichthinweis, sichtbar in Fliesstextgroesse',
    ),
    /** aria-label-Praefix des Posters: `${posterLabel.text} ${case.title.text}` */
    posterLabel: c('Beispiel-Cover:', 'entwurf', spec('§3.4')),
    cases: [
      {
        id: 'tischlerei',
        title: c('Ein neuer Auftritt für eine Tischlerei', 'beispiel', spec('§3.4')),
        services: ['01', '02', '06'],
        teaser: c(
          'Vom handgezeichneten Signet bis zur Beschriftung des Firmenautos: ein Erscheinungsbild mit Maserung.',
          'beispiel',
          spec('§3.4'),
        ),
        detail: c(
          'Gespräch in der Werkstatt, Skizzen von Hand, ein Signet, das auch eingebrannt im Holz funktioniert – dazu Geschäftsausstattung und Fahrzeugbeschriftung.',
          'beispiel',
          spec('§3.4'),
        ),
        posterTone: 'brand',
        posterShape: 'circle',
      },
      {
        id: 'bildung',
        title: c('Eine Website für einen Bildungsanbieter', 'beispiel', spec('§3.4')),
        services: ['03', '07'],
        teaser: c(
          'Kursprogramm, Anmeldung und Newsletter an einem Ort – übersichtlich und selbst pflegbar.',
          'beispiel',
          spec('§3.4'),
        ),
        detail: c(
          'Eine WordPress-Website, auf der man Kurse schnell findet, dazu ein Newsletter-Format und eine Einschulung, damit das Team die Inhalte selbst pflegt.',
          'beispiel',
          spec('§3.4'),
        ),
        posterTone: 'ink',
        posterShape: 'bar',
      },
      {
        id: 'cafe',
        title: c('Eine Social-Kampagne für ein Grätzl-Café', 'beispiel', spec('§3.4')),
        services: ['04', '05'],
        teaser: c(
          'Ein Monat, ein Thema, ein Look: Formate, die die Nachbarschaft gern teilt.',
          'beispiel',
          spec('§3.4'),
        ),
        detail: c(
          'Drei wiederkehrende Formate, ein Redaktionsplan und Texte im Ton des Hauses – gebaut für Stories, Posts und das Schild vor der Tür.',
          'beispiel',
          spec('§3.4'),
        ),
        posterTone: 'paper',
        posterShape: 'circle',
      },
      {
        id: 'verein',
        title: c('Ein Jahresbericht für einen Verein', 'beispiel', spec('§3.4')),
        services: ['05', '06', '08'],
        teaser: c(
          'Gedruckt und als Web-Version, mit KI-gestützten Visualisierungen und Texten, die man gern liest.',
          'beispiel',
          spec('§3.4'),
        ),
        detail: c(
          'Struktur, Texte und Gestaltung aus einer Hand; KI hilft bei Varianten und Visualisierungen, Auswahl und Feinschliff bleiben bei uns.',
          'beispiel',
          spec('§3.4'),
        ),
        posterTone: 'brand',
        posterShape: 'bar',
      },
    ] as const satisfies readonly CaseCopy[],
  },

  /** §3.5 */
  prozess: {
    kicker: LABEL.prozess,
    h2: c('Vier Schritte. Kein Blindflug.', 'entwurf', spec('§3.5')),
    steps: [
      {
        num: '01',
        title: c('Zuhören', 'entwurf', spec('§3.5')),
        text: c(
          'Du erzählst, wir fragen nach. Danach wissen beide, worum es wirklich geht.',
          'entwurf',
          spec('§3.5'),
        ),
      },
      {
        num: '02',
        title: c('Schärfen', 'entwurf', spec('§3.5')),
        text: c(
          'Wir entwickeln Strategie und Richtung und zeigen dir erste Entwürfe, bevor es aufwendig wird.',
          'entwurf',
          spec('§3.5'),
        ),
      },
      {
        num: '03',
        title: c('Gestalten', 'entwurf', spec('§3.5')),
        text: c(
          'Jetzt wird’s konkret: Design, Text, Technik. Du bist bei jedem Zwischenschritt dabei.',
          'entwurf',
          spec('§3.5'),
        ),
      },
      {
        num: '04',
        title: c('Übergeben', 'entwurf', spec('§3.5')),
        text: c(
          'Fertige Daten, eine laufende Website, auf Wunsch eine Einschulung – damit du selbstständig weitermachen kannst.',
          'entwurf',
          spec('§3.5'),
        ),
      },
    ] as const satisfies readonly ProcessStepCopy[],
  },

  /** §3.6 */
  klartext: {
    kicker: KLARTEXT_BRAND,
    h2: c('Zwei Marken. Ein Haus.', 'entwurf', spec('§3.6')),
    text1: c(
      `${BRAND_NAME} ist die Kreativagentur hinter ${KLARTEXT_BRAND.text}.`,
      'fakt',
      SRC.agb,
      'Selbstbeschreibung',
    ),
    text2: c(
      `Gestaltung und Weiterbildung unter einem Dach: beide in der ${ADDRESS_DISPLAY.text}.`,
      'entwurf',
      spec('§3.6'),
      'Basis: beide Impressen',
    ),
    courseLabel: c(`Kursbereiche bei ${LABEL.klartext.text}:`, 'entwurf', spec('§3.6')),
    courses: list(
      [
        'E-Commerce',
        'Medienfachkraft',
        'Digitales Marketing',
        'Grafik & Print',
        'Audio & Video',
        'KI Navigator',
        'Canva',
        'Intensivkurs',
      ],
      'fakt',
      SRC.klartextNav,
    ),
    link: c(`Zu ${KLARTEXT_BRAND.text}`, 'entwurf', spec('§3.6')),
    linkHref: 'https://klartext.org/',
    /** Dekorativ (aria-hidden): obere und untere Platte von TwoHalves. */
    halves: {
      upper: c('agentur', 'entwurf', spec('§3.6')),
      lower: c('weiterbildung', 'entwurf', spec('§3.6')),
    },
  },

  /** §3.7 */
  kontakt: {
    kicker: LABEL.kontakt,
    h2: CONTACT_CTA,
    h2Lines: CONTACT_CTA_LINES,
    lead: c('Erzähl uns von deinem Projekt. Wir hören zu – und melden uns.', 'entwurf', spec('§3.7')),
    /** Bezeichnungen in der <address>; Werte aus SITE.phone / SITE.contactEmail. */
    addressLabels: {
      phone: LABEL_PHONE,
      email: LABEL_EMAIL,
    },
    mailButton: c('E-Mail schreiben', 'entwurf', spec('§3.7')),
    phoneButton: c('Anrufen', 'entwurf', spec('§3.7')),
  },

  /** §3.8; Zeile 1 aus SITE.legalName + SITE.address.display, Copyright aus SITE.copyright. */
  footer: {
    credits: c(
      `${CREDIT_LABELS.assets.text}: Poly Haven (CC0) · ${CREDIT_LABELS.fonts.text}: Archivo, Comfortaa (SIL OFL)`,
      'entwurf',
      spec('§3.8'),
      'freiwilliger Credit',
    ),
    legalLinks: {
      impressum: IMPRESSUM_TITLE,
      datenschutz: DATENSCHUTZ_TITLE,
    },
  },

  /** §4.9 /impressum */
  impressum: {
    h1: IMPRESSUM_TITLE,
    /** Wortgetreu (BRIEF §1.4), ohne Bankverbindung; Reihenfolge und Schreibweise nicht aendern. */
    lines: list(
      [
        LEGAL_NAME,
        ADDRESS_DISPLAY.text,
        `${LABEL_PHONE.text} ${PHONE_DISPLAY.text}`,
        `${LABEL_EMAIL.text} ${IMPRESSUM_EMAIL}`,
        'Geschäftsführer: Cenk Pecina',
        'UID Nummer: ATU 72717018',
        'Firmenbuchnummer: FN 477956 b',
        'Firmenbuch hinterlegt bei: Handelsgericht, 1030 Wien',
        'Informationspflicht lt. § 5 Abs. 1 ECommerce-Gesetz',
        'Gerichtsstandort: Wien',
      ],
      'original',
      SRC.impressum,
    ),
    openNote: c(
      'Ergänzungen zu Gewerbe, Kammer/Fachgruppe, Aufsichtsbehörde und Offenlegung nach § 25 MedienG folgen nach Klärung.',
      'offen',
      spec('§4.9'),
    ),
    creditsTitle: c('Credits', 'entwurf', spec('§4.9')),
    /** Nur die verwendeten Assets (4 Modelle + 1 HDRI) und Schriften, Quelle web/CREDITS.md. */
    credits: {
      meta: CREDITS_META,
      /** Zwischenlabels (Status entwurf, aus dem Footer-Credit §3.8) */
      labels: CREDIT_LABELS,
      provider: 'Poly Haven',
      providerHref: 'https://polyhaven.com',
      license: 'CC0 1.0',
      licenseHref: 'https://polyhaven.com/license',
      assets: [
        {
          name: 'Spray Paint Bottles 02',
          authors: 'Riley Queen',
          href: 'https://polyhaven.com/a/spray_paint_bottles_02',
        },
        {
          name: 'Classic Laptop',
          authors: 'Arrangemonk',
          href: 'https://polyhaven.com/a/classic_laptop',
        },
        {
          name: 'Office Notepads',
          authors: 'Ulan Cabanilla',
          href: 'https://polyhaven.com/a/office_notepads',
        },
        {
          name: 'Marble Bust 01',
          authors: 'Rico Cilliers',
          href: 'https://polyhaven.com/a/marble_bust_01',
        },
        {
          name: 'HDRI Studio Small 09',
          authors: 'Sergej Majboroda',
          href: 'https://polyhaven.com/a/studio_small_09',
        },
      ] as const satisfies readonly CreditEntry[],
      fonts: ['Archivo', 'Comfortaa'],
      fontLicense: 'SIL Open Font License',
    },
  },

  /** §4.9 /datenschutz */
  datenschutz: {
    h1: DATENSCHUTZ_TITLE,
    text: c(
      'Die Datenschutzerklärung für diese Website wird gerade erstellt und vor der Veröffentlichung durch eine geprüfte Fassung ersetzt.',
      'offen',
      spec('§4.9'),
      'Platzhalter bis zur geprueften Fassung',
    ),
  },

  /** §4.9 not-found */
  notFound: {
    h1: c('Hier wurde zu viel geschnitten.', 'entwurf', spec('§4.9')),
    text: c('Diese Seite gibt es nicht (mehr). Der Rest steht noch.', 'entwurf', spec('§4.9')),
    /** Statische CSS-Version bzw. 3D-Ziffern des Easter-Eggs */
    code: c('404', 'fakt', spec('§4.9'), 'HTTP-Statuscode'),
    home: c('Zur Startseite', 'entwurf', spec('§4.9')),
    egg: c('Wieder zusammenfügen', 'entwurf', spec('§4.9')),
  },

  /**
   * Texte der 3D-Texturen (CanvasTexture). Im DOM nur in den Low-Tier-Fallback-Figuren
   * (StationFallback, aria-hidden, Integrator-Entscheid 14.10.2026). Status in `meta`.
   */
  scene3d: {
    meta: SCENE3D_META,
    dos: ['C:\\PECINA> dir', 'MARKE.EXE   WEB.EXE   SOCIAL.EXE', 'C:\\PECINA> web.exe'],
    webHeadline: HEADLINE_LINES[0].text,
    webButton: CONTACT_CTA.text,
    feed: [
      'Hallo Neubau.',
      'Neu!',
      'Hinter den Kulissen',
      'Frage der Woche',
      'Tipp',
      'Zitat',
      'Termin',
      'Danke!',
      'Story',
    ],
    swatches: ['#0E0E0E', '#D17F0C', '#F4F1EA'],
    monoliths: [PRINCIPLES[0].title.text, PRINCIPLES[1].title.text, PRINCIPLES[2].title.text],
    sketchLabel: 'Entwurf 3',
    scribbleWord: 'Idee?',
    typeHeadline: 'Worte, die wirken.',
    proof: 'MEDIA',
  },
} as const;
