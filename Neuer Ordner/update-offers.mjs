import { writeFile } from 'node:fs/promises';

const SOURCE_URL = 'https://www.meinprospekt.de/angebote/monster-energy';
const AKTIONSPREIS_URL = 'https://www.aktionspreis.de/angebote/monster-energy-0-5l';
const OUTPUT_URL = new URL('./latest-offers.js', import.meta.url);

function berlinDate() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function schemaBlocks(html) {
  const blocks = [];
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      // Ignore unrelated or malformed structured data blocks.
    }
  }
  return blocks;
}

function htmlText(value) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&euro;/gi, '€')
    .replace(/&uuml;/gi, 'ü')
    .replace(/&auml;/gi, 'ä')
    .replace(/&ouml;/gi, 'ö')
    .replace(/&szlig;/gi, 'ß')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function isoDate(value) {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/);
  if (!match) return '';
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2]}-${match[1]}`;
}

async function aktionspreisOffers(today) {
  const response = await fetch(AKTIONSPREIS_URL, {
    headers: { 'user-agent': 'MonsterRadar/1.0 (weekly offer refresh)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Aktionspreis.de antwortete mit HTTP ${response.status}`);

  const html = await response.text();
  const found = [];
  const tablePattern = /<table\b[^>]*typeof=["']OfferCatalog["'][^>]*>[\s\S]*?<\/table>/gi;
  const retailerPattern = /^(ALDI Nord|ALDI Süd|Netto|Netto Marken-Discount|Norma|REWE) Angebote$/i;
  for (const match of html.matchAll(tablePattern)) {
    const table = match[0];
    const retailerTitle = table.match(/<div\s+title=["']([^"']+ Angebote)["']/i)?.[1];
    if (!retailerTitle || !retailerPattern.test(retailerTitle)) continue;

    const store = retailerTitle.replace(/ Angebote$/i, '');
    const text = htmlText(table);
    const current = text.match(/noch \d+ Tage gültig,\s*bis (\d{2}\.\d{2}\.\d{2})\s*(\d+[,.]\d{2})\s*€/i);
    if (!current) continue;

    const validUntil = isoDate(current[1]);
    const price = Number(current[2].replace(',', '.'));
    if (!validUntil || validUntil < today || !Number.isFinite(price) || price <= 0) continue;

    const purchaseCondition = text.match(/\|\s*(beim Kauf[^>]+?)(?:\s+\d+ weitere Angebote|$)/i)?.[1];
    found.push({
      id: `aktionspreis-${store.toLocaleLowerCase('de').replace(/[^a-z0-9]+/g, '-')}-${validUntil}`,
      store,
      branch: '',
      flavor: 'Andere',
      pack: 1,
      ml: 500,
      price,
      validFrom: '',
      validUntil,
      demo: false,
      live: true,
      sourceName: 'Aktionspreis.de',
      sourceUrl: AKTIONSPREIS_URL,
      conditions: `Monster Energy 0,5 l${purchaseCondition ? `; ${purchaseCondition}` : ''}; lokale Verfügbarkeit bitte prüfen`,
    });
  }
  return found;
}

const response = await fetch(SOURCE_URL, {
  headers: { 'user-agent': 'MonsterRadar/1.0 (weekly offer refresh)' },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`kaufDA antwortete mit HTTP ${response.status}`);

const blocks = schemaBlocks(await response.text());
const sourceOffers = [];
function collectOffers(value) {
  if (!value || typeof value !== 'object') return;
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  if (types.includes('Offer')) sourceOffers.push(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(collectOffers);
    else collectOffers(child);
  }
}
blocks.forEach(collectOffers);
if (!sourceOffers.length) throw new Error('Es wurden keine Händlerangebote gefunden; die vorhandene Datendatei bleibt unverändert.');

const today = berlinDate();
const uniqueOffers = new Map();
for (const offer of sourceOffers) {
  const store = String(offer.seller?.name || '').trim();
  const price = Number(offer.price);
  const validUntil = String(offer.priceValidUntil || '');
  if (!store || offer.priceCurrency !== 'EUR' || !Number.isFinite(price) || price <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil) || validUntil < today) continue;
  const key = `${store}|${price}|${validUntil}`;
  if (uniqueOffers.has(key)) continue;
  uniqueOffers.set(key, {
    id: `meinprospekt-${store.toLocaleLowerCase('de').replace(/[^a-z0-9]+/g, '-')}-${validUntil}`,
    store,
    branch: '',
    flavor: 'Andere',
    pack: 1,
    ml: 500,
    price,
    validFrom: '',
    validUntil,
    demo: false,
    live: true,
    sourceName: 'MeinProspekt',
    sourceUrl: SOURCE_URL,
    conditions: 'Monster Energy 0,5 l; Prospektangebot, lokale Filialverfügbarkeit bitte prüfen',
  });
}

let additionalOffers = [];
try {
  additionalOffers = await aktionspreisOffers(today);
} catch (error) {
  console.warn(`Aktionspreis.de konnte nicht geprüft werden: ${error.message}`);
}

for (const offer of additionalOffers) {
  const key = `${offer.store.toLocaleLowerCase('de')}|${offer.price}|${offer.validUntil}`;
  if (!uniqueOffers.has(key)) uniqueOffers.set(key, offer);
}

const data = {
  scheduleEnabled: true,
  regionScope: 'national',
  checkedAt: new Date().toISOString(),
  sourcesChecked: additionalOffers.length ? ['MeinProspekt', 'Aktionspreis.de'] : ['MeinProspekt'],
  offers: [...uniqueOffers.values()],
};

const javascript = `window.MONSTER_RADAR_LIVE_OFFERS = ${JSON.stringify(data, null, 2)};\n`;
await writeFile(OUTPUT_URL, javascript, 'utf8');
console.log(`MeinProspekt: ${uniqueOffers.size - additionalOffers.length} Angebote; Aktionspreis.de: ${additionalOffers.length} weitere aktuelle Händlerangebote.`);