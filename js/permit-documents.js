// Content for the demo permit package and the sample documents it includes. Everything here is fictional and
// reused for every listing of a collection type. Builders return pdfmake content and never load the PDF engine,
// so the browser and scripts/build-documents.mjs share them.

const GREEN = '#1e6b47';
const MUTED = '#55635c';
const INK = '#15211b';
const LINE = '#d5ddd8';
const BORDER = '#7a8981';
const DANGER = '#b42318';
const WATER = '#3f74b8';

export const PDF_STYLES = {
  kicker: { fontSize: 8.5, color: MUTED, characterSpacing: 0.6 },
  title: { fontSize: 19, color: GREEN, margin: [0, 2, 0, 8] },
  heading: { fontSize: 12.5, color: INK, margin: [0, 12, 0, 6] },
  intro: { fontSize: 10.5, color: INK, lineHeight: 1.3, margin: [0, 0, 0, 10] },
  label: { fontSize: 8.5, color: MUTED },
  small: { fontSize: 8.5, color: MUTED, lineHeight: 1.25 },
  warning: { fontSize: 10.5, color: DANGER, margin: [0, 2, 0, 10] }
};

// Visitor-facing labels match the site's; ids match the file names under documents/.
export const TYPE_DOCUMENTS = {
  fuelwood: [
    { id: 'firewood-stipulations', label: 'Stipulations', kind: 'stipulations' },
    { id: 'firewood-map', label: 'Map', kind: 'map' },
    { id: 'firewood-measuring', label: 'How to Measure Fuelwood', kind: 'reference' }
  ],
  christmas: [
    { id: 'christmas-tree-stipulations', label: 'Stipulations', kind: 'stipulations' },
    { id: 'christmas-tree-map', label: 'Map', kind: 'map' },
    { id: 'christmas-tree-trip-planning', label: 'Planning Your Trip', kind: 'reference' }
  ],
  mushrooms: [
    { id: 'mushroom-stipulations', label: 'Stipulations', kind: 'stipulations' },
    { id: 'mushroom-collection-areas', label: 'Collection Areas', kind: 'map' },
    { id: 'mushroom-foraging', label: 'Foraging Guidelines', kind: 'reference' }
  ]
};

export function documentUrl(id) {
  return `documents/${id}.pdf`;
}

export function documentIdFromUrl(url) {
  return /^documents\/([a-z0-9-]+)\.pdf$/.exec(url || '')?.[1] || null;
}

const header = (kicker, title, intro) => [
  { text: kicker.toUpperCase(), style: 'kicker' },
  { text: title, style: 'title' },
  ...(intro ? [{ text: intro, style: 'intro' }] : [])
];

const SAMPLE_NOTE = 'Sample document for the demonstration site. It is not an official notice and is not for navigation.';

// ---- Maps ------------------------------------------------------------------------------------------------
// Shapes only: the PDF engine cannot draw SVG text with the embedded font, so letters are drawn as strokes.

const GLYPHS = {
  A: 'M0 10 L4 0 L8 10 M1.6 6 L6.4 6',
  B: 'M0 0 L0 10 L5 10 Q8 10 8 7.5 Q8 5 5 5 L0 5 M0 0 L4.5 0 Q7.5 0 7.5 2.5 Q7.5 5 4.5 5',
  C: 'M7.5 1.5 Q6 0 4 0 Q0 0 0 5 Q0 10 4 10 Q6 10 7.5 8.5',
  N: 'M0 10 L0 0 L7 10 L7 0',
  P: 'M0 10 L0 0 L5 0 Q8 0 8 2.75 Q8 5.5 5 5.5 L0 5.5'
};

const letter = (char, x, y, color = INK) => `<path d="${GLYPHS[char]}" transform="translate(${x} ${y}) scale(1.4)" fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`;

