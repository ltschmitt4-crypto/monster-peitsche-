(() => {
  'use strict';

  const STORAGE_KEY = 'monster-radar-offers-v1';
  const DEMO_STATUS = 'Stand: Beispieldaten';
  const AUTO_REFRESH_INTERVAL_MS = 60_000;
  const NEARBY_RADIUS_METERS = 15_000;
  const $ = (selector) => document.querySelector(selector);
  let scannerData = window.MONSTER_RADAR_LIVE_OFFERS || {};
  const form = $('#offerForm');
  const postalForm = $('#postalForm');
  const dialog = $('#offerDialog');
  const fields = form.elements;
  let toastTimer;
  let autoRefreshTimer;
  let pendingScannerData = null;
  let updateCheckInProgress = false;

  function applyScannerData(data) {
    scannerData = data || {};
    if (scannerData.checkedAt || getCurrentLiveOffers().length) $('#hideDemo').checked = true;
    render();
    showToast('Neue Prospektdaten geladen.');
  }

  function scheduleAutoRefresh(delay = AUTO_REFRESH_INTERVAL_MS) {
    clearTimeout(autoRefreshTimer);
    autoRefreshTimer = setTimeout(() => {
      if (dialog.open || document.visibilityState === 'hidden' || updateCheckInProgress) {
        scheduleAutoRefresh(15_000);
        return;
      }

      updateCheckInProgress = true;
      const script = document.createElement('script');
      let finished = false;
      const finishCheck = () => {
        if (finished) return;
        finished = true;
        updateCheckInProgress = false;
        script.remove();
        scheduleAutoRefresh();
      };
      script.async = true;
      script.onload = () => {
        const latestData = window.MONSTER_RADAR_LIVE_OFFERS || {};
        if (latestData.checkedAt !== scannerData.checkedAt) {
          if (dialog.open) pendingScannerData = latestData;
          else applyScannerData(latestData);
        }
        finishCheck();
      };
      script.onerror = finishCheck;
      script.src = `./latest-offers.js?refresh=${Date.now()}`;
      document.head.append(script);
    }, delay);
  }

  function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function mondayOfWeek(date = new Date()) {
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = monday.getDay();
    monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
    return monday;
  }

  function sundayOfWeek(date = new Date()) {
    const sunday = mondayOfWeek(date);
    sunday.setDate(sunday.getDate() + 6);
    return sunday;
  }

  function isoWeek(date = new Date()) {
    const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = copy.getUTCDay() || 7;
    copy.setUTCDate(copy.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
    return Math.ceil((((copy - yearStart) / 86400000) + 1) / 7);
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
  }

  function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function isDateOnly(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T12:00:00`);
    return !Number.isNaN(parsed.getTime()) && localDateString(parsed) === value;
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value));
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(`${value}T12:00:00`);
    return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(date);
  }

  function abbreviate(store) {
    const words = store.trim().split(/\s+/).filter(Boolean);
    return words.length > 1 ? `${words[0][0]}${words[1][0]}`.toUpperCase() : store.slice(0, 2).toUpperCase();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function normalizeOffer(raw) {
    const offer = {
      id: String(raw.id || createId()),
      store: String(raw.store || '').trim(),
      branch: String(raw.branch || '').trim(),
      flavor: String(raw.flavor || 'Original'),
      pack: Number(raw.pack),
      ml: Number(raw.ml),
      price: Number(raw.price),
      validFrom: String(raw.validFrom || ''),
      validUntil: String(raw.validUntil || ''),
      demo: Boolean(raw.demo),
      live: Boolean(raw.live),
      sourceName: String(raw.sourceName || ''),
      sourceUrl: safeHttpUrl(raw.sourceUrl || ''),
      conditions: String(raw.conditions || ''),
    };
    if (!offer.store || !Number.isInteger(offer.pack) || offer.pack < 1 || offer.pack > 48 ||
        !Number.isFinite(offer.ml) || offer.ml < 100 || offer.ml > 2000 ||
        !Number.isFinite(offer.price) || offer.price <= 0 || offer.price > 999 ||
        Math.abs(offer.price * 100 - Math.round(offer.price * 100)) > 0.000001 ||
        !isDateOnly(offer.validUntil) || (offer.validFrom && !isDateOnly(offer.validFrom))) return null;
    return offer;
  }

  function demoData() {
    const validUntil = localDateString(sundayOfWeek());
    return [
      { store: 'REWE', branch: 'Beispielmarkt', flavor: 'Original', pack: 1, ml: 500, price: 0.99, validUntil },
      { store: 'EDEKA', branch: 'Beispielmarkt', flavor: 'Original', pack: 1, ml: 500, price: 0.95, validUntil },
      { store: 'Kaufland', branch: 'Beispielmarkt', flavor: 'Original', pack: 4, ml: 500, price: 3.56, validUntil },
      { store: 'Lidl', branch: 'Beispielmarkt', flavor: 'Original', pack: 1, ml: 500, price: 0.89, validUntil },
      { store: 'Aldi Nord', branch: 'Beispielmarkt', flavor: 'Original', pack: 1, ml: 500, price: 0.89, validUntil },
      { store: 'Aldi Süd', branch: 'Beispielmarkt', flavor: 'Original', pack: 1, ml: 500, price: 0.89, validUntil },
      { store: 'Penny', branch: 'Beispielmarkt', flavor: 'Original', pack: 1, ml: 500, price: 0.99, validUntil },
    ].map((offer, index) => normalizeOffer({ ...offer, id: `demo-${index + 1}`, demo: true }));
  }

  function loadOffers() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return demoData();
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return demoData();
      return parsed.map(normalizeOffer).filter(Boolean);
    } catch (error) {
      console.warn('Gespeicherte Angebote konnten nicht gelesen werden.', error);
      return demoData();
    }
  }

  let offers = loadOffers();

  function getLiveOffers() {
    if (!Array.isArray(scannerData.offers)) return [];
    return scannerData.offers.map((raw) => normalizeOffer({
      ...raw,
      id: raw.id || `live-${raw.store || 'markt'}-${raw.validFrom || ''}-${raw.validUntil || ''}-${raw.price || ''}`,
      live: true,
      demo: false,
    })).filter(Boolean);
  }

  function getCurrentLiveOffers() {
    const today = localDateString(new Date());
    return getLiveOffers().filter((offer) => (!offer.validFrom || offer.validFrom <= today) && offer.validUntil >= today);
  }

  function normalizePlaceName(value) {
    return String(value || '').toLocaleLowerCase('de')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function matchesOfferStore(tags, store) {
    const aliases = {
      'aldi nord': ['aldi nord'],
      'aldi sud': ['aldi sud'],
      edeka: ['edeka', 'e center'],
      'v markt': ['v markt'],
    };
    const candidates = [tags.name, tags.brand, tags.operator].map(normalizePlaceName).filter(Boolean);
    const storeName = normalizePlaceName(store);
    const storeAliases = aliases[normalizePlaceName(store)] || [storeName];
    return storeAliases.some((alias) => candidates.some((candidate) => candidate.includes(alias)));
  }

  function distanceInKilometers(from, to) {
    const radians = (degrees) => degrees * Math.PI / 180;
    const latitudeDelta = radians(to.lat - from.lat);
    const longitudeDelta = radians(to.lon - from.lon);
    const arc = Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
  }

  async function findPostalCoordinates(postalCode) {
    const params = new URLSearchParams({
      postalcode: postalCode,
      countrycodes: 'de',
      format: 'jsonv2',
      addressdetails: '1',
      limit: '1',
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'Accept-Language': 'de' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Die PLZ-Suche ist momentan nicht erreichbar (HTTP ${response.status}).`);
    const results = await response.json();
    const match = results.find((result) => result.address?.postcode === postalCode);
    if (!match) throw new Error('Diese deutsche Postleitzahl wurde nicht gefunden. Bitte prüfe die Eingabe.');
    return { lat: Number(match.lat), lon: Number(match.lon) };
  }

  async function findNearbyShops(location) {
    const query = `[out:json][timeout:20];(nwr(around:${NEARBY_RADIUS_METERS},${location.lat},${location.lon})["shop"~"^(supermarket|convenience|beverages)$"]["name"];);out center tags;`;
    const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error(`Die Filialsuche ist momentan nicht erreichbar (HTTP ${response.status}).`);
    const data = await response.json();
    return data.elements.map((element) => {
      const coordinates = element.type === 'node' ? element : element.center;
      if (!coordinates || !Number.isFinite(Number(coordinates.lat)) || !Number.isFinite(Number(coordinates.lon))) return null;
      return {
        id: `${element.type}-${element.id}`,
        tags: element.tags || {},
        lat: Number(coordinates.lat),
        lon: Number(coordinates.lon),
      };
    }).filter(Boolean);
  }

  function nearbyOfferResults(location, shops, liveOffers) {
    const results = [];
    for (const shop of shops) {
      const distance = distanceInKilometers(location, shop);
      if (distance > NEARBY_RADIUS_METERS / 1000) continue;
      const storeOffers = liveOffers.filter((offer) => matchesOfferStore(shop.tags, offer.store));
      for (const offer of storeOffers) results.push({ offer, shop, distance });
    }
    return results.sort((left, right) =>
      getUnitPrice(left.offer) - getUnitPrice(right.offer) ||
      getCanPrice(left.offer) - getCanPrice(right.offer) ||
      left.distance - right.distance ||
      left.offer.store.localeCompare(right.offer.store, 'de'));
  }

  function renderNearbyResults(results, postalCode) {
    const list = $('#nearbyList');
    const status = $('#nearbyStatus');
    const distanceFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
    if (!results.length) {
      status.textContent = `Keine Filiale mit einem aktuell erfassten Monster-Prospektangebot im Umkreis von 15 km um ${postalCode} gefunden.`;
      list.innerHTML = '';
      return;
    }

    const branchCount = new Set(results.map(({ shop }) => shop.id)).size;
    status.textContent = `${branchCount} ${branchCount === 1 ? 'Filiale' : 'Filialen'} mit ${results.length} erfassten Preisangeboten im Umkreis von 15 km um ${postalCode} – nach Preis pro Liter sortiert.`;
    list.innerHTML = results.map(({ offer, shop, distance }) => {
      const address = [shop.tags['addr:street'], shop.tags['addr:housenumber']].filter(Boolean).join(' ');
      const city = shop.tags['addr:city'] || shop.tags['addr:postcode'] || '';
      const place = [address, city].filter(Boolean).join(', ');
      const mapUrl = `https://www.openstreetmap.org/?mlat=${shop.lat}&mlon=${shop.lon}#map=17/${shop.lat}/${shop.lon}`;
      const sourceLink = offer.sourceUrl
        ? `<a class="source-link" href="${escapeHtml(offer.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(offer.sourceName || 'Prospekt öffnen')} ↗</a>`
        : '';
      return `<li class="nearby-result">
        <span class="nearby-price">${formatMoney(getUnitPrice(offer))}<small> / L</small></span>
        <div class="nearby-store">
          <strong>${escapeHtml(shop.tags.name || offer.store)}</strong>
          <span>${escapeHtml(offer.store)} · ${distanceFormat.format(distance)} km${place ? ` · ${escapeHtml(place)}` : ''}</span>
          <span>${escapeHtml(offer.flavor)} · ${offer.pack} × ${offer.ml} ml · ${formatMoney(getCanPrice(offer))} pro Dose · gültig bis ${formatDate(offer.validUntil)}</span>
          ${offer.conditions ? `<span>${escapeHtml(offer.conditions)}</span>` : ''}
          ${sourceLink}
        </div>
        <a class="nearby-map-link" href="${mapUrl}" target="_blank" rel="noopener noreferrer" aria-label="Karte für ${escapeHtml(shop.tags.name || offer.store)} öffnen">Karte ↗</a>
      </li>`;
    }).join('');
  }

  postalForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const postalCode = $('#postalCode').value.trim();
    if (!/^\d{5}$/.test(postalCode)) return;

    const button = $('#nearbySearchButton');
    const results = $('#nearbyResults');
    const status = $('#nearbyStatus');
    button.disabled = true;
    results.hidden = false;
    status.textContent = 'Postleitzahl wird gesucht, nahe Filialen und Prospektpreise werden geladen …';
    $('#nearbyList').innerHTML = '';
    try {
      const location = await findPostalCoordinates(postalCode);
      const shops = await findNearbyShops(location);
      renderNearbyResults(nearbyOfferResults(location, shops, getCurrentLiveOffers()), postalCode);
    } catch (error) {
      status.textContent = error.name === 'TimeoutError'
        ? 'Die Suche hat zu lange gedauert. Bitte versuche es später erneut.'
        : (error instanceof TypeError
          ? 'Die Suche konnte nicht mit OpenStreetMap verbunden werden. Bitte prüfe deine Internetverbindung.'
          : error.message);
    } finally {
      button.disabled = false;
    }
  });

  function saveOffers() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(offers));
      $('#updatedAt').textContent = `Zuletzt geändert: ${new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date())} Uhr`;
    } catch (error) {
      console.error('Angebote konnten nicht gespeichert werden.', error);
      showToast('Speichern war nicht möglich. Prüfe den Browser-Speicher.');
    }
  }

  function getUnitPrice(offer) {
    return offer.price / (offer.pack * offer.ml) * 1000;
  }

  function getCanPrice(offer) {
    return offer.price / offer.pack;
  }

  function offerDescription(offer) {
    const pack = offer.pack > 1 ? `${offer.pack} × ` : '';
    const branch = offer.branch.replace(/\b\d{5}\b/g, '').replace(/\s{2,}/g, ' ').trim().replace(/^[,·\-\s]+|[,·\-\s]+$/g, '');
    return `${escapeHtml(offer.flavor)} · ${pack}${offer.ml} ml${branch ? ` · ${escapeHtml(branch)}` : ''}`;
  }

  function getVisibleOffers() {
    const flavor = $('#flavorFilter').value;
    const hideDemo = $('#hideDemo').checked;
    const today = localDateString(new Date());
    const allOffers = [...offers, ...getLiveOffers()];
    return allOffers.filter((offer) => (!offer.validFrom || offer.validFrom <= today) && offer.validUntil >= today && (!hideDemo || !offer.demo) && (flavor === 'all' || offer.flavor === flavor))
      .sort((left, right) => getUnitPrice(left) - getUnitPrice(right) || left.price - right.price || left.store.localeCompare(right.store, 'de'));
  }

  function renderRows(list) {
    const tbody = $('#offerRows');
    const empty = $('#emptyState');
    empty.hidden = list.length > 0;
    if (!list.length) {
      tbody.innerHTML = '';
      return;
    }
    tbody.innerHTML = list.map((offer, index) => {
      const best = index === 0;
      const tag = offer.live ? '<span class="live-tag">Live</span>' : (offer.demo ? '<span class="sample-tag">Demo</span>' : '');
      const source = offer.live && offer.sourceUrl
        ? `<a class="source-link" href="${escapeHtml(offer.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(offer.sourceName || 'Prospekt öffnen')} ↗</a>`
        : '';
      const condition = offer.conditions ? ` · ${escapeHtml(offer.conditions)}` : '';
      return `<tr class="${best ? 'best-row' : ''}">
        <td><span class="rank-number">${best ? '<span class="rank-star" aria-hidden="true">✦</span>' : String(index + 1).padStart(2, '0')}</span></td>
        <td><div class="market-cell"><span class="market-avatar" aria-hidden="true">${escapeHtml(abbreviate(offer.store))}</span><span><span class="market-name">${escapeHtml(offer.store)}${tag}</span><span class="market-detail">${offerDescription(offer)}${condition}</span>${source}</span></div></td>
        <td class="date-cell">${formatDate(offer.validUntil)}</td>
        <td class="dose-price">${formatMoney(getCanPrice(offer))}</td>
        <td class="liter-price">${formatMoney(getUnitPrice(offer))}<span class="market-detail"> / L</span>${best ? '<span class="best-pill">BESTER PREIS</span>' : ''}</td>
        <td>${offer.live ? '<span class="source-scan-label">Scan</span>' : `<button class="delete-offer" type="button" data-delete="${escapeHtml(offer.id)}" aria-label="Angebot von ${escapeHtml(offer.store)} entfernen" title="Angebot entfernen">×</button>`}</td>
      </tr>`;
    }).join('');
  }

  function renderSummary(list) {
    const best = list[0];
    const marketCount = new Set(list.map((offer) => offer.store.toLocaleLowerCase('de'))).size;
    const sampleCount = offers.filter((offer) => offer.demo).length;
    const ownCount = offers.filter((offer) => !offer.demo).length;
    const liveCount = getCurrentLiveOffers().length;
    $('#offerCount').textContent = String(list.length);
    $('#marketCount').textContent = String(marketCount);
    $('#dataNote').textContent = liveCount ? `${liveCount} Live-Treffer · geprüft` : (scannerData.checkedAt ? 'Kein aktueller Live-Treffer' : (sampleCount ? `${sampleCount} Beispielpreise sichtbar` : 'Eigene Angebote'));
    $('#resultLabel').textContent = `${list.length} ${list.length === 1 ? 'Angebot' : 'Angebote'} · ${marketCount} ${marketCount === 1 ? 'Markt' : 'Märkte'}`;
    $('#bestCanPrice').textContent = best ? formatMoney(getCanPrice(best)) : '—';
    $('#bestCanDetail').textContent = best ? `${best.store} · ${best.flavor}` : 'Noch keine Angebote';
    $('#bestLiterPrice').textContent = best ? `${formatMoney(getUnitPrice(best))} / L` : '—';
    $('#sideBestPrice').textContent = best ? formatMoney(getCanPrice(best)) : '—';
    $('#sideBestUnit').textContent = best ? `pro Dose · ${formatMoney(getUnitPrice(best))} / L` : 'pro Dose';
    $('#sideBestStore').textContent = best ? best.store : 'Noch kein Markt';
    $('#sideBestOffer').textContent = best ? `${best.flavor} · ${best.pack} × ${best.ml} ml` : 'Angebot eintragen';
    $('#bestStoreAvatar').textContent = best ? abbreviate(best.store) : '—';
    $('#heroPrice').textContent = best ? formatMoney(getCanPrice(best)) : '—';
    $('#heroStore').textContent = best ? best.store : 'Noch kein Angebot';
    $('#bestWeek').textContent = `KW ${isoWeek()} · BESTER PREIS`;
    $('#updatedAt').textContent = scannerData.checkedAt
      ? `Live-Scan: ${new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(scannerData.checkedAt))} Uhr`
      : (ownCount ? 'Eigene Daten lokal gespeichert' : DEMO_STATUS);
    renderScanNotice(liveCount, sampleCount);
  }

  function renderScanNotice(liveCount, sampleCount) {
    const status = $('#scheduleStatus');
    const notice = $('#scanNotice');
    status.textContent = scannerData.scheduleEnabled ? 'Montagsscan aktiv' : 'Datencheck alle 60 s';
    if (scannerData.checkedAt) {
      const checked = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(scannerData.checkedAt));
      const sourceNames = Array.isArray(scannerData.sourcesChecked) ? scannerData.sourcesChecked.join(', ') : '';
      const scopeNote = scannerData.regionScope === 'national'
        ? ' Die Quelle zeigt bundesweite Prospektangebote; die Verfügbarkeit einzelner Filialen bitte prüfen.'
        : '';
      notice.innerHTML = `<strong>Letzter Prospektscan: ${escapeHtml(checked)}.</strong> ${liveCount} gültige ${liveCount === 1 ? 'Preisfund' : 'Preisfunde'}${sourceNames ? ` aus ${escapeHtml(sourceNames)}` : ''}.${scopeNote}${sampleCount ? ' Die fiktiven Beispiele sind ausgeblendet.' : ''} Öffne „Quelle“ beim Angebot, um den Prospekt zu prüfen.`;
    } else {
      notice.innerHTML = scannerData.scheduleEnabled
        ? '<strong>Montagsscan aktiv:</strong> Händlerpreise werden aus bundesweiten Prospekten geladen. Die Verfügbarkeit einzelner Filialen bitte prüfen. Bis zum ersten Lauf siehst du die klar markierten Beispielpreise.'
        : '<strong>Noch keine Live-Angebote:</strong> Die Datendatei wird automatisch geprüft, enthält aber noch keine Angebotsquelle. Beispielpreise sind fiktiv; eigene Einträge bleiben in diesem Browser.';
    }
  }

  function render() {
    const list = getVisibleOffers();
    renderRows(list);
    renderSummary(list);
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
  }

  function showDialog() {
    $('#formError').hidden = true;
    $('#formError').textContent = '';
    fields.store.value = '';
    fields.flavor.value = 'Original';
    fields.pack.value = '1';
    fields.ml.value = '500';
    fields.price.value = '';
    fields.validUntil.value = localDateString(sundayOfWeek());
    fields.branch.value = '';
    updatePreview();
    dialog.showModal();
    fields.store.focus();
  }

  function updatePreview() {
    const pack = Number(fields.pack.value);
    const ml = Number(fields.ml.value);
    const price = Number(fields.price.value.replace(',', '.'));
    const preview = $('#calculationPreview');
    const valid = pack > 0 && ml > 0 && price > 0;
    preview.innerHTML = valid
      ? `Pro Dose <strong>${formatMoney(price / pack)}</strong><span>·</span> pro Liter <strong>${formatMoney(price / (pack * ml) * 1000)} / L</strong>`
      : 'Pro Dose <strong>—</strong><span>·</span> pro Liter <strong>—</strong>';
  }

  function exportCsv() {
    function cell(value) {
      const text = String(value);
      const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replaceAll('"', '""')}"`;
    }
    const rows = [
      ['Markt', 'Filiale/Ort', 'Sorte', 'Dosen pro Packung', 'ml pro Dose', 'Packungspreis EUR', 'EUR pro Dose', 'EUR pro Liter', 'Gueltig ab', 'Gueltig bis', 'Bedingungen', 'Quelle', 'Datentyp'],
      ...getVisibleOffers().map((offer) => [offer.store, offer.branch, offer.flavor, offer.pack, offer.ml, offer.price.toFixed(2), getCanPrice(offer).toFixed(2), getUnitPrice(offer).toFixed(2), offer.validFrom, offer.validUntil, offer.conditions, offer.sourceUrl, offer.live ? 'Live' : (offer.demo ? 'Beispiel' : 'Eigen')]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(cell).join(';')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `monster-radar-kw${isoWeek()}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('CSV-Datei wurde exportiert.');
  }

  function setWeekLabel() {
    const start = mondayOfWeek();
    const end = sundayOfWeek();
    const range = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });
    $('#weekLabel').textContent = `KW ${isoWeek()} · ${range.format(start)} – ${range.format(end)}`;
  }

  $('#addOfferButton').addEventListener('click', showDialog);
  $('#emptyAddButton').addEventListener('click', showDialog);
  $('#closeDialog').addEventListener('click', () => dialog.close());
  $('#cancelDialog').addEventListener('click', () => dialog.close());
  $('#flavorFilter').addEventListener('change', render);
  $('#hideDemo').addEventListener('change', render);
  $('#exportButton').addEventListener('click', exportCsv);
  $('#dismissNotice').addEventListener('click', () => $('.notice').remove());
  [fields.pack, fields.ml, fields.price].forEach((field) => field.addEventListener('input', updatePreview));

  $('#offerRows').addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete]');
    if (!button) return;
    const target = offers.find((offer) => offer.id === button.dataset.delete);
    if (!target) return;
    offers = offers.filter((offer) => offer.id !== target.id);
    saveOffers();
    render();
    showToast(`${target.store} wurde aus dem Vergleich entfernt.`);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const error = $('#formError');
    const rawPrice = String(fields.price.value).replace(',', '.');
    const offer = normalizeOffer({
      id: createId(),
      store: fields.store.value,
      branch: fields.branch.value,
      flavor: fields.flavor.value,
      pack: fields.pack.value,
      ml: fields.ml.value,
      price: rawPrice,
      validUntil: fields.validUntil.value,
      demo: false,
    });
    if (!offer || offer.validUntil < localDateString(new Date())) {
      error.textContent = 'Bitte prüfe Markt, Packungsgröße, Preis und ein heutiges oder zukünftiges Gültigkeitsdatum.';
      error.hidden = false;
      return;
    }
    offers.push(offer);
    saveOffers();
    render();
    dialog.close();
    showToast('Angebot gespeichert und nach €/Liter einsortiert.');
  });

  $('#resetButton').addEventListener('click', () => {
    offers = [...offers.filter((offer) => !offer.demo), ...demoData()];
    $('#hideDemo').checked = false;
    $('#flavorFilter').value = 'all';
    saveOffers();
    render();
    showToast('Beispielangebote wurden ergänzt. Eigene Einträge bleiben erhalten.');
  });

  dialog.addEventListener('close', () => {
    if (pendingScannerData) {
      const latestData = pendingScannerData;
      pendingScannerData = null;
      applyScannerData(latestData);
    }
    scheduleAutoRefresh(1000);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleAutoRefresh(1000);
  });

  if (scannerData.checkedAt || getCurrentLiveOffers().length) $('#hideDemo').checked = true;
  setWeekLabel();
  render();
  scheduleAutoRefresh();
})();
