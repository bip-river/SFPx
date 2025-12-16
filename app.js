    let DATA = {};
    const STORAGE_KEY = 'sfp-demo-state';
    const DATA_SOURCE = 'products.json';

    const PRODUCT_TYPES = [
      { id: 'fuelwood', label: 'Fuelwood' },
      { id: 'christmas', label: 'Christmas trees' },
      { id: 'mushrooms', label: 'Mushrooms' }
    ];

    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const LENGTH_LIMITS = {
      FirstName: 50,
      MiddleName: 50,
      LastName: 50,
      AddressLine1: 120,
      AddressLine2: 120,
      City: 80,
      Zip: 10,
      Email: 120,
      Email2: 120,
    };
    const MAX_PAYLOAD_BYTES = 4096;

    // Banner toggle
    const bannerToggle = document.getElementById('bannerToggle');
    const bannerDetails = document.getElementById('bannerDetails');
    bannerToggle.addEventListener('click', () => {
      const open = bannerDetails.style.display === 'block';
      bannerDetails.style.display = open ? 'none' : 'block';
      bannerToggle.setAttribute('aria-expanded', String(!open));
    });

    // Elements
    const stateEl = document.getElementById('state');
    const officeInput = document.getElementById('officeInput');
    const officeIdEl = document.getElementById('officeId');
    const officeCombo = document.getElementById('officeCombo');
    const officeList = document.getElementById('officeList');
    const ptypeEl = document.getElementById('ptype');

    const productListEl = document.getElementById('productList');
    const qtyEl = document.getElementById('qty');
    const qtyHint = document.getElementById('qtyHint');
    const qtyGuard = document.getElementById('qtyGuard');
    const totalEl = document.getElementById('total');
    const totalCalc = document.getElementById('totalCalc');

    const qtySection = document.getElementById('qtySection');

    const ackPrivacy = document.getElementById('ackPrivacy');
    const ackTerms = document.getElementById('ackTerms');

    const errorBox = document.getElementById('errorBox');
    const errorList = document.getElementById('errorList');

    const steps = ['s1','s2','s3'].map(id => document.getElementById(id));
    const stepSections = [
      document.getElementById('step1'),
      document.getElementById('step2'),
      document.getElementById('step3')
    ];
    const stepToggles = Array.from(document.querySelectorAll('.step-toggle'));
    const stepStatuses = [
      document.getElementById('status1'),
      document.getElementById('status2'),
      document.getElementById('status3')
    ];

    const progressSummary = document.getElementById('progressSummary');
    const locationNotice = document.getElementById('locationNotice');
    const reviewSummary = document.getElementById('reviewSummary');
    const reviewNotice = document.getElementById('reviewNotice');
    const reviewActions = document.getElementById('reviewActions');
    const confirmPaygovBtn = document.getElementById('confirmPaygov');
    const handoff = document.getElementById('handoff');
    const purchaserFieldset = document.getElementById('purchaserFieldset');
    const purchaserBlockedHint = document.getElementById('purchaserBlockedHint');
    const stepLiveRegion = document.getElementById('stepLiveRegion');
    const lockNotes = [null, document.getElementById('step2LockNote'), document.getElementById('step3LockNote')];

    const transactionRefKey = 'sfp-demo-transaction-ref';

    const resetAllBtn = document.getElementById('resetAll');

    let purchaserWasLocked = true;

    // Purchaser fields
    const purchaser = {
      FirstName: document.getElementById('FirstName'),
      MiddleName: document.getElementById('MiddleName'),
      LastName: document.getElementById('LastName'),
      AddressLine1: document.getElementById('AddressLine1'),
      AddressLine2: document.getElementById('AddressLine2'),
      City: document.getElementById('City'),
      AddrState: document.getElementById('AddrState'),
      Zip: document.getElementById('Zip'),
      Email: document.getElementById('Email'),
      Email2: document.getElementById('Email2'),
    };

    // Model
    const model = {
      step: 0,
      state: '',
      officeId: '',
      officeName: '',
      ptype: '',
      productIndex: null,
      product: null,
      qty: 0
    };

    const stepState = {
      available: [true, false, false],
      completed: [false, false, false],
      open: [true, false, false]
    };
    let prevAvailability = [...stepState.available];

    function persistState() {
      const payload = {
        model: {
          state: model.state,
          officeId: model.officeId,
          officeName: model.officeName,
          officeInput: officeInput.value,
          ptype: model.ptype,
          productIndex: model.productIndex,
          qty: model.qty,
        },
        acknowledgements: {
          privacy: ackPrivacy.checked,
          terms: ackTerms.checked
        }
      };
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (err) {
        console.warn('Unable to persist form state', err);
      }
    }

    function clearPersistedState() {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch (err) { console.warn(err); }
    }

    function restoreState() {
      let saved;
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        saved = JSON.parse(raw);
      } catch (err) {
        console.warn('Unable to restore form state', err);
        return;
      }

      const savedModel = saved?.model || {};
      const savedAcknowledgements = saved?.acknowledgements || {};

      if (savedModel.state && DATA[savedModel.state]) {
        stateEl.value = savedModel.state;
        model.state = savedModel.state;
      }

      if (savedModel.ptype) {
        ptypeEl.value = savedModel.ptype;
        model.ptype = savedModel.ptype;
      }

      if (savedModel.officeId) {
        const offices = getOfficesForState(model.state);
        const match = offices.find(o => o.id === savedModel.officeId);
        if (match) {
          officeIdEl.value = match.id;
          model.officeId = match.id;
          model.officeName = match.name;
          officeInput.value = savedModel.officeInput || match.name;
        }
      } else if (savedModel.officeInput) {
        officeInput.value = savedModel.officeInput;
      }

      attemptAdvanceFromStep1();

      const products = getProductsForSelection();
      if (products.length && Number.isInteger(savedModel.productIndex) && products[savedModel.productIndex]) {
        const p = products[savedModel.productIndex];
        model.productIndex = savedModel.productIndex;
        model.product = p;
        const radio = document.getElementById(`prod_${savedModel.productIndex}`);
        if (radio) radio.checked = true;
        qtyHint.textContent = `Enter 1–${p.maxQty} ${p.unit}(s). Price: ${p.price===0?'Free':money(p.price)} per ${p.unit}.`;
        qtyEl.min = 1;
        qtyEl.max = p.maxQty || '';
        qtySection.style.display = 'block';
        if (savedModel.qty) {
          qtyEl.value = savedModel.qty;
        }
        commitQuantity({ showErrors: false, openNext: true });
      }

      ackPrivacy.checked = Boolean(savedAcknowledgements.privacy);
      ackTerms.checked = Boolean(savedAcknowledgements.terms);

      evaluateFinalStep();
      syncPurchaserAccess();
    }

    // Populate state dropdown
    function populateStates() {
      const codes = Object.keys(DATA).sort((a,b) => DATA[a].name.localeCompare(DATA[b].name));
      for (const code of codes) {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = DATA[code].name;
        stateEl.appendChild(opt);
      }
    }

    // Address state select
    function populateUSStates(selectEl) {
      const states = [
        ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],
        ['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],
        ['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],
        ['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],
        ['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],
        ['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],
        ['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']
      ];
      selectEl.innerHTML = '';
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = 'Select';
      selectEl.appendChild(blank);
      for (const [code,name] of states) {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = name;
        selectEl.appendChild(opt);
      }
    }

    async function loadProductData() {
      stateEl.disabled = true;
      try {
        const res = await fetch(DATA_SOURCE);
        if (!res.ok) throw new Error('Unable to load product catalog.');
        const json = await res.json();
        DATA = json || {};
        populateStates();
      } catch (err) {
        console.error(err);
        errorList.innerHTML = '';
        const li = document.createElement('li');
        li.textContent = 'We could not load available products right now. Please refresh and try again.';
        errorList.appendChild(li);
        errorBox.setAttribute('aria-hidden', 'false');
        errorBox.style.display = 'block';
      } finally {
        stateEl.disabled = false;
      }
    }

    // Office combobox
    let officeOptions = [];
    let activeIndex = -1;

    function setOfficeExpanded(expanded) {
      officeInput.setAttribute('aria-expanded', String(expanded));
      officeList.setAttribute('aria-hidden', String(!expanded));
    }

    function getOfficesForState(code) {
      const base = DATA[code]?.offices || [];
      const filtered = (!model.ptype)
        ? base
        : base.filter(o => Array.isArray(o.products?.[model.ptype]) && o.products[model.ptype].length > 0);
      return filtered.map(o => ({ id:o.id, name:o.name }));
    }

    function renderOfficeList(items, query) {
      officeList.innerHTML = '';
      if (!items.length) {
        const div = document.createElement('div');
        div.className = 'opt';
        div.setAttribute('role','option');
        div.id = 'officeOptionEmpty';
        div.setAttribute('aria-selected','false');
        div.setAttribute('aria-disabled','true');
        if (!model.ptype && !query) {
          div.textContent = 'Start typing to search offices.';
        } else if (model.ptype && !query) {
          div.textContent = 'No BLM offices in this state offer that collection type online.';
        } else {
          div.textContent = 'No matches. Try another search.';
        }
        officeList.appendChild(div);
        officeInput.removeAttribute('aria-activedescendant');
        return;
      }
      items.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'opt';
        div.setAttribute('role','option');
        div.id = `officeOption_${idx}`;
        div.dataset.index = String(idx);

        const nameDiv = document.createElement('div');
        nameDiv.textContent = item.name;
        const idSpan = document.createElement('span');
        idSpan.className = 'small';
        idSpan.textContent = item.id;

        div.appendChild(nameDiv);
        div.appendChild(idSpan);
        div.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectOffice(idx);
        });
        officeList.appendChild(div);
      });
    }

    function filterOfficeOptions(q) {
      const query = (q || '').trim().toLowerCase();
      const base = getOfficesForState(model.state);
      if (!query) return base.slice(0, 60);
      return base.filter(o => o.name.toLowerCase().includes(query)).slice(0, 60);
    }

    function highlightOffice(idx) {
      const items = Array.from(officeList.querySelectorAll('.opt'));
      items.forEach((el, i) => {
        const selected = (i === idx);
        el.setAttribute('aria-selected', String(selected));
        if (selected) el.scrollIntoView({ block:'nearest' });
      });
      if (idx >= 0 && items[idx]) {
        officeInput.setAttribute('aria-activedescendant', items[idx].id);
      } else {
        officeInput.removeAttribute('aria-activedescendant');
      }
    }

    function selectOffice(idx) {
      const item = officeOptions[idx];
      if (!item) return;
      officeInput.value = item.name;
      officeIdEl.value = item.id;
      model.officeId = item.id;
      model.officeName = item.name;
      officeInput.removeAttribute('aria-activedescendant');
      validateField(officeInput);
      activeIndex = -1;
      setOfficeExpanded(false);

      // Reset downstream selections
      model.productIndex = null;
      model.product = null;
      qtyEl.value = '';
      totalEl.value = '';
      model.qty = 0;
      qtySection.style.display = 'none';
      resetFollowingSteps(0);
      stepState.open = [true, false, false];
      attemptAdvanceFromStep1();
    }

    // Products
    function getSelectedOffice() {
      const offices = DATA[model.state]?.offices || [];
      return offices.find(o => o.id === model.officeId) || null;
    }

    function getProductsForSelection() {
      const office = getSelectedOffice();
      if (!office || !model.ptype) return [];
      return office.products?.[model.ptype] || [];
    }

    function money(n) {
      return new Intl.NumberFormat(undefined, { style:'currency', currency:'USD' }).format(n);
    }
    function formatDate(isoOrDate) {
      if (!isoOrDate) return '';
      const d = (isoOrDate instanceof Date) ? isoOrDate : new Date(isoOrDate + 'T00:00:00');
      return d.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
    }

    function parseDate(iso) {
      if (!iso) return null;
      const d = new Date(iso + 'T00:00:00');
      return Number.isNaN(d.getTime()) ? null : d;
    }

    function calculatePermitValidity(product) {
      const today = new Date();
      const validForDays = Number.isFinite(product.validForDays) ? Number(product.validForDays) : 30;
      const startCandidate = parseDate(product.harvestStartDate);
      const startDate = (startCandidate && startCandidate > today) ? startCandidate : today;
      const endByDuration = new Date(startDate.getTime());
      endByDuration.setDate(endByDuration.getDate() + validForDays);
      const harvestEnd = parseDate(product.harvestEndDate || product.availableUntil);
      const expirationDate = harvestEnd ? new Date(Math.min(endByDuration.getTime(), harvestEnd.getTime())) : endByDuration;
      const msPerDay = 1000 * 60 * 60 * 24;
      const actualDays = Math.max(1, Math.ceil((expirationDate.getTime() - startDate.getTime()) / msPerDay));
      const shortened = Boolean(harvestEnd && harvestEnd.getTime() < endByDuration.getTime());
      return { validForDays, expirationDate, startDate, actualDays, shortened };
    }

    const DOCS_BY_TYPE = {
      fuelwood: [{ label: 'How to Measure Fuelwood', url: '#' }],
      christmas: [{ label: 'Planning Your Trip', url: '#' }],
      mushrooms: [{ label: 'Foraging Guidelines', url: '#' }]
    };

    function getLocationAttachments() {
      const stateDocs = DATA[model.state]?.attachments || [];
      const officeDocs = getSelectedOffice()?.attachments || [];
      return [...stateDocs, ...officeDocs];
    }

    function buildRequiredDocs(product) {
      const base = [
        { label: 'Map', url: '#' },
        { label: 'Stipulations', url: '#' }
      ];
      const typed = DOCS_BY_TYPE[model.ptype] || [];
      const locationDocs = getLocationAttachments();
      const all = [...(product.requiredDocs || []), ...locationDocs, ...base, ...typed];
      const seen = new Set();
      return all.filter(doc => {
        const key = (doc.label || '').toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function buildDocLinks(docs = []) {
      const docsDiv = document.createElement('div');
      docsDiv.className = 'docs';
      if (!docs.length) return docsDiv;

      const prefix = document.createElement('span');
      prefix.textContent = 'Required documents: ';
      docsDiv.appendChild(prefix);
      docs.forEach((doc, docIdx) => {
        const link = document.createElement('a');
        link.href = doc.url;
        link.textContent = doc.label;
        docsDiv.appendChild(link);
        if (docIdx < docs.length - 1) {
          docsDiv.appendChild(document.createTextNode(' · '));
        }
      });
      return docsDiv;
    }

    function hideLocationNotice() {
      if (!locationNotice) return;
      locationNotice.style.display = 'none';
      locationNotice.innerHTML = '';
    }

    function renderLocationNotice() {
      if (!locationNotice) return;
      const stateData = DATA[model.state];
      const office = getSelectedOffice();
      const attachments = getLocationAttachments();
      const hasStateDesc = Boolean(stateData?.description);
      const hasOfficeDesc = Boolean(office?.description);
      const hasDocs = attachments.length > 0;

      if (!hasStateDesc && !hasOfficeDesc && !hasDocs) {
        hideLocationNotice();
        return;
      }

      locationNotice.innerHTML = '';

      const title = document.createElement('div');
      title.className = 'title';
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = 'i';
      const titleText = document.createElement('span');
      titleText.textContent = 'Local details for your selection';
      title.appendChild(badge);
      title.appendChild(titleText);
      locationNotice.appendChild(title);

      if (hasStateDesc) {
        const detail = document.createElement('div');
        detail.className = 'detail';
        const strong = document.createElement('strong');
        strong.textContent = `${stateData.name}:`;
        detail.appendChild(strong);
        detail.append(' ', stateData.description);
        locationNotice.appendChild(detail);
      }

      if (hasOfficeDesc) {
        const detail = document.createElement('div');
        detail.className = 'detail';
        const strong = document.createElement('strong');
        strong.textContent = `${office.name}:`;
        detail.appendChild(strong);
        detail.append(' ', office.description);
        locationNotice.appendChild(detail);
      }

      if (hasDocs) {
        const wrapper = document.createElement('div');
        wrapper.className = 'detail';
        const strong = document.createElement('strong');
        strong.textContent = 'Attachments for this area:';
        wrapper.appendChild(strong);
        const list = document.createElement('ul');
        attachments.forEach((doc) => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = doc.url;
          a.textContent = doc.label;
          li.appendChild(a);
          list.appendChild(li);
        });
        wrapper.appendChild(list);
        locationNotice.appendChild(wrapper);
      }
      locationNotice.style.display = 'block';
    }

    function renderSummary(el) {
      const stateName = DATA[model.state]?.name || '';
      const ptypeLabel = (PRODUCT_TYPES.find(t => t.id === model.ptype)?.label) || '';
      const prod = model.product;
      const qty = model.qty;
      el.innerHTML = '';
      const entries = [
        ['Selection', `${stateName || '—'} • ${model.officeName || '—'} • ${ptypeLabel || '—'}`],
        ['Product', prod ? prod.name : '—'],
        ['Quantity', qty ? `${qty} ${prod?.unit || ''}${qty === 1 ? '' : 's'}` : '—']
      ];
      entries.forEach(([label, value], idx) => {
        const k = document.createElement('div');
        k.className = 'k';
        if (idx > 0) k.style.marginTop = '8px';
        k.textContent = label;
        const v = document.createElement('div');
        v.className = 'v';
        v.textContent = value;
        el.appendChild(k);
        el.appendChild(v);
      });
    }

    function hideReview() {
      reviewSummary.style.display = 'none';
      reviewNotice.style.display = 'none';
      reviewActions.style.display = 'none';
      handoff.style.display = 'none';
      stepState.completed[2] = false;
      confirmPaygovBtn.disabled = true;
    }

    function renderReviewSummary() {
      const stateName = DATA[model.state]?.name || model.state || '—';
      const fullName = [purchaser.FirstName.value.trim(), purchaser.MiddleName.value.trim(), purchaser.LastName.value.trim()].filter(Boolean).join(' ');
      const addressParts = [
        purchaser.AddressLine1.value.trim(),
        purchaser.AddressLine2.value.trim(),
        [purchaser.City.value.trim(), purchaser.AddrState.value, purchaser.Zip.value.trim()].filter(Boolean).join(' ')
      ].filter(Boolean).join(', ');
      const email = purchaser.Email.value.trim();
      const total = (model.product?.price || 0) * (model.qty || 0);
      const totalLabel = (model.product?.price === 0) ? 'Free' : money(total);
      const qtyLabel = model.qty ? `${model.qty} ${model.product?.unit || 'unit'}${model.qty === 1 ? '' : 's'}` : '—';

      handoff.style.display = 'none';
      reviewSummary.innerHTML = '';
      const custKey = document.createElement('div');
      custKey.className = 'k';
      custKey.textContent = 'Customer';
      const custVal = document.createElement('div');
      custVal.className = 'v';
      [fullName || '—', addressParts || '—', `Email: ${email}`].forEach((line, idx) => {
        const span = document.createElement('div');
        span.style.marginTop = idx === 0 ? '0' : '2px';
        span.textContent = line;
        custVal.appendChild(span);
      });

      const prodKey = document.createElement('div');
      prodKey.className = 'k';
      prodKey.style.marginTop = '10px';
      prodKey.textContent = 'Product';
      const prodVal = document.createElement('div');
      prodVal.className = 'v';
      [
        `${stateName} — ${model.officeName || '—'}`,
        model.product?.name || '—',
        qtyLabel,
        `Estimated total: ${totalLabel}`
      ].forEach((line, idx) => {
        const span = document.createElement('div');
        span.style.marginTop = idx === 0 ? '0' : '2px';
        span.textContent = line;
        prodVal.appendChild(span);
      });

      reviewSummary.appendChild(custKey);
      reviewSummary.appendChild(custVal);
      reviewSummary.appendChild(prodKey);
      reviewSummary.appendChild(prodVal);

      reviewSummary.style.display = 'block';
      reviewNotice.style.display = 'flex';
      reviewActions.style.display = 'flex';
    }

    function renderProducts() {
      const office = getSelectedOffice();
      const products = getProductsForSelection();
      productListEl.innerHTML = '';
      model.productIndex = null;
      model.product = null;
      qtySection.style.display = 'none';
      stepState.completed[1] = false;
      stepState.available[2] = false;

      renderLocationNotice();

      const hasAnyOfficeProducts = (office?.products && Object.values(office.products).some(arr => (arr || []).length > 0));

      if (!products.length) {
        const ptypeLabel = PRODUCT_TYPES.find(t => t.id === model.ptype)?.label || 'this permit type';
        const msg = hasAnyOfficeProducts
          ? `${office?.name || 'This office'} does not offer ${ptypeLabel.toLowerCase()} permits online right now. Try another collection type or office.`
          : `${office?.name || 'This office'} does not have online permits available right now. Please choose another office or check back later.`;
        productListEl.appendChild(buildProductAlert(msg));
        return;
      }

      products.forEach((p, idx) => {
        productListEl.appendChild(createProductCard(p, idx));
      });
    }

    function buildProductAlert(message) {
      const alert = document.createElement('div');
      alert.className = 'alert';
      alert.setAttribute('role', 'status');
      alert.setAttribute('aria-live', 'polite');
      const icon = document.createElement('div');
      icon.className = 'icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = 'i';
      const txt = document.createElement('div');
      txt.className = 'txt';
      const strong = document.createElement('strong');
      strong.textContent = 'Nothing to select';
      const msgNode = document.createElement('div');
      msgNode.textContent = message;
      txt.appendChild(strong);
      txt.appendChild(msgNode);
      alert.appendChild(icon);
      alert.appendChild(txt);
      return alert;
    }

    function createProductCard(p, idx) {
      const id = `prod_${idx}`;
      const priceLine = p.price === 0 ? 'Free' : `${money(p.price)} per ${p.unit}`;
      const saleEnd = p.availableUntil ? `Available until ${formatDate(p.availableUntil)}` : 'Availability varies';
      const { validForDays, expirationDate, actualDays, shortened } = calculatePermitValidity(p);
      const validity = shortened
        ? `Valid for ${actualDays} day${actualDays === 1 ? '' : 's'} (limited by harvest end on ${formatDate(expirationDate)})`
        : `Valid for ${validForDays} days • Permit expires ${formatDate(expirationDate)}`;
      const docs = buildRequiredDocs(p);
      const maxLine = p.maxQty ? `Maximum allowed per permit: ${p.maxQty} ${p.unit}${p.maxQty === 1 ? '' : 's'}` : '';

      const card = document.createElement('label');
      card.className = 'prod';
      card.setAttribute('for', id);
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'product';
      input.id = id;
      input.value = String(idx);
      card.appendChild(input);

      const body = document.createElement('div');
      body.className = 'prod-body';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = p.name;
      const meta1 = document.createElement('div');
      meta1.className = 'meta';
      meta1.textContent = `${model.officeName} · ${priceLine}`;
      const meta2 = document.createElement('div');
      meta2.className = 'meta';
      meta2.textContent = saleEnd;
      const desc = document.createElement('div');
      desc.className = 'desc';
      desc.textContent = p.description || 'Permit details provided at checkout.';

      const panels = document.createElement('div');
      panels.className = 'prod-panels';
      const panel = document.createElement('div');
      panel.className = 'panel';
      const panelTitle = document.createElement('div');
      panelTitle.className = 'panel-title';
      panelTitle.textContent = 'Rules & constraints';
      const rules = document.createElement('ul');
      rules.className = 'rule-list';
      [validity, maxLine || null, 'Bring your permit and ID while collecting.'].filter(Boolean).forEach((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        rules.appendChild(li);
      });

      const docsDiv = buildDocLinks(docs);

      panel.appendChild(panelTitle);
      panel.appendChild(rules);
      panel.appendChild(docsDiv);
      panels.appendChild(panel);

      [name, meta1, meta2, desc, panels].forEach((node) => body.appendChild(node));
      card.appendChild(body);

      card.querySelector('input').addEventListener('change', () => {
        model.productIndex = idx;
        model.product = p;
        qtyHint.textContent = `Enter 1–${p.maxQty} ${p.unit}(s). Price: ${p.price===0?'Free':money(p.price)} per ${p.unit}.`;
        qtyGuard.textContent = maxLine || '';
        qtyEl.min = 1;
        qtyEl.max = p.maxQty || '';
        qtyEl.value = '';
        totalEl.value = '';
        totalCalc.textContent = '';
        qtySection.style.display = 'block';
        model.qty = 0;
        stepState.completed[1] = false;
        stepState.available[2] = false;
        stepState.completed[2] = false;
        resetAcknowledgements();
        hideReview();
        setFieldError(qtyEl, '');
        renderSummary(progressSummary);
        setOpenStep(1);
        qtyEl.focus();
        updateReviewActions();
        persistState();
      });

      return card;
    }

    function announce(message) {
      if (!stepLiveRegion || !message) return;
      stepLiveRegion.textContent = '';
      requestAnimationFrame(() => { stepLiveRegion.textContent = message; });
    }

    function applyLockState() {
      stepSections.forEach((sec, i) => {
        const available = stepState.available[i];
        const lockNote = lockNotes[i];
        if (lockNote) lockNote.style.display = available ? 'none' : 'block';
        const focusables = sec.querySelectorAll('.step-body input, .step-body select, .step-body textarea, .step-body button');
        focusables.forEach(el => {
          if (!available) {
            el.dataset.lockPrevTab = el.getAttribute('tabindex') || '';
            el.dataset.lockPrevDisabled = el.hasAttribute('disabled') ? 'true' : 'false';
            el.setAttribute('tabindex', '-1');
            el.disabled = true;
            el.setAttribute('aria-disabled', 'true');
          } else {
            if (Object.prototype.hasOwnProperty.call(el.dataset, 'lockPrevTab')) {
              if (el.dataset.lockPrevTab) el.setAttribute('tabindex', el.dataset.lockPrevTab); else el.removeAttribute('tabindex');
              delete el.dataset.lockPrevTab;
            } else {
              el.removeAttribute('tabindex');
            }
            const wasDisabled = el.dataset.lockPrevDisabled === 'true';
            if (wasDisabled) {
              el.disabled = true;
            } else {
              el.removeAttribute('disabled');
            }
            el.removeAttribute('aria-disabled');
            delete el.dataset.lockPrevDisabled;
          }
        });
      });
    }

    function updateStepUI(activeIdx = model.step) {
      model.step = activeIdx;
      steps.forEach((el, i) => {
        const isActive = stepState.open[i];
        const isAvailable = stepState.available[i];
        el.classList.toggle('active', isActive);
        el.classList.toggle('done', stepState.completed[i]);
        el.disabled = !isAvailable;
        el.setAttribute('aria-disabled', String(!isAvailable));
        el.setAttribute('aria-pressed', String(isActive));
        el.setAttribute('aria-current', isActive ? 'step' : 'false');
        el.setAttribute('aria-expanded', String(isActive && isAvailable));
        el.setAttribute('aria-controls', stepSections[i]?.id || '');
        const pill = el.querySelector('.step-pill');
        if (pill) {
          pill.textContent = !isAvailable ? 'Locked' : stepState.completed[i] ? 'Complete' : 'Active';
        }
      });

      stepSections.forEach((sec, i) => {
        const open = stepState.open[i] && stepState.available[i];
        sec.classList.toggle('collapsed', !open);
        const body = sec.querySelector('.step-body');
        const toggle = sec.querySelector('.step-toggle');
        if (body) body.style.display = open ? 'block' : 'none';
        if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        const statusEl = stepStatuses[i];
        if (statusEl) {
          const status = !stepState.available[i]
            ? 'Locked'
            : stepState.completed[i]
              ? 'Completed'
              : 'In progress';
          statusEl.textContent = status;
        }
      });
      updateLockNotes();
      applyLockState();
      stepState.available.forEach((available, i) => {
        if (available && !prevAvailability[i]) {
          announce(`Step ${i + 1} unlocked. You can now complete this section.`);
        }
      });
      prevAvailability = [...stepState.available];
    }

    function updateReviewActions() {
      if (!reviewActions) return;
      const show = stepState.available[2];
      reviewActions.style.display = show ? 'flex' : 'none';
      confirmPaygovBtn.disabled = !stepState.completed[2];
    }

    function syncPurchaserAccess() {
      const unlocked = ackPrivacy.checked && ackTerms.checked;
      if (purchaserFieldset) {
        purchaserFieldset.disabled = !unlocked;
        purchaserFieldset.classList.toggle('locked', !unlocked);
      }
      if (purchaserBlockedHint) {
        purchaserBlockedHint.style.display = unlocked ? 'none' : 'block';
      }
      if (!unlocked) {
        Object.values(purchaser).forEach(el => setFieldError(el, ''));
      } else if (purchaserWasLocked) {
        purchaser.FirstName.focus();
      }
      purchaserWasLocked = !unlocked ? true : false;
    }

    function resetAcknowledgements() {
      ackPrivacy.checked = false;
      ackTerms.checked = false;
      ackPrivacy.disabled = false;
      ackTerms.disabled = false;
      ackPrivacy.removeAttribute('aria-disabled');
      ackTerms.removeAttribute('aria-disabled');
      syncPurchaserAccess();
    }

    function getFieldContainer(el) {
      return el?.closest('.row') || el?.parentElement;
    }

    function setFieldError(el, message) {
      if (!el) return;
      const container = getFieldContainer(el);
      if (!container) return;
      let target = container.querySelector('.field-error');
      if (!target) {
        target = document.createElement('div');
        target.className = 'field-error';
        container.appendChild(target);
      }
      if (message) {
        target.textContent = message;
        target.classList.add('active');
        el.setAttribute('aria-invalid', 'true');
      } else {
        target.textContent = '';
        target.classList.remove('active');
        el.removeAttribute('aria-invalid');
      }
    }

    function clearAllFieldErrors() {
      document.querySelectorAll('.field-error').forEach(el => {
        el.textContent = '';
        el.classList.remove('active');
      });
      document.querySelectorAll('[aria-invalid="true"]').forEach(el => el.removeAttribute('aria-invalid'));
    }

    function showErrors(messages) {
      errorList.innerHTML = '';
      for (const m of messages) {
        const li = document.createElement('li');
        li.textContent = m;
        errorList.appendChild(li);
      }
      errorBox.setAttribute('aria-hidden', 'false');
      errorBox.style.display = 'block';
      errorBox.focus();
    }

    function hideErrors() {
      errorBox.setAttribute('aria-hidden', 'true');
      errorBox.style.display = 'none';
      errorList.innerHTML = '';
    }

    function getFieldErrorMessage(el) {
      if (!el || el.disabled) return '';
      const id = el.id;
      const val = (el.value || '').trim();
      if (id === 'ptype' && !val) return 'Select what you are collecting to view available permits.';
      if (id === 'state' && !val) return 'Choose a state to see offices in that area.';
      if (id === 'officeInput') {
        if (!model.state) return 'Select a state to choose a BLM office.';
        if (!model.officeId) return 'Select a BLM office from the list to continue.';
      }
      if (id === 'qty') {
        const p = model.product;
        if (!p) return '';
        if (!val) return 'Enter a quantity to continue.';
        const v = Number(val);
        if (!Number.isFinite(v)) return 'Enter a quantity using numbers only.';
        if (v < 1) return 'Quantity must be at least 1.';
        if (p.maxQty && v > p.maxQty) return `Enter ${p.maxQty} or fewer ${p.unit}(s).`;
      }
      if (id === 'FirstName') {
        if (!val) return 'Enter a first name.';
        if (val.length > LENGTH_LIMITS.FirstName) return `First name must be ${LENGTH_LIMITS.FirstName} characters or fewer.`;
      }
      if (id === 'LastName' && !val) return 'Enter a last name.';
      if (id === 'LastName' && val.length > LENGTH_LIMITS.LastName) return `Last name must be ${LENGTH_LIMITS.LastName} characters or fewer.`;
      if (id === 'MiddleName' && val.length > LENGTH_LIMITS.MiddleName) return `Middle name must be ${LENGTH_LIMITS.MiddleName} characters or fewer.`;
      if (id === 'AddressLine1') {
        if (!val) return 'Enter a street address.';
        if (val.length < 5) return 'Enter a full street address (5 characters or more).';
        if (val.length > LENGTH_LIMITS.AddressLine1) return `Street address line 1 must be ${LENGTH_LIMITS.AddressLine1} characters or fewer.`;
      }
      if (id === 'AddressLine2' && val && val.length > LENGTH_LIMITS.AddressLine2) return `Street address line 2 must be ${LENGTH_LIMITS.AddressLine2} characters or fewer.`;
      if (id === 'City') {
        if (!val) return 'Enter a city.';
        if (val.length < 2) return 'City name must be at least 2 letters.';
        if (val.length > LENGTH_LIMITS.City) return `City name must be ${LENGTH_LIMITS.City} characters or fewer.`;
      }
      if (id === 'AddrState' && !val) return 'Choose a state.';
      if (id === 'Zip') {
        if (!val) return 'Enter a ZIP code.';
        if (!/^\d{5}(-\d{4})?$/.test(val)) return 'Enter a ZIP in 5-digit or ZIP+4 format (##### or #####-####).';
        if (val.length > LENGTH_LIMITS.Zip) return `ZIP must be ${LENGTH_LIMITS.Zip} characters or fewer.`;
      }
      if (id === 'Email') {
        if (!val) return 'Enter an email address.';
        if (!EMAIL_PATTERN.test(val)) return 'Enter an email in the format name@example.com.';
        if (val.length > LENGTH_LIMITS.Email) return `Email must be ${LENGTH_LIMITS.Email} characters or fewer.`;
      }
      if (id === 'Email2') {
        if (!val) return 'Re-enter your email address.';
        if (!EMAIL_PATTERN.test(val)) return 'Enter an email in the format name@example.com.';
        const primary = (purchaser.Email.value || '').trim();
        if (primary && primary.toLowerCase() !== val.toLowerCase()) return 'Repeat email must match the first email.';
        if (val.length > LENGTH_LIMITS.Email2) return `Email must be ${LENGTH_LIMITS.Email2} characters or fewer.`;
      }
      return '';
    }

    function validateField(el) {
      const msg = getFieldErrorMessage(el);
      if (el) setFieldError(el, msg);
      return !msg;
    }

    function validateStep1() {
      const ok = Boolean(model.state) && Boolean(model.officeId) && Boolean(model.ptype);
      stepState.completed[0] = ok;
      return ok;
    }

    function validateQty() {
      const p = model.product;
      if (!p) return false;
      const v = Number(qtyEl.value);
      if (!Number.isFinite(v) || v < 1) return false;
      if (p.maxQty && v > p.maxQty) return false;
      model.qty = v;
      const total = v * (p.price || 0);
      totalEl.value = p.price === 0 ? 'Free' : money(total);
      totalCalc.textContent = `${p.price === 0 ? 'Free permit' : `${money(p.price)} × ${v} ${p.unit}${v === 1 ? '' : 's'} = ${totalEl.value}`}`;
      return true;
    }

    function resetQuantityState() {
      model.qty = 0;
      totalEl.value = '';
      totalCalc.textContent = '';
      stepState.completed[1] = false;
      stepState.available[2] = false;
      stepState.completed[2] = false;
      stepState.open = [stepState.open[0], true, false];
      renderSummary(progressSummary);
      hideReview();
      reviewSummary.style.display = 'none';
      reviewNotice.style.display = 'none';
      updateStepUI(model.step);
      updateReviewActions();
    }

    function commitQuantity({ showErrors = true, focusOnError = false, openNext = false } = {}) {
      const msg = getFieldErrorMessage(qtyEl);
      if (showErrors) {
        setFieldError(qtyEl, msg);
      } else {
        setFieldError(qtyEl, '');
      }

      if (msg) {
        resetQuantityState();
        if (focusOnError) qtyEl.focus();
        persistState();
        return false;
      }

      const ok = validateQty();
      stepState.completed[1] = ok;
      stepState.available[2] = ok;
      renderSummary(progressSummary);
      if (openNext && ok) {
        setOpenStep(2);
      } else {
        updateStepUI(model.step);
      }
      updateReviewActions();
      persistState();
      return ok;
    }

    function validatePurchaser({ touchFields = false } = {}) {
      const msgs = [];
      const required = ['FirstName','LastName','AddressLine1','City','AddrState','Zip','Email','Email2'];
      for (const k of required) {
        const el = purchaser[k];
        const msg = getFieldErrorMessage(el);
        if (msg) msgs.push(msg);
        if (touchFields) setFieldError(el, msg);
      }
      return msgs;
    }

    function setOpenStep(idx) {
      if (!stepState.available[idx]) return;
      stepState.open = stepState.open.map((_, i) => i === idx);
      updateStepUI(idx);
      hideErrors();
      const head = stepSections[idx]?.querySelector('.step-head');
      if (head) head.scrollIntoView({ behavior:'smooth', block:'start' });
    }

    function resetFollowingSteps(startIdx) {
      for (let i = startIdx + 1; i < stepState.available.length; i++) {
        stepState.available[i] = false;
        stepState.completed[i] = false;
        stepState.open[i] = false;
      }
      if (startIdx <= 1) {
        resetAcknowledgements();
      }
      updateStepUI(startIdx);
    }

    function attemptAdvanceFromStep1() {
      const ok = validateStep1();
      stepState.available[1] = ok;
      if (!ok) {
        resetFollowingSteps(0);
        stepState.open = [true, false, false];
        renderSummary(progressSummary);
        hideLocationNotice();
        productListEl.innerHTML = '';
        qtySection.style.display = 'none';
        updateReviewActions();
        persistState();
        return;
      }

      renderSummary(progressSummary);
      renderProducts();
      setOpenStep(1);
      updateStepUI(1);
      updateReviewActions();
      persistState();
    }

    function updateLockNotes() {
      if (lockNotes[1]) {
        const needsType = !model.ptype;
        const needsState = !model.state;
        const needsOffice = !model.officeId;
        if (needsType || needsState || needsOffice) {
          const parts = [];
          if (needsType) parts.push('select what you are collecting');
          if (needsState) parts.push('choose a state');
          if (needsOffice) parts.push('pick a BLM office');
          lockNotes[1].textContent = `Complete step 1 to unlock.`;
        }
      }
      if (lockNotes[2]) {
        if (!model.product) {
          lockNotes[2].textContent = 'Complete step 2 to unlock.';
        } else if (!model.qty) {
          lockNotes[2].textContent = 'Enter a quantity within the allowed range to continue.';
        }
      }
    }

    function evaluateFinalStep({ showErrorsOnFail = false } = {}) {
      const ackOk = ackPrivacy.checked && ackTerms.checked;
      const purchaserErrors = validatePurchaser({ touchFields: showErrorsOnFail });
      const purchaserValid = purchaserErrors.length === 0;

      syncPurchaserAccess();

      if (!ackOk || !purchaserValid) {
        stepState.completed[2] = false;
        reviewSummary.style.display = 'none';
        reviewNotice.style.display = 'none';
        confirmPaygovBtn.disabled = true;
        if (showErrorsOnFail) {
          const errs = [];
          if (!ackOk) {
            if (!ackPrivacy.checked) errs.push('You must acknowledge the Privacy Act notification.');
            if (!ackTerms.checked) errs.push('You must agree to the Terms and Conditions.');
          }
          showErrors(errs.concat(purchaserErrors));
        }
        updateStepUI(model.step);
        updateReviewActions();
        persistState();
        return false;
      }

      hideErrors();
      stepState.completed[2] = true;
      renderSummary(progressSummary);
      renderReviewSummary();
      reviewSummary.style.display = 'block';
      reviewNotice.style.display = 'flex';
      reviewActions.style.display = 'flex';
      confirmPaygovBtn.disabled = false;
      updateStepUI(2);
      updateReviewActions();
      persistState();
      return true;
    }

    // Events
    stateEl.addEventListener('change', () => {
      model.state = stateEl.value;

      officeInput.value = '';
      officeIdEl.value = '';
      model.officeId = '';
      model.officeName = '';

      model.productIndex = null;
      model.product = null;
      qtyEl.value = '';
      totalEl.value = '';
      model.qty = 0;
      qtySection.style.display = 'none';

      stepState.completed[0] = false;
      resetFollowingSteps(0);
      stepState.open = [true, false, false];

      // Prime office dropdown
      officeOptions = filterOfficeOptions('');
      renderOfficeList(officeOptions, '');
      setOfficeExpanded(true);
      activeIndex = -1;

      validateField(stateEl);
      setFieldError(officeInput, '');
      validateStep1();
      hideReview();
      hideLocationNotice();
      renderSummary(progressSummary);
      updateStepUI(0);
      updateReviewActions();
      persistState();
    });

    stateEl.addEventListener('blur', () => validateField(stateEl));

    officeInput.addEventListener('focus', () => {
      if (!model.state) return;
      officeOptions = filterOfficeOptions(officeInput.value);
      renderOfficeList(officeOptions, officeInput.value);
      setOfficeExpanded(true);
      activeIndex = officeOptions.length ? 0 : -1;
      highlightOffice(activeIndex);
    });

    officeInput.addEventListener('input', () => {
      if (!model.state) return;
      const text = officeInput.value.trim();
      const exact = getOfficesForState(model.state).find(o => o.name.toLowerCase() === text.toLowerCase());
      if (exact) {
        officeIdEl.value = exact.id;
        model.officeId = exact.id;
        model.officeName = exact.name;
        setFieldError(officeInput, '');
      } else {
        officeIdEl.value = '';
        model.officeId = '';
        model.officeName = '';
      }

      officeOptions = filterOfficeOptions(officeInput.value);
      renderOfficeList(officeOptions, officeInput.value);
      setOfficeExpanded(true);
      activeIndex = officeOptions.length ? 0 : -1;
      highlightOffice(activeIndex);

      attemptAdvanceFromStep1();
    });

    officeInput.addEventListener('blur', () => {
      setTimeout(() => setOfficeExpanded(false), 120);
      validateField(officeInput);
    });

    officeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        setOfficeExpanded(false);
        officeInput.removeAttribute('aria-activedescendant');
        return;
      }
      if (officeList.getAttribute('aria-hidden') === 'true') setOfficeExpanded(true);
      if (!officeOptions.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, officeOptions.length - 1);
        highlightOffice(activeIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        highlightOffice(activeIndex);
      } else if (e.key === 'Enter') {
        if (officeCombo.getAttribute('aria-expanded') === 'true' && activeIndex >= 0) {
          e.preventDefault();
          selectOffice(activeIndex);
        }
      } else if (e.key === 'Escape') {
        setOfficeExpanded(false);
      }
    });

    document.addEventListener('click', (e) => {
      if (!officeCombo.contains(e.target)) setOfficeExpanded(false);
    });

    ptypeEl.addEventListener('change', () => {
      model.ptype = ptypeEl.value;
      model.productIndex = null;
      model.product = null;
      qtyEl.value = '';
      totalEl.value = '';
      totalCalc.textContent = '';
      qtyGuard.textContent = '';
      model.qty = 0;
      hideReview();
      qtySection.style.display = 'none';
      const offices = getOfficesForState(model.state);
      const officeStillValid = offices.some(o => o.id === model.officeId);
      if (!officeStillValid) {
        officeIdEl.value = '';
        model.officeId = '';
        model.officeName = '';
        officeInput.value = '';
      }
      officeOptions = filterOfficeOptions(officeInput.value);
      renderOfficeList(officeOptions, officeInput.value);
      resetFollowingSteps(0);
      stepState.open = [true, false, false];
      attemptAdvanceFromStep1();
      hideLocationNotice();
      updateReviewActions();
      persistState();
      validateField(ptypeEl);
    });

    ptypeEl.addEventListener('blur', () => validateField(ptypeEl));

    stepToggles.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        if (!stepState.available[idx]) return;
        setOpenStep(idx);
      });
    });

    steps.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        if (!stepState.available[idx]) return;
        setOpenStep(idx);
        stepSections[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    qtyEl.addEventListener('input', () => {
      setFieldError(qtyEl, '');
      const max = Number(qtyEl.max || '');
      const val = Number(qtyEl.value);
      if (Number.isFinite(max) && Number.isFinite(val) && val > max) {
        qtyEl.value = String(max);
      }
      totalCalc.textContent = '';
      const ok = validateQty();
      stepState.completed[1] = ok;
      stepState.available[2] = ok;
      stepState.completed[2] = false;
      renderSummary(progressSummary);
      hideReview();
      updateLockNotes();
      updateStepUI(model.step);
      persistState();
      updateReviewActions();
    });

    qtyEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitQuantity({ focusOnError: true, openNext: true });
      } else if (e.key === 'Tab') {
        const ok = commitQuantity({ focusOnError: true, openNext: true });
        if (!ok) {
          e.preventDefault();
          qtyEl.focus();
        }
      }
    });

    qtyEl.addEventListener('blur', () => {
      const ok = commitQuantity({ focusOnError: true, openNext: true });
      if (!ok) setTimeout(() => qtyEl.focus(), 0);
    });

    function onAckChange() { syncPurchaserAccess(); evaluateFinalStep(); }
    ackPrivacy.addEventListener('change', onAckChange);
    ackTerms.addEventListener('change', onAckChange);

    Object.values(purchaser).forEach((el) => {
      el.addEventListener('input', () => { validateField(el); evaluateFinalStep(); });
      el.addEventListener('blur', () => { validateField(el); evaluateFinalStep(); });
    });

    confirmPaygovBtn.addEventListener('click', () => {
      const ok = evaluateFinalStep({ showErrorsOnFail: true });
      if (!ok) return;
      const transactionReference = (() => {
        let ref = '';
        try {
          ref = sessionStorage.getItem(transactionRefKey) || '';
        } catch (err) {
          ref = '';
        }
        if (!ref) {
          ref = `TX-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
          try { sessionStorage.setItem(transactionRefKey, ref); } catch (err) { /* no-op */ }
        }
        return ref;
      })();
      const payload = {
        idempotencyKey: transactionReference,
        transactionReference,
        state: model.state,
        officeId: model.officeId,
        officeName: model.officeName,
        productType: model.ptype,
        productName: model.product?.name,
        unit: model.product?.unit,
        unitPrice: model.product?.price,
        quantity: model.qty,
        total: (model.product?.price || 0) * (model.qty || 0),
        purchaser: {
          FirstName: purchaser.FirstName.value.trim(),
          MiddleName: purchaser.MiddleName.value.trim(),
          LastName: purchaser.LastName.value.trim(),
          AddressLine1: purchaser.AddressLine1.value.trim(),
          AddressLine2: purchaser.AddressLine2.value.trim(),
          City: purchaser.City.value.trim(),
          State: purchaser.AddrState.value,
          Zip: purchaser.Zip.value.trim(),
          Email: purchaser.Email.value.trim()
        },
        nextStep: "Redirect to Pay.gov (secure payment processing), verify payment status server-side, then return to forestproducts.blm.gov to download the permit with this reference.",
        deliveryPlan: 'After Pay.gov returns, the permit download page uses the transaction reference to fetch verified payment status. Duplicate submissions reuse the same idempotent transaction.',
        serverChecks: { verifyEmailMatch: true, enforcePayloadLimitBytes: MAX_PAYLOAD_BYTES }
      };

      const payloadSize = new TextEncoder().encode(JSON.stringify(payload)).length;
      if (payloadSize > MAX_PAYLOAD_BYTES) {
        showErrors([`Form data is too large (${payloadSize} bytes). Shorten text entries and try again.`]);
        return;
      }

      handoff.style.display = 'block';
      handoff.className = 'summary';
      handoff.innerHTML = '';
      const payloadKey = document.createElement('div');
      payloadKey.className = 'k';
      payloadKey.textContent = 'Demo handoff payload';
      const payloadVal = document.createElement('div');
      payloadVal.className = 'v';
      payloadVal.style.marginTop = '6px';
      payloadVal.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
      payloadVal.style.fontSize = '13px';
      payloadVal.style.whiteSpace = 'pre-wrap';
      payloadVal.textContent = JSON.stringify(payload, null, 2);
      const note = document.createElement('div');
      note.className = 'k';
      note.style.marginTop = '10px';
      note.textContent = 'In production, the site would create a Sale ID and redirect the user to Pay.gov with that transaction context.';

      handoff.appendChild(payloadKey);
      handoff.appendChild(payloadVal);
      handoff.appendChild(note);
      handoff.scrollIntoView({ behavior:'smooth', block:'start' });
    });

    document.querySelectorAll('[data-open-detail]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = document.querySelector(btn.dataset.openDetail);
        if (target && target.tagName === 'DETAILS') {
          target.open = true;
          target.querySelector('summary')?.focus();
        }
      });
    });

    resetAllBtn.addEventListener('click', () => {
      stateEl.value = '';
      model.state = '';
      officeInput.value = '';
      officeIdEl.value = '';
      model.officeId = '';
      model.officeName = '';
      ptypeEl.value = '';
      model.ptype = '';
      model.productIndex = null;
      model.product = null;
      qtyEl.value = '';
      totalEl.value = '';
      totalCalc.textContent = '';
      qtyGuard.textContent = '';
      model.qty = 0;
      qtySection.style.display = 'none';
      setOfficeExpanded(false);
      productListEl.innerHTML = '';
      stepState.available = [true, false, false];
      stepState.completed = [false, false, false];
      stepState.open = [true, false, false];
      resetAcknowledgements();
      hideReview();
      hideErrors();
      hideLocationNotice();
      clearAllFieldErrors();
      renderSummary(progressSummary);
      updateStepUI(0);
      updateReviewActions();
      clearPersistedState();
    });

    async function boot() {
      await loadProductData();
      populateUSStates(purchaser.AddrState);
      renderSummary(progressSummary);
      restoreState();
      syncPurchaserAccess();
      updateReviewActions();
      updateLockNotes();
      updateStepUI(0);
    }

    boot();