function mapSvg(features) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320" width="480" height="320">
<rect x="0" y="0" width="480" height="320" fill="#f6f8f6" stroke="${BORDER}" stroke-width="1"/>
<path d="M0 230 C 90 190, 170 240, 260 200 S 400 150, 480 170" fill="none" stroke="${LINE}" stroke-width="1"/>
<path d="M0 260 C 100 220, 180 270, 280 230 S 410 190, 480 205" fill="none" stroke="${LINE}" stroke-width="1"/>
<path d="M0 60 C 70 80, 150 40, 240 70 S 390 110, 480 80" fill="none" stroke="${LINE}" stroke-width="1"/>
<path d="M0 35 C 80 55, 160 15, 250 45 S 400 85, 480 55" fill="none" stroke="${LINE}" stroke-width="1"/>
${features}
<path d="M452 286 L460 306 L452 301 L444 306 Z" fill="${INK}"/>
${letter('N', 447, 266)}
<rect x="20" y="296" width="50" height="6" fill="${INK}"/>
<rect x="70" y="296" width="50" height="6" fill="#ffffff" stroke="${INK}" stroke-width="1"/>
</svg>`;
}

const swatch = {
  area: color => ({ canvas: [{ type: 'rect', x: 0, y: 1, w: 22, h: 11, color, fillOpacity: 0.28, lineColor: color, lineWidth: 1.5 }] }),
  closed: () => ({ canvas: [{ type: 'rect', x: 0, y: 1, w: 22, h: 11, color: DANGER, fillOpacity: 0.15, lineColor: DANGER, lineWidth: 1.5, dash: { length: 4, space: 2 } }] }),
  road: () => ({ canvas: [{ type: 'line', x1: 0, y1: 6, x2: 22, y2: 6, lineWidth: 3, lineColor: INK }] }),
  seasonal: () => ({ canvas: [{ type: 'line', x1: 0, y1: 6, x2: 22, y2: 6, lineWidth: 2, lineColor: INK, dash: { length: 5, space: 3 } }] }),
  water: () => ({ canvas: [{ type: 'line', x1: 0, y1: 6, x2: 22, y2: 6, lineWidth: 3, lineColor: WATER }] }),
  point: () => ({ canvas: [{ type: 'ellipse', x: 11, y: 6, r1: 5, r2: 5, color: '#ffffff', lineColor: INK, lineWidth: 1.5 }] }),
  gate: () => ({ canvas: [{ type: 'rect', x: 6, y: 1, w: 10, h: 10, color: DANGER }] }),
  scale: () => ({ canvas: [{ type: 'rect', x: 0, y: 3, w: 11, h: 6, color: INK }, { type: 'rect', x: 11, y: 3, w: 11, h: 6, color: '#ffffff', lineColor: INK, lineWidth: 1 }] })
};

function legend(rows) {
  return {
    table: { widths: [28, '*'], body: rows.map(([mark, text]) => [mark, { text, fontSize: 9.5, margin: [0, 1, 0, 3] }]) },
    layout: 'noBorders',
    margin: [0, 10, 0, 0]
  };
}

const ROADS = `<path d="M0 300 L 120 248 L 240 258 L 360 176 L 480 186" fill="none" stroke="${INK}" stroke-width="3"/>
<path d="M240 258 L 228 150 L 262 0" fill="none" stroke="${INK}" stroke-width="2" stroke-dasharray="8 5"/>`;
const STREAM = `<path d="M0 104 C 80 124, 140 84, 220 114 S 360 168, 480 150" fill="none" stroke="${WATER}" stroke-width="3"/>`;
const PARKING = `<circle cx="120" cy="248" r="6" fill="#ffffff" stroke="${INK}" stroke-width="2"/>${letter('P', 114, 222)}`;
const area = (points, color = GREEN) => `<polygon points="${points}" fill="${color}" fill-opacity="0.28" stroke="${color}" stroke-width="2"/>`;
const closedArea = points => `<polygon points="${points}" fill="${DANGER}" fill-opacity="0.15" stroke="${DANGER}" stroke-width="2" stroke-dasharray="6 4"/>`;

function mapDocument({ kicker, title, intro, features, legendRows }) {
  return [
    ...header(kicker, title, intro),
    { svg: mapSvg(features), width: 515 },
    legend([...legendRows, [swatch.scale(), 'Scale bar: each block is half a mile'], [{ text: 'N', fontSize: 10, margin: [6, 0, 0, 0] }, 'North is at the top of the map']]),
    { text: SAMPLE_NOTE, style: 'small', margin: [0, 10, 0, 0] }
  ];
}

const TYPE_MAPS = {
  fuelwood: () => mapDocument({
    kicker: 'Firewood permit · map',
    title: 'Firewood cutting areas',
    intro: 'Cut only inside units A and B. Units can close during high fire danger; check the area notices before each trip.',
    features: `${STREAM}${area('60,170 172,150 200,232 92,262')}${area('262,206 382,192 402,282 282,292')}${closedArea('300,30 420,22 440,96 322,108')}${ROADS}${PARKING}${letter('A', 122, 192)}${letter('B', 324, 230)}`,
    legendRows: [
      [swatch.area(GREEN), 'Cutting units A and B: dead and down trees only'],
      [swatch.closed(), 'Closed: winter wildlife range'],
      [swatch.road(), 'Open road'],
      [swatch.seasonal(), 'Seasonal road, closed when wet'],
      [swatch.water(), 'Stream: no cutting within 100 feet'],
      [swatch.point(), 'Parking']
    ]
  }),
  christmas: () => mapDocument({
    kicker: 'Christmas tree permit · map',
    title: 'Christmas tree cutting areas',
    intro: 'Cut your tree inside area A or B, at least 150 feet from roads, trails and campgrounds.',
    features: `${STREAM}${area('40,150 150,138 176,214 70,236')}${area('286,198 420,180 438,268 300,280')}${closedArea('170,226 250,214 262,276 182,290')}${ROADS}${PARKING}${letter('A', 96, 178)}${letter('B', 352, 222)}`,
    legendRows: [
      [swatch.area(GREEN), 'Tree cutting areas A and B'],
      [swatch.closed(), 'Closed: campground and trail buffer'],
      [swatch.road(), 'Plowed road'],
      [swatch.seasonal(), 'Unplowed road: chains or high clearance'],
      [swatch.water(), 'Creek'],
      [swatch.point(), 'Parking']
    ]
  }),
  mushrooms: () => mapDocument({
    kicker: 'Mushroom permit · collection areas',
    title: 'Mushroom collection areas',
    intro: 'Collect inside areas A and B. Area A burned last summer: watch for falling trees and stay out on windy days.',
    features: `${STREAM}${area('70,140 210,128 236,232 96,250', '#a65e1a')}${area('276,196 406,186 424,272 290,282')}${closedArea('300,26 430,30 438,104 312,112')}${ROADS}${PARKING}${letter('A', 140, 176, '#a65e1a')}${letter('B', 338, 226)}`,
    legendRows: [
      [swatch.area('#a65e1a'), 'Area A: last summer’s burn, morels likely'],
      [swatch.area(GREEN), 'Area B: mixed forest'],
      [swatch.closed(), 'Closed: active logging'],
      [swatch.road(), 'Open road'],
      [swatch.seasonal(), 'Seasonal road'],
      [swatch.point(), 'Trailhead parking']
    ]
  })
};

// ---- Stipulations and reference documents -----------------------------------------------------------------

const TAG_STEP = 'If your permit includes haul tags, cut or tear out the month, day and AM or PM on a tag before loading, and attach it where it can be seen.';

const STIPULATIONS = {
  fuelwood: {
    title: 'Firewood permit stipulations',
    items: [
      'Cut only dead and down trees, or standing dead trees marked for removal. Never cut a live tree.',
      'Leave stumps no taller than 12 inches.',
      'Stay inside the cutting units shown on your permit map. Areas marked closed are off limits.',
      'Drive and park only on open roads. Do not drive across streams, meadows or wet ground.',
      'Do not cut within 100 feet of streams, lakes, campgrounds or trailheads.',
      `${TAG_STEP} Use one tag for each half cord.`,
      'Your chainsaw needs a working spark arrester. During fire season, carry a shovel and a fire extinguisher.',
      'Follow posted fire restrictions and closures. They can change without notice.',
      'Firewood under this permit is for personal use. It may not be sold or traded.',
      'Carry your signed permit while cutting and hauling, and show it to any BWL officer who asks.'
    ]
  },
  christmas: {
    title: 'Christmas tree permit stipulations',
    items: [
      'Cut only the number of trees on your permit, each no taller than 20 feet.',
      'Choose a tree growing within 10 feet of other trees. Never cut the only tree in an opening.',
      'Leave stumps no taller than 6 inches, and remove any branches left on the stump.',
      'Do not cut within 150 feet of roads, trails, campgrounds or water.',
      'Stay inside the cutting areas shown on your permit map, and stay off private land.',
      `${TAG_STEP} Use one tag for each tree, attached to the trunk.`,
      'Winter roads may not be plowed. Carry chains, a shovel, warm clothes and water.',
      'Trees cut under this permit are for personal use and may not be sold.',
      'Carry your signed permit while cutting and transporting your tree.'
    ]
  },
  mushrooms: {
    title: 'Mushroom permit stipulations',
    items: [
      'Collect only the amount on your permit. The limit applies to the whole permit, not each day.',
      'Cut or pinch mushrooms at the base. Do not rake, dig or disturb the soil.',
      'Cut morels in half lengthwise before you leave the collection area.',
      'Carry mushrooms in a mesh bag or open basket so spores can spread.',
      'Stay inside the collection areas shown on your map. Do not collect within 100 feet of trails or campgrounds.',
      'Burned areas have falling trees and unstable ground. Stay out on windy days.',
      'Mushrooms collected under this permit are for personal use and may not be sold.',
      'Carry your signed permit while collecting and transporting mushrooms.'
    ]
  }
};

function stipulationsDocument(type) {
  const { title, items } = STIPULATIONS[type];
  return [
    ...header('Part of your permit', title, 'These stipulations are part of your permit. Breaking them can lead to a fine, loss of your permit, or both.'),
    { ol: items, fontSize: 10.5, lineHeight: 1.3, margin: [0, 0, 0, 6] },
    { text: SAMPLE_NOTE, style: 'small', margin: [0, 10, 0, 0] }
  ];
}

const cordSvg = () => {
  const logs = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) logs.push(`<circle cx="${70 + col * 44}" cy="${70 + row * 44}" r="19" fill="#e9dcc7" stroke="#8a6a43" stroke-width="2"/><circle cx="${70 + col * 44}" cy="${70 + row * 44}" r="6" fill="none" stroke="#8a6a43" stroke-width="1"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 280" width="480" height="280">
<rect x="46" y="46" width="352" height="176" fill="none" stroke="${INK}" stroke-width="2"/>
${logs.join('')}
<path d="M46 248 L398 248 M46 240 L46 256 M398 240 L398 256" fill="none" stroke="${GREEN}" stroke-width="2"/>
<path d="M424 46 L424 222 M416 46 L432 46 M416 222 L432 222" fill="none" stroke="${GREEN}" stroke-width="2"/>
</svg>`;
};

const REFERENCE = {
  fuelwood: () => [
    ...header('Firewood permit · reference', 'How to measure firewood', 'Permits are sold by the cord. A cord is a tightly stacked pile 8 feet long, 4 feet high and 4 feet deep: 128 cubic feet of wood and air.'),
    { svg: cordSvg(), width: 420, alignment: 'center' },
    { text: 'The green lines show the 8-foot length and the 4-foot height. Logs are 4 feet long, so the stack is 4 feet deep.', style: 'small', alignment: 'center', margin: [0, 4, 0, 10] },
    { text: 'Rules of thumb', style: 'heading' },
    { ul: [
      'A full-size pickup bed, loaded level with the rails, holds about half a cord.',
      'A compact pickup bed holds about a third of a cord.',
      'Stack tightly, bark side up, before you measure. A loose pile looks larger than it is.',
      'Each haul tag covers half a cord. Use a new tag for every half cord you load.'
    ], fontSize: 10.5, lineHeight: 1.3 },
    { text: SAMPLE_NOTE, style: 'small', margin: [0, 14, 0, 0] }
  ],
  christmas: () => [
    ...header('Christmas tree permit · reference', 'Planning your trip', 'Winter days are short and roads can change quickly. A little planning makes the trip safer and easier.'),
    { text: 'Before you go', style: 'heading' },
    { ul: [
      'Check the weather, road conditions and the area notices in this package.',
      'Measure your ceiling height and the space for the tree, and bring a tape measure.',
      'Pack a hand saw, rope, a tarp, gloves, chains, a shovel, water and warm clothes.',
      'Tell someone where you are going and when you expect to be back.'
    ], fontSize: 10.5, lineHeight: 1.3 },
    { text: 'At the cutting area', style: 'heading' },
    { ul: [
      'Leave by early afternoon so you are out before dark.',
      'Cut close to the ground and take the whole tree, including the top.',
      'Attach a haul tag to the trunk before you move the tree, if your permit includes tags.',
      'Keep the tree wrapped while driving so branches do not break.'
    ], fontSize: 10.5, lineHeight: 1.3 },
    { text: SAMPLE_NOTE, style: 'small', margin: [0, 14, 0, 0] }
  ],
  mushrooms: () => [
    ...header('Mushroom permit · reference', 'Foraging guidelines', 'Wild mushrooms can be deadly. Collect only what you can identify with certainty.'),
    { text: 'Identification', style: 'heading' },
    { ul: [
      'Never eat a mushroom unless you are sure what it is. When in doubt, throw it out.',
      'Learn the look-alikes. False morels have wrinkled, brain-like caps and are not hollow inside.',
      'Keep each kind of mushroom in its own bag so a poisonous one cannot mix in.'
    ], fontSize: 10.5, lineHeight: 1.3 },
    { text: 'In the field', style: 'heading' },
    { ul: [
      'Brush off dirt in the field, and leave small and old mushrooms to spread spores.',
      'Carry a map and a compass or GPS. Burned forest looks the same in every direction.',
      'Wear sturdy boots, and stay out of burned areas on windy days.'
    ], fontSize: 10.5, lineHeight: 1.3 },
    { text: SAMPLE_NOTE, style: 'small', margin: [0, 14, 0, 0] }
  ]
};

// ---- Area notices and maps (from catalog attachments) ------------------------------------------------------

const ACCESS_ROADS = `<path d="M0 160 L 140 150 L 250 186 L 360 130 L 480 140" fill="none" stroke="${INK}" stroke-width="3"/>
<path d="M140 150 L 160 40 M250 186 L 300 300" fill="none" stroke="${INK}" stroke-width="2" stroke-dasharray="8 5"/>
<rect x="152" y="88" width="12" height="12" fill="${DANGER}"/><rect x="270" y="236" width="12" height="12" fill="${DANGER}"/>`;

export const AREA_DOCUMENTS = {
  'ak-travel-advisory': {
    kind: 'notice', scope: 'Alaska · statewide', title: 'Alaska travel advisory',
    paragraphs: ['Seasonal fire and travel conditions change quickly in Alaska. Review local access notices before your trip.'],
    items: ['Breakup season can close roads with little notice. Soft roads may carry a weight limit.', 'Many areas have no mobile phone coverage. Leave your plans with someone at home.', 'Carry extra fuel, food, water and warm clothing in every season.']
  },
  'ak-fire-restrictions': {
    kind: 'notice', scope: 'Alaska · statewide', title: 'Statewide fire restrictions',
    paragraphs: ['Fire danger is rated daily. When restrictions are in effect, they apply to every BWL permit area in Alaska.'],
    items: ['Stage 1: no campfires outside fire rings. Chainsaws need a spark arrester, a shovel and an extinguisher.', 'Stage 2: no chainsaws from 1 p.m. to 1 a.m., and no smoking except in a vehicle.', 'Closure: no wood cutting. Your permit stays valid but cannot be used until the closure ends.']
  },
  'ak-anch-seasonal-bulletin': {
    kind: 'notice', scope: 'Anchorage Aurora Outpost · Alaska', title: 'Anchorage seasonal bulletin',
    paragraphs: ['Anchorage area permits may require weekend travel restrictions during breakup season.'],
    items: ['Weekend access may be limited to vehicles under 10,000 pounds.', 'The Eagle River road closes at the gate from the first heavy snow until the plow reaches it.', 'Call the outpost before your trip to confirm which units are open.']
  },
  'or-seasonal-road-guidance': {
    kind: 'notice', scope: 'Oregon · statewide', title: 'Oregon seasonal road guidance',
    paragraphs: ['Oregon offices may close areas during wet weather to protect roads and soils.'],
    items: ['Gated roads close from November 1 to May 15 or when ruts form.', 'Do not drive on roads where your tires leave ruts deeper than 2 inches.', 'Check closures before each trip; they change with the weather.']
  },
  'ak-anch-access-map': {
    kind: 'map', scope: 'Anchorage Aurora Outpost · Alaska', title: 'Anchorage access map',
    intro: 'Main access routes to the Anchorage permit areas. Seasonal gates close during breakup.',
    features: `${STREAM}${ACCESS_ROADS}${PARKING}`,
    legendRows: [[swatch.road(), 'Year-round road'], [swatch.seasonal(), 'Seasonal road'], [swatch.gate(), 'Gate, closed during breakup'], [swatch.water(), 'River'], [swatch.point(), 'Parking']]
  },
  'or-prin-winter-travel-map': {
    kind: 'map', scope: 'Prineville Pinecone District · Oregon', title: 'Prineville winter travel map',
    intro: 'Roads plowed and closed for the winter season.',
    features: `${ACCESS_ROADS}${closedArea('320,20 460,20 460,110 330,110')}${PARKING}`,
    legendRows: [[swatch.road(), 'Plowed road'], [swatch.seasonal(), 'Not plowed in winter'], [swatch.gate(), 'Winter gate'], [swatch.closed(), 'Closed to vehicles in winter'], [swatch.point(), 'Snow park']]
  }
};

function areaDocument(id) {
  const doc = AREA_DOCUMENTS[id];
  if (doc.kind === 'map') {
    return mapDocument({ kicker: `Area map · ${doc.scope}`, title: doc.title, intro: doc.intro, features: doc.features, legendRows: doc.legendRows });
  }
  return [
    ...header(`Area notice · ${doc.scope}`, doc.title),
    ...doc.paragraphs.map(text => ({ text, style: 'intro' })),
    { ul: doc.items, fontSize: 10.5, lineHeight: 1.3 },
    { text: SAMPLE_NOTE, style: 'small', margin: [0, 14, 0, 0] }
  ];
}

const TYPE_BUILDERS = { stipulations: stipulationsDocument, map: type => TYPE_MAPS[type](), reference: type => REFERENCE[type]() };

export function documentContent(id) {
  for (const [type, docs] of Object.entries(TYPE_DOCUMENTS)) {
    const doc = docs.find(d => d.id === id);
    if (doc) return TYPE_BUILDERS[doc.kind](type);
  }
  if (AREA_DOCUMENTS[id]) return areaDocument(id);
  throw new Error(`Unknown sample document: ${id}`);
}

export function sampleDocumentIds() {
  return [...Object.values(TYPE_DOCUMENTS).flat().map(doc => doc.id), ...Object.keys(AREA_DOCUMENTS)];
}

// ---- The permit and its haul tags ---------------------------------------------------------------------------

const keyValueLayout = {
  hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.6),
  vLineWidth: () => 0,
  hLineColor: () => LINE,
  paddingTop: () => 4,
  paddingBottom: () => 4,
  paddingLeft: () => 0
};

// The engine splits an over-long word at the page width, not the table column's, so long unbroken entries
// (a 120-character email) get zero-width break opportunities. Ordinary entries are left alone.
const breakable = text => String(text).replace(/\S{48,}/g, word => word.match(/.{1,40}/gu).join('\u200B'));

function permitPage(p) {
  const rows = [
    ['Permit', p.productName],
    ['Collection type', p.typeLabel],
    ['Quantity', p.quantityLabel],
    ['Area', `${p.areaName} (${p.officeId}), ${p.stateName}`],
    ['Valid', `${p.validFrom} until ${p.validUntil} (${p.validDays} days)`],
    ['Fee', p.fee],
    ['Haul tags', p.tagLine],
    ['Permit holder', p.holder.name],
    ['Mailing address', p.holder.addressLines.join(', ')],
    ['Email', p.holder.email],
    ['Issued', p.issued]
  ];
  const steps = [
    'Print every page of this package.',
    'Sign and date this permit. It is not valid until you sign it.',
    ...(p.tagCount ? [`Before loading, cut or tear out the month, day and AM or PM on one haul tag for each ${p.tagEach}, and attach it where it can be seen.`] : []),
    'Carry this signed permit and the maps while collecting, and follow the stipulations.'
  ];
  return [
    { columns: [{ text: 'BUREAU OF WANDERING LANDS', style: 'kicker' }, { text: 'DEMO · NOT VALID FOR HARVESTING', style: 'kicker', alignment: 'right', color: DANGER }] },
    { text: 'Forest Product Permit', style: 'title' },
    {
      columns: [
        { width: '*', stack: [{ text: 'Permit number', style: 'label' }, { text: p.permitNumber, fontSize: 20, color: INK }] },
        { width: 'auto', stack: [{ text: 'Valid until', style: 'label' }, { text: p.validUntil, fontSize: 20, color: INK }] }
      ],
      columnGap: 20
    },
    { text: 'Not valid until printed and signed by the permit holder.', style: 'warning' },
    { table: { widths: [104, '*'], body: rows.map(([key, value]) => [{ text: key, style: 'label', margin: [0, 1, 0, 0] }, { text: breakable(value), fontSize: 10.5 }]) }, layout: keyValueLayout },
    ...(p.eligibility ? [{ text: 'Eligibility certification', style: 'heading' }, { text: `${p.eligibility} Basis: ${p.eligibilityBasis}.`, fontSize: 10, lineHeight: 1.25 }] : []),
    { text: 'Permit holder agreement', style: 'heading' },
    { text: 'By signing, I agree to the permit terms and the stipulations in this package. I will collect only for personal use, only in the areas shown on the maps, and only while this permit is valid.', fontSize: 10, lineHeight: 1.25 },
    {
      columns: [
        { width: '*', stack: [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 300, y2: 0, lineWidth: 1, lineColor: INK }] }, { text: 'Permit holder signature', style: 'label', margin: [0, 3, 0, 0] }] },
        { width: 150, stack: [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 1, lineColor: INK }] }, { text: 'Date', style: 'label', margin: [0, 3, 0, 0] }] }
      ],
      columnGap: 24,
      margin: [0, 34, 0, 4]
    },
    { text: `Printed name: ${p.holder.name}`, fontSize: 10, margin: [0, 4, 0, 0] },
    { text: 'How to use this package', style: 'heading' },
    { ol: steps, fontSize: 10, lineHeight: 1.25 }
  ];
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const TAG_TITLES = { fuelwood: 'FIREWOOD HAUL TAG', christmas: 'CHRISTMAS TREE TAG' };

// The cut-outs sit on the tag's edges so each can be cut or torn out as a notch without touching another:
// months along the top, days 1–16 down the left, 17–31 down the right, and AM and PM along the bottom.
// The rows, and the lines between them (which add to a table's height), fill the tag exactly, so the tabs meet
// the dashed cut line.
const TAG_WIDTH = 258;
const TAG_HEIGHT = 312;
const CUT_LINE = 1;
const TAB_LINE = 0.7;
const DAY_ROW = (TAG_HEIGHT - 2 * CUT_LINE - 22 - 26 - 17 * TAB_LINE) / 16;
const TAG_HEIGHTS = [22, ...Array(16).fill(DAY_ROW), 26];
const TAB_FILL = '#eef5f0';

const tagLayout = {
  hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : TAB_LINE),
  vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length ? 0 : TAB_LINE),
  hLineColor: () => BORDER, vLineColor: () => BORDER,
  paddingTop: () => 0, paddingBottom: () => 0, paddingLeft: () => 0, paddingRight: () => 0
};

const tab = (text, height, fontSize = 7) => ({ text: String(text), alignment: 'center', fontSize, fillColor: TAB_FILL, margin: [0, (height - fontSize * 1.2) / 2, 0, 0] });
const corner = () => ({ text: '', fillColor: '#ffffff' });

function tagCell(p, index) {
  const center = {
    colSpan: 12, rowSpan: 16, margin: [9, 7, 9, 0],
    stack: [
      { columns: [{ width: '*', text: 'BUREAU OF WANDERING LANDS', style: 'kicker', fontSize: 6.5 }, { width: 'auto', text: `Tag ${index} of ${p.tagCount}`, fontSize: 8.5 }] },
      { text: TAG_TITLES[p.typeId], fontSize: 11.5, color: GREEN, margin: [0, 6, 0, 6] },
      // What an officer checks against the load, the amount and the expiry date, are the largest things on the tag.
      {
        table: { widths: ['*'], body: [
          [{ stack: [{ text: 'THIS TAG COVERS', style: 'kicker', fontSize: 6.5, alignment: 'center' }, { text: p.tagQuantity.toUpperCase(), fontSize: 24, color: INK, alignment: 'center', margin: [0, 1, 0, 0] }], margin: [0, 4, 0, 2] }],
          [{ stack: [{ text: 'VALID UNTIL', style: 'kicker', fontSize: 6.5, alignment: 'center' }, { text: p.validUntil.toUpperCase(), fontSize: 16, color: INK, alignment: 'center', margin: [0, 1, 0, 0] }], margin: [0, 4, 0, 3] }]
        ] },
        layout: { hLineWidth: (i, node) => (i === 1 ? 0.8 : 1.5), vLineWidth: () => 1.5, hLineColor: () => GREEN, vLineColor: () => GREEN },
        margin: [0, 0, 0, 8]
      },
      { text: `Permit ${p.permitNumber}`, fontSize: 10 },
      { text: `${p.areaName}, ${p.stateName}`, fontSize: 8, color: MUTED, margin: [0, 0, 0, 10] },
      { text: 'Before you load, cut or tear out the month, the day and AM or PM from the edges.', fontSize: 8, lineHeight: 1.2, margin: [0, 0, 0, 8] },
      { text: 'Attach to the load where it can be seen. Void if altered or used twice.', fontSize: 7.5, color: MUTED, lineHeight: 1.2 }
    ]
  };
  const body = [[corner(), ...MONTHS.map(month => tab(month, TAG_HEIGHTS[0], 6)), corner()]];
  for (let row = 1; row <= 16; row++) {
    const right = row + 16 <= 31 ? tab(row + 16, TAG_HEIGHTS[row]) : corner();
    body.push([tab(row, TAG_HEIGHTS[row]), ...(row === 1 ? [center, ...Array(11).fill({})] : Array(12).fill({})), right]);
  }
  const last = TAG_HEIGHTS.at(-1);
  body.push([corner(), { ...tab('AM', last, 9), colSpan: 6 }, ...Array(5).fill({}), { ...tab('PM', last, 9), colSpan: 6 }, ...Array(5).fill({}), corner()]);
  return { table: { widths: [22, ...Array(12).fill('*'), 22], heights: TAG_HEIGHTS, body }, layout: tagLayout };
}

const cutLineLayout = {
  hLineWidth: () => CUT_LINE, vLineWidth: () => CUT_LINE, hLineColor: () => BORDER, vLineColor: () => BORDER,
  hLineStyle: () => ({ dash: { length: 5, space: 3 } }), vLineStyle: () => ({ dash: { length: 5, space: 3 } }),
  paddingTop: () => 0, paddingBottom: () => 0, paddingLeft: () => 0, paddingRight: () => 0
};

// Letter paper in points. Tag sheets are placed by absolute position, so their geometry is exact on the page.
export const PAGE = { width: 612, height: 792 };
const GRID = { x: (PAGE.width - 2 * TAG_WIDTH) / 2, y: (PAGE.height - 2 * TAG_HEIGHT) / 2 };
const SLOTS = {
  topLeft: { x: GRID.x, y: GRID.y },
  topRight: { x: GRID.x + TAG_WIDTH, y: GRID.y },
  bottomLeft: { x: GRID.x, y: GRID.y + TAG_HEIGHT },
  bottomRight: { x: GRID.x + TAG_WIDTH, y: GRID.y + TAG_HEIGHT },
  center: { x: (PAGE.width - TAG_WIDTH) / 2, y: (PAGE.height - TAG_HEIGHT) / 2 }
};

// Printed double-sided, a sheet turns over its long edge (left and right swap) or its short edge (top and
// bottom swap), and the package cannot know which. Each sheet's tags sit where both mirrors land on the same
// spots, and that is where its load records go: four tags fill the sheet, two sit on a diagonal, and one sits in
// the centre. No arrangement of three works, so a remainder of three becomes a diagonal pair and a centred tag.
export const mirrorLongEdge = rect => ({ ...rect, x: PAGE.width - rect.x - rect.width });
export const mirrorShortEdge = rect => ({ ...rect, y: PAGE.height - rect.y - rect.height });

export function tagSheetLayout(count) {
  const sheets = [];
  let number = 1;
  const add = slots => sheets.push(slots.map(slot => ({ number: number++, ...SLOTS[slot], width: TAG_WIDTH, height: TAG_HEIGHT })));
  for (let sheet = 0; sheet < Math.floor(count / 4); sheet++) add(['topLeft', 'topRight', 'bottomLeft', 'bottomRight']);
  if (count % 4 >= 2) add(['topLeft', 'bottomRight']);
  if (count % 2 === 1) add(['center']);
  return sheets;
}

const placed = (content, rect) => ({
  absolutePosition: { x: rect.x, y: rect.y },
  table: { widths: [rect.width - 2 * CUT_LINE], heights: [rect.height - 2 * CUT_LINE], body: [[content]] },
  layout: cutLineLayout
});

const sheetHeading = (left, right) => ({
  absolutePosition: { x: GRID.x, y: GRID.y - 22 },
  columns: [{ text: left, fontSize: 10, color: INK }, { text: right, fontSize: 9, color: MUTED, alignment: 'right' }],
  width: PAGE.width - 2 * GRID.x
});

function tagSheet(p, tags) {
  return [
    sheetHeading(`Haul tags · Permit ${p.permitNumber}`, 'Cut along the dashed lines'),
    ...tags.map(tag => placed(tagCell(p, tag.number), tag))
  ];
}

// The page after each tag sheet holds one load record for each of its tags, at the mirrored positions. Printed
// double-sided, a record lands behind every tag whichever way the sheet turns; printed one-sided, the records are
// a separate sheet. The records are identical, the wording fits both, and the text stays inside the cut-out tabs
// so notching a tag does not remove it.
const fieldLine = label => ({
  stack: [
    { text: label, style: 'label', fontSize: 7.5 },
    { canvas: [{ type: 'line', x1: 0, y1: 16, x2: 186, y2: 16, lineWidth: 0.8, lineColor: BORDER }] }
  ],
  margin: [0, 8, 0, 0]
});

function loadRecordCard(p) {
  return {
    margin: [32, 36, 32, 0],
    stack: [
      { text: 'BUREAU OF WANDERING LANDS', style: 'kicker', fontSize: 6.5 },
      { text: 'Load record', fontSize: 13, color: GREEN, margin: [0, 3, 0, 1] },
      { text: `Permit ${p.permitNumber}`, fontSize: 9.5 },
      fieldLine('Vehicle license plate'),
      fieldLine('Loaded at (road or area)'),
      fieldLine('Permit holder initials'),
      { text: `Fill in one record for each load and keep it with that load’s haul tag. Use one tag for each ${p.tagEach}, attached with its cut-outs facing out where it can be seen.`, fontSize: 7.5, color: MUTED, lineHeight: 1.2, margin: [0, 12, 0, 0] }
    ]
  };
}

function loadRecordSheet(p, tags) {
  return [
    sheetHeading(`Load records · Permit ${p.permitNumber}`, 'One record for each load'),
    ...tags.map(mirrorLongEdge).map(rect => placed(loadRecordCard(p), rect))
  ];
}

// Each section is a list of pages; every page after the first starts on a new sheet. Tag sheets must start on
// the front of a sheet: when the permit and stipulations take an odd number of pages, the collection-type map
// (one page) moves ahead of the tags to fill the gap instead of a blank page.
export function packageSections(p, { frontPageCount = 0 } = {}) {
  const front = [permitPage(p), documentContent(p.documents.stipulations)];
  const typeMap = documentContent(p.documents.map);
  const mapFillsGap = p.tagCount > 0 && frontPageCount % 2 === 1;
  const tags = [];
  if (p.tagCount) {
    if (mapFillsGap) tags.push(typeMap);
    for (const sheet of tagSheetLayout(p.tagCount)) tags.push(tagSheet(p, sheet), loadRecordSheet(p, sheet));
  }
  // Notice documents already carry their state's or office's description; the summary page holds the rest.
  const notices = p.area.descriptions.length || p.area.links.length
    ? [[
      ...header('Area notices', `${p.areaName}, ${p.stateName}`, 'Conditions change. Check these before each trip.'),
      ...p.area.descriptions.map(d => ({ stack: [{ text: d.scope, style: 'label' }, { text: d.text, fontSize: 10.5, lineHeight: 1.3, margin: [0, 1, 0, 8] }] })),
      ...(p.area.links.length ? [{ text: 'Online only', style: 'heading' }, { ul: p.area.links.map(l => `${l.label}: ${l.url}`), fontSize: 10 }] : [])
    ]]
    : [];
  const reading = [
    ...(mapFillsGap ? [] : [typeMap]),
    ...p.area.maps.map(id => documentContent(id)),
    ...notices,
    ...p.area.notices.map(id => documentContent(id)),
    documentContent(p.documents.reference)
  ];
  return { front, tags, reading };
}

export function sectionsToContent(sections) {
  return sections.flat().map((page, index) => ({ stack: page, ...(index ? { pageBreak: 'before' } : {}) }));
}
