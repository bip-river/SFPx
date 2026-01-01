(function () {
  'use strict';

    let DATA = {};
    let dataReady = false;
    const STORAGE_KEY = 'sfp-demo-state';
    const DATA_SOURCE = 'products.json';

    const PRODUCT_TYPES = [
      { id: 'fuelwood', label: 'Fuelwood', image: 'firewood.png' },
      { id: 'christmas', label: 'Christmas tree', image: 'xmas.png' },
      { id: 'mushrooms', label: 'Mushrooms', image: 'mushrooms.png' }
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
      DeliveryEmail: 120,
      ConfirmEmail: 120,
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
    const stateRow = document.getElementById('stateRow');
    const officeInput = document.getElementById('officeInput');
    const officeIdEl = document.getElementById('officeId');
    const officeRow = document.getElementById('officeRow');
    const officeCombo = document.getElementById('officeCombo');
    const officeList = document.getElementById('officeList');
    const ptypeGroup = document.getElementById('ptypeGroup');
    const ptypeOptions = document.getElementById('ptypeOptions');
    let ptypeRadios = [];

    const productListEl = document.getElementById('productList');
    const qtyEl = document.getElementById('qty');
    const qtyHint = document.getElementById('qtyHint');
    const qtyGuard = document.getElementById('qtyGuard');
    const totalEl = document.getElementById('total');
    const totalAmount = document.getElementById('totalAmount');
    const totalCalc = document.getElementById('totalCalc');

    const qtySection = document.getElementById('qtySection');

    const ackPrivacy = document.getElementById('ackPrivacy');
    const ackTerms = document.getElementById('ackTerms');

    const eligibilityAgreement = document.getElementById('eligibilityAgreement');
    const ackEligibility = document.getElementById('ackEligibility');
    const eligibilityLabel = document.getElementById('eligibilityLabel');
    const eligibilityBody = document.getElementById('eligibilityBody');

    const nextStepsList = document.getElementById('nextStepsList');
    const confirmation = document.getElementById('confirmation');
    const permitRefEl = document.getElementById('permitRef');
    const permitDownloadBtn = document.getElementById('permitDownloadBtn');

    const errorBox = document.getElementById('errorBox');
    const errorList = document.getElementById('errorList');

    const progressTitle = document.getElementById('progressTitle');
    const progressSub = document.getElementById('progressSub');
    const progressBar = document.getElementById('progressBar');
    const progressSteps = Array.from(document.querySelectorAll('[data-progress-step]'));
    const progressItems = progressSteps;
    const progressEditButtons = Array.from(document.querySelectorAll('[data-edit-step]'));
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

    const locationNotice = document.getElementById('locationNotice');
    const reviewSummary = document.getElementById('reviewSummary');
    const reviewNotice = document.getElementById('reviewNotice');
    const reviewActions = document.getElementById('reviewActions');
    const confirmPaygovBtn = document.getElementById('confirmPaygov');
    const handoff = document.getElementById('handoff');
    const postStep3 = document.getElementById('postStep3');
    const permitHolderFieldset = document.getElementById('permitHolderFieldset');
    const permitHolderBlockedHint = document.getElementById('permitHolderBlockedHint');
    const stepLiveRegion = document.getElementById('stepLiveRegion');
    const lockNotes = [null, document.getElementById('step2LockNote'), document.getElementById('step3LockNote')];

    const transactionRefKey = 'sfp-demo-transaction-ref';

    const resetAllBtn = document.getElementById('resetAll');

    let permitHolderWasLocked = true;

    let permitDownloadUrl = '';

    let lastAnnouncedStep = null;

    // Permit holder fields
    const permitHolder = {
      FirstName: document.getElementById('FirstName'),
      MiddleName: document.getElementById('MiddleName'),
      LastName: document.getElementById('LastName'),
      AddressLine1: document.getElementById('AddressLine1'),
      AddressLine2: document.getElementById('AddressLine2'),
      City: document.getElementById('City'),
      AddrState: document.getElementById('AddrState'),
      Zip: document.getElementById('Zip'),
      DeliveryEmail: document.getElementById('DeliveryEmail'),
      ConfirmEmail: document.getElementById('ConfirmEmail'),
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

    function hasSelectionForReview() {
      return Boolean(model.product && model.qty);
    }

    function setControlEnabled(el, enabled) {
      if (!el) return;
      if (enabled) {
        delete el.dataset.persistDisabled;
        if (Object.prototype.hasOwnProperty.call(el.dataset, 'persistPrevTab')) {
          const prev = el.dataset.persistPrevTab;
          if (prev) el.setAttribute('tabindex', prev); else el.removeAttribute('tabindex');
          delete el.dataset.persistPrevTab;
        } else if (el.tabIndex === -1) {
          el.removeAttribute('tabindex');
        }
        el.disabled = false;
        el.removeAttribute('aria-disabled');
      } else {
        el.dataset.persistDisabled = 'true';
        if (!Object.prototype.hasOwnProperty.call(el.dataset, 'persistPrevTab')) {
          el.dataset.persistPrevTab = el.getAttribute('tabindex') || '';
        }
        el.disabled = true;
        el.setAttribute('aria-disabled', 'true');
        el.setAttribute('tabindex', '-1');
      }
    }

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
          terms: ackTerms.checked,
          eligibility: ackEligibility ? ackEligibility.checked : false
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
        setProductType(savedModel.ptype);
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

      syncSelectionAvailability();
      attemptAdvanceFromStep1();

      const products = getProductsForSelection();
      if (products.length && Number.isInteger(savedModel.productIndex) && products[savedModel.productIndex]) {
        const p = products[savedModel.productIndex];
        model.productIndex = savedModel.productIndex;
        model.product = p;
        const radio = document.getElementById(`prod_${savedModel.productIndex}`);
        if (radio) {
          radio.checked = true;
          updateProductCardSelection();
        }
        qtyHint.textContent = `Enter 1–${p.maxQty} ${p.unit}(s). Price: ${feeLabelForUnit(p.price, p.unit)}.`;
        qtyEl.min = 1;
        qtyEl.max = p.maxQty || '';
        setControlEnabled(qtyEl, true);
        qtySection.style.display = 'block';
        if (savedModel.qty) {
          qtyEl.value = savedModel.qty;
        }
        commitQuantity({ showErrors: false });
      }

      ackPrivacy.checked = Boolean(savedAcknowledgements.privacy);
      ackTerms.checked = Boolean(savedAcknowledgements.terms);
      if (ackEligibility) ackEligibility.checked = Boolean(savedAcknowledgements.eligibility);

      renderEligibilityAgreement();

      evaluateFinalStep();
      syncPermitHolderAccess();
    }

    function renderProductTypes() {
      if (!ptypeOptions) return;
      ptypeOptions.innerHTML = '';
      PRODUCT_TYPES.forEach((type) => {
        const label = document.createElement('label');
        label.className = 'ptype-card';

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'ptype';
        input.value = type.id;
        label.appendChild(input);

        const body = document.createElement('div');
        body.className = 'ptype-card-body';

        const img = document.createElement('img');
        img.src = `images/${type.image}`;
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        const name = document.createElement('div');
        name.className = 'ptype-card-name';
        name.textContent = type.label;

        body.appendChild(img);
        body.appendChild(name);
        label.appendChild(body);

        ptypeOptions.appendChild(label);
      });

      ptypeRadios = Array.from(ptypeOptions.querySelectorAll('input[name="ptype"]'));
      ptypeRadios.forEach((radio) => {
        radio.addEventListener('change', () => handleProductTypeChange(radio.value));
      });
    }

    function setProductType(value) {
      const hasMatch = ptypeRadios.some(r => r.value === value);
      model.ptype = hasMatch ? (value || '') : '';
      ptypeRadios.forEach(r => { r.checked = r.value === value; });
    }

    function validateProductType({ showErrors = true } = {}) {
      const hasType = Boolean(model.ptype);
      const msg = hasType ? '' : 'Select what you are collecting to view available permits.';
      if (showErrors) setFieldError(ptypeGroup, msg);
      return hasType;
    }

    function resetOfficeSelection() {
      officeInput.value = '';
      officeIdEl.value = '';
      model.officeId = '';
      model.officeName = '';
      officeOptions = [];
      renderOfficeList([], '');
      setOfficeExpanded(false);
      setFieldError(officeInput, '');
    }

    function resetStateSelection() {
      stateEl.value = '';
      model.state = '';
      resetOfficeSelection();
    }

    function resetProductSelection() {
      model.productIndex = null;
      model.product = null;
      qtyEl.value = '';
      totalEl.value = '';
      if (totalAmount) totalAmount.textContent = '—';
      totalCalc.textContent = '';
      qtyGuard.textContent = '';
      model.qty = 0;
      setControlEnabled(qtyEl, false);
      qtySection.style.display = 'none';
      productListEl.innerHTML = '';
    }

    function syncSelectionAvailability() {
      const hasType = Boolean(model.ptype);
      const hasState = hasType && Boolean(model.state);
      const canUseData = dataReady && Object.keys(DATA || {}).length > 0;
    
      if (!hasType) resetStateSelection();
      if (!hasState) resetOfficeSelection();
    
      if (stateRow) stateRow.classList.toggle('hidden', !hasType);
      if (officeRow) officeRow.classList.toggle('hidden', !hasState);
    
      // Only enable controls once the catalog is available.
      setControlEnabled(stateEl, canUseData && hasType);
      setControlEnabled(officeInput, canUseData && hasState);
    }


    // Populate state dropdown
    function populateStates() {
      // Keep the first placeholder option, remove any prior dynamic options.
      while (stateEl.options.length > 1) stateEl.remove(1);
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
      setControlEnabled(stateEl, false);
      setControlEnabled(officeInput, false);
    
      try {
        const res = await fetch(DATA_SOURCE);
        if (!res.ok) throw new Error('Unable to load product catalog.');
        const json = await res.json();
    
        DATA = json || {};
        dataReady = true;
        populateStates();
        hideErrors();
      } catch (err) {
        console.error(err);
        dataReady = false;
    
        // Uses the shared error summary so it is focusable and consistent.
        showErrors(['We could not load available products right now. Please refresh and try again.']);
      } finally {
        syncSelectionAvailability();
      }
    }


    // Office combobox
    let officeOptions = [];
    let activeIndex = -1;

    function setOfficeExpanded(expanded) {
      officeInput.setAttribute('aria-expanded', String(expanded));
      officeList.setAttribute('aria-hidden', String(!expanded));
      if (!expanded) {
        officeInput.removeAttribute('aria-activedescendant');
      }
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
          div.textContent = 'No BWL offices in this state offer that collection type online.';
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
        // Use click (not mousedown) so the selection works even if the input
        // itself is disabled or blocked from taking focus.
        div.addEventListener('click', (e) => {
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
      resetProductSelection();
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
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
    }
    function feeLabelForUnit(unitPrice, unit) {
      return unitPrice === 0 ? 'No fee' : `${money(unitPrice)} per ${unit}`;
    }

    function totalLabelFor(unitPrice, total) {
      return unitPrice === 0 ? 'No fee' : money(total);
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

    function getValidityLabels(product) {
      if (!product) {
        return {
          durationLabel: 'Valid for —',
          expirationLabel: 'Permit expires —',
          availableLabel: 'Available until —'
        };
      }

      const { validForDays, expirationDate, actualDays, shortened } = calculatePermitValidity(product);
      const durationDays = shortened ? actualDays : validForDays;
      const durationLabel = `Valid for ${durationDays} day${durationDays === 1 ? '' : 's'}`;
      const expirationLabel = `Permit expires ${formatDate(expirationDate)}`;
      const availableLabel = product.availableUntil
        ? `Available until ${formatDate(product.availableUntil)}`
        : 'Availability varies';

      return { durationLabel, expirationLabel, availableLabel };
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
      // De-dupe by a stable key. Label-only de-duping can drop distinct docs that share a name.
      const seen = new Set();
      return all.filter((doc) => {
        const label = (doc.label || '').trim().toLowerCase();
        const url = (doc.url || '').trim();
        const key = `${label}|${url}`;
        if (!label) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function buildDocLinks(docs = [], { includePrefix = true } = {}) {
      if (!includePrefix) {
        const docsDiv = document.createElement('div');
        docsDiv.className = 'docs';
        return docsDiv;
      }

      const details = document.createElement('details');
      details.className = 'docs';
      const summary = document.createElement('summary');
      summary.className = 'docs-action';
      summary.setAttribute('aria-label', 'Maps and permit rules');
      const summaryTitle = document.createElement('span');
      summaryTitle.className = 'docs-title';
      summaryTitle.textContent = 'Maps & permit rules';
      const summaryMeta = document.createElement('span');
      summaryMeta.className = 'docs-meta';
      summaryMeta.textContent = `${docs.length} item${docs.length === 1 ? '' : 's'}`;
      const summaryText = document.createElement('span');
      summaryText.className = 'docs-text';
      summaryText.appendChild(summaryTitle);
      summaryText.appendChild(summaryMeta);
      const chevron = document.createElement('span');
      chevron.className = 'docs-chev';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = '▾';
      summary.appendChild(summaryText);
      summary.appendChild(chevron);
      details.appendChild(summary);

      const docsWrap = document.createElement('div');
      docsWrap.className = 'doc-links';

      if (!docs.length) {
        const empty = document.createElement('div');
        empty.className = 'doc-empty';
        empty.textContent = 'No additional documents for this permit.';
        docsWrap.appendChild(empty);
      } else {
        docs.forEach((doc) => {
          const link = document.createElement('a');
          link.href = doc.url;
          link.textContent = doc.label;
          link.addEventListener('click', (event) => event.stopPropagation());
          docsWrap.appendChild(link);
        });
      }

      details.appendChild(docsWrap);
      return details;
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

    function hideReview() {
      if (postStep3) postStep3.style.display = 'none';
      clearConfirmation();
      reviewSummary.style.display = 'none';
      reviewNotice.style.display = 'none';
      reviewActions.style.display = 'none';
      handoff.style.display = 'none';
      stepState.completed[2] = false;
      confirmPaygovBtn.disabled = true;
    }

    function renderReviewSummary() {
      if (!hasSelectionForReview()) {
        reviewSummary.style.display = 'none';
        return;
      }
      const stateName = DATA[model.state]?.name || model.state || '—';
      const fullName = [permitHolder.FirstName.value.trim(), permitHolder.MiddleName.value.trim(), permitHolder.LastName.value.trim()].filter(Boolean).join(' ');
      const addressParts = [
        permitHolder.AddressLine1.value.trim(),
        permitHolder.AddressLine2.value.trim(),
        [permitHolder.City.value.trim(), permitHolder.AddrState.value, permitHolder.Zip.value.trim()].filter(Boolean).join(' ')
      ].filter(Boolean).join(', ');
      const deliveryEmail = permitHolder.DeliveryEmail.value.trim();
      const total = (model.product?.price || 0) * (model.qty || 0);
      const totalLabel = totalLabelFor(model.product?.price || 0, total);
      const qtyLabel = model.qty ? `${model.qty} ${model.product?.unit || 'unit'}${model.qty === 1 ? '' : 's'}` : '—';
      const { durationLabel, expirationLabel } = getValidityLabels(model.product);

      handoff.style.display = 'none';
      reviewSummary.innerHTML = '';
      const custKey = document.createElement('div');
      custKey.className = 'k';
      custKey.textContent = 'Permit holder';
      const custVal = document.createElement('div');
      custVal.className = 'v';
      [fullName || '—', addressParts || '—', `Delivery email: ${deliveryEmail}`].forEach((line, idx) => {
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
        durationLabel,
        expirationLabel,
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
    }

    function updateReviewPanels() {
      const hasSelection = hasSelectionForReview();
      if (postStep3) postStep3.style.display = hasSelection ? 'block' : 'none';
      if (!hasSelection) {
        reviewSummary.style.display = 'none';
        reviewNotice.style.display = 'none';
        reviewActions.style.display = 'none';
        handoff.style.display = 'none';
        confirmPaygovBtn.disabled = true;
        clearConfirmation();
        return;
      }

      renderReviewSummary();
      configureCheckoutCopy();
      reviewActions.style.display = 'flex';
      const ready = stepState.completed[2];
      confirmPaygovBtn.disabled = !ready;
      reviewNotice.style.display = ready ? 'flex' : 'none';
    }

    function renderProducts() {
      const office = getSelectedOffice();
      const products = getProductsForSelection();
      productListEl.innerHTML = '';
      model.productIndex = null;
      model.product = null;
      qtySection.style.display = 'none';
      setControlEnabled(qtyEl, false);
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
      updateProductCardSelection();
    }

    // Provide a cross-browser fallback for "selected" styles.
    // Some browsers may not support :has(), so we apply a class on the label.
    function updateProductCardSelection() {
      const cards = Array.from(productListEl.querySelectorAll('.prod'));
      cards.forEach((card) => {
        const input = card.querySelector('input[type="radio"]');
        const selected = Boolean(input && input.checked);
        card.classList.toggle('is-selected', selected);
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
      const priceLine = feeLabelForUnit(p.price, p.unit);
      const { durationLabel, expirationLabel, availableLabel } = getValidityLabels(p);
      const docs = buildRequiredDocs(p);
      const officeName = getSelectedOffice()?.name || '—';

      const card = document.createElement('label');
      card.className = 'prod';
      card.setAttribute('for', id);
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'product';
      input.id = id;
      input.value = String(idx);
      input.className = 'prod-radio';

      const body = document.createElement('div');
      body.className = 'prod-body';
      const header = document.createElement('div');
      header.className = 'prod-header';
      const headerLeft = document.createElement('div');
      headerLeft.className = 'prod-header-left';
      headerLeft.appendChild(input);
      const info = document.createElement('div');
      info.className = 'prod-info';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = p.name;
      const area = document.createElement('div');
      area.className = 'area';
      area.textContent = `District: ${officeName}`;
      info.appendChild(name);
      info.appendChild(area);
      headerLeft.appendChild(info);
      const price = document.createElement('div');
      price.className = 'price';
      price.textContent = priceLine;
      header.appendChild(headerLeft);
      header.appendChild(price);

      const stats = document.createElement('ul');
      stats.className = 'stats';
      stats.setAttribute('aria-label', 'Permit details');
      [durationLabel, expirationLabel].forEach((label) => {
        const item = document.createElement('li');
        item.textContent = label;
        stats.appendChild(item);
      });

      const available = document.createElement('div');
      available.className = 'meta';
      available.textContent = availableLabel;

      const docsDiv = buildDocLinks(docs);

      [header, stats, available, docsDiv].forEach((node) => body.appendChild(node));
      card.appendChild(body);

      card.querySelector('input').addEventListener('change', () => {
        updateProductCardSelection();
        model.productIndex = idx;
        model.product = p;
        qtyHint.textContent = `Enter 1–${p.maxQty} ${p.unit}(s). Price: ${feeLabelForUnit(p.price, p.unit)}.`;
        const maxLine = p.maxQty ? `Maximum allowed per permit: ${p.maxQty} ${p.unit}${p.maxQty === 1 ? '' : 's'}` : '';
        qtyGuard.textContent = maxLine || '';
        qtyEl.min = 1;
        qtyEl.max = p.maxQty || '';
        qtyEl.value = '';
        totalEl.value = '';
        if (totalAmount) totalAmount.textContent = '—';
        totalCalc.textContent = '';
        setControlEnabled(qtyEl, true);
        qtySection.style.display = 'block';
        model.qty = 0;
        stepState.completed[1] = false;
        stepState.available[2] = false;
        stepState.completed[2] = false;
        resetAcknowledgements();
        renderEligibilityAgreement();
        clearConfirmation();
        hideReview();
        setFieldError(qtyEl, '');
        
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

    const prefersReducedMotion = (() => {
      try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
      catch (err) { return false; }
    })();
    
    function isElementInView(el, margin = 12) {
      if (!el) return true;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      return rect.top >= margin && rect.bottom <= (vh - margin);
    }
    
    function scrollIntoViewSafe(el, { force = false } = {}) {
      if (!el) return;
      if (!force && isElementInView(el)) return; // prevents rapid “jump” scrolling
      el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    }

    function applyLockState() {
      stepSections.forEach((sec, i) => {
        const available = stepState.available[i];
        const lockNote = lockNotes[i];
        if (lockNote) lockNote.style.display = available ? 'none' : 'block';
        const focusables = sec.querySelectorAll('.step-body input, .step-body select, .step-body textarea, .step-body button');
        focusables.forEach(el => {
          const persistDisabled = el.dataset.persistDisabled === 'true';
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
            if (persistDisabled) {
              el.disabled = true;
              el.setAttribute('aria-disabled', 'true');
              if (!Object.prototype.hasOwnProperty.call(el.dataset, 'persistPrevTab')) {
                el.dataset.persistPrevTab = el.getAttribute('tabindex') || '';
              }
              el.setAttribute('tabindex', '-1');
            } else {
              el.removeAttribute('aria-disabled');
              if (Object.prototype.hasOwnProperty.call(el.dataset, 'persistPrevTab')) {
                const prev = el.dataset.persistPrevTab;
                if (prev) el.setAttribute('tabindex', prev); else el.removeAttribute('tabindex');
                delete el.dataset.persistPrevTab;
              }
            }
            delete el.dataset.lockPrevDisabled;
          }
        });
      });
    }

    function updateStepUI(activeIdx = model.step) {
      model.step = activeIdx;
      stepState.open = stepState.open.map((open, i) => (stepState.available[i] ? open : false));
      const activeStepIndex = stepState.open.findIndex(Boolean);

      stepSections.forEach((sec, i) => {
        const open = stepState.open[i] && stepState.available[i];
        sec.classList.toggle('collapsed', !open);
        const body = sec.querySelector('.step-body');
        const toggle = sec.querySelector('.step-toggle');
        if (body) body.setAttribute('aria-hidden', open ? 'false' : 'true');
        if (toggle) {
          toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
          toggle.disabled = !stepState.available[i];
          toggle.setAttribute('aria-disabled', String(!stepState.available[i]));
        }
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
      updateProgressHeader(activeStepIndex);
      stepState.available.forEach((available, i) => {
        if (available && !prevAvailability[i]) {
          announce(`Step ${i + 1} unlocked. You can now complete this section.`);
      
          const item = progressItems[i];
          if (item) {
            item.classList.add('just-unlocked');
            window.setTimeout(() => item.classList.remove('just-unlocked'), 1200);
          }
        }
      });
      prevAvailability = [...stepState.available];

      if (activeStepIndex !== -1 && activeStepIndex !== lastAnnouncedStep) {
        announce(`Now viewing Step ${activeStepIndex + 1}. ${stepSections[activeStepIndex]?.getAttribute('aria-label') || ''}`.trim());
        lastAnnouncedStep = activeStepIndex;
      }
    }

    function updateProgressHeader(activeStepIndex = stepState.open.findIndex(Boolean)) {
      const totalSteps = stepSections.length;
      const activeIdx = activeStepIndex === -1 ? model.step : activeStepIndex;
      const titles = [
        'Step 1 · Choose what and where',
        'Step 2 · Select a permit',
        'Step 3 · Agreements and permit holder info'
      ];

      if (progressTitle) progressTitle.textContent = titles[activeIdx] || titles[0];

      const status = !stepState.available[activeIdx]
        ? 'Locked'
        : stepState.completed[activeIdx]
          ? 'Completed'
          : 'In progress';
      if (progressSub) progressSub.textContent = status;

      const progressPercent = totalSteps > 1 ? (activeIdx / (totalSteps - 1)) * 100 : 0;
      if (progressBar) progressBar.style.width = `${progressPercent}%`;

      progressSteps.forEach((step, idx) => {
        step.classList.toggle('is-active', idx === activeIdx);
        step.classList.toggle('is-complete', stepState.completed[idx]);
        if (idx === activeIdx) {
          step.setAttribute('aria-current', 'step');
        } else {
          step.removeAttribute('aria-current');
        }
      });

    }

    function updateReviewActions() {
      updateReviewPanels();
    }

    function productRequiresEligibility(product) {
      return Boolean(product?.eligibility?.requiresCertification);
    }

    function ackRequirementsMet() {
      const base = ackPrivacy.checked && ackTerms.checked;
      if (productRequiresEligibility(model.product)) {
        return base && Boolean(ackEligibility && ackEligibility.checked);
      }
      return base;
    }

    function clearConfirmation() {
      if (confirmation) confirmation.style.display = 'none';
      if (permitRefEl) permitRefEl.textContent = '—';
      if (permitDownloadUrl) {
        try { URL.revokeObjectURL(permitDownloadUrl); } catch (err) { /* no-op */ }
        permitDownloadUrl = '';
      }
    }

    function renderEligibilityAgreement() {
      if (!eligibilityAgreement || !ackEligibility || !eligibilityLabel || !eligibilityBody) return;

      const required = productRequiresEligibility(model.product);
      if (!required) {
        eligibilityAgreement.style.display = 'none';
        eligibilityBody.innerHTML = '';
        eligibilityLabel.textContent = 'I certify that I meet the eligibility requirements for this permit.';
        ackEligibility.checked = false;
        return;
      }

      const elig = model.product?.eligibility || {};
      eligibilityAgreement.style.display = 'block';
      eligibilityLabel.textContent = elig.label || 'I certify that I meet the eligibility requirements for this permit.';

      eligibilityBody.innerHTML = '';
      if (elig.intro) {
        const p = document.createElement('div');
        p.textContent = elig.intro;
        eligibilityBody.appendChild(p);
      }

      if (Array.isArray(elig.bullets) && elig.bullets.length) {
        const ul = document.createElement('ul');
        elig.bullets.forEach((b) => {
          const li = document.createElement('li');
          li.textContent = b;
          ul.appendChild(li);
        });
        eligibilityBody.appendChild(ul);
      }

      if (Array.isArray(elig.citations) && elig.citations.length) {
        const citeWrap = document.createElement('div');
        citeWrap.style.marginTop = '8px';
        const title = document.createElement('div');
        title.style.fontWeight = '600';
        title.textContent = 'Read the legal text';
        citeWrap.appendChild(title);

        const list = document.createElement('ul');
        elig.citations.forEach((c) => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = c.url || '#';
          a.textContent = c.label || 'Legal reference';
          a.target = '_blank';
          a.rel = 'noopener';
          li.appendChild(a);
          list.appendChild(li);
        });
        citeWrap.appendChild(list);
        eligibilityBody.appendChild(citeWrap);
      }
    }

    function configureCheckoutCopy() {
      if (!model.product || !model.qty) return;
      const unitPrice = model.product?.price || 0;
      const total = unitPrice * (model.qty || 0);
      const noFee = unitPrice === 0 && total === 0;

      if (confirmPaygovBtn) confirmPaygovBtn.textContent = noFee ? 'Confirm and get permit' : 'Continue to Pay.gov';

      if (nextStepsList) {
        nextStepsList.innerHTML = '';
        const items = noFee
          ? [
              'No payment is required.',
              'After you confirm, you will be able to download and save your permit.',
              'Keep your confirmation email for your records.'
            ]
          : [
              'You will be redirected to Pay.gov to complete payment.',
              'After payment, you will return here to download and save your permit.',
              'Keep your confirmation email for your records.'
            ];
        items.forEach((t) => {
          const li = document.createElement('li');
          li.textContent = t;
          nextStepsList.appendChild(li);
        });
      }
    }

    function buildDemoPermitPdf(lines) {
      const safe = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      const content = (() => {
        const out = [];
        out.push('BT');
        out.push('/F1 12 Tf');
        out.push('14 TL');
        out.push('72 740 Td');
        (lines || []).forEach((line, i) => {
          out.push(`(${safe(line)}) Tj`);
          if (i < (lines.length - 1)) out.push('T*');
        });
        out.push('ET');
        return out.join('\n') + '\n';
      })();

      const encoder = new TextEncoder();
      const contentBytes = encoder.encode(content);

      const objects = [];
      objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
      objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
      objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n');
      objects.push(`4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n${content}endstream\nendobj\n`);
      objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

      const header = '%PDF-1.4\n';
      const headerBytes = encoder.encode(header).length;

      const offsets = [0];
      let cursor = headerBytes;

      for (const obj of objects) {
        offsets.push(cursor);
        cursor += encoder.encode(obj).length;
      }

      const xrefOffset = cursor;
      const xrefLines = [];
      xrefLines.push('xref\n');
      xrefLines.push(`0 ${offsets.length}\n`);
      xrefLines.push('0000000000 65535 f \n');
      for (let i = 1; i < offsets.length; i++) {
        const off = String(offsets[i]).padStart(10, '0');
        xrefLines.push(`${off} 00000 n \n`);
      }
      const trailer =
        `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

      const xref = xrefLines.join('');
      const full = header + objects.join('') + xref + trailer;
      return new Blob([full], { type: 'application/pdf' });
    }

    function syncPermitHolderAccess() {
      const unlocked = ackRequirementsMet();
      if (permitHolderFieldset) {
        permitHolderFieldset.disabled = !unlocked;
        permitHolderFieldset.classList.toggle('locked', !unlocked);
        permitHolderFieldset.style.display = unlocked ? 'block' : 'none';
      }
      if (permitHolderBlockedHint) {
        permitHolderBlockedHint.style.display = unlocked ? 'none' : 'block';
      }
      if (!unlocked) {
        Object.values(permitHolder).forEach(el => setFieldError(el, ''));
      }
      permitHolderWasLocked = !unlocked ? true : false;
    }

    function resetAcknowledgements() {
      ackPrivacy.checked = false;
      ackTerms.checked = false;
      if (ackEligibility) ackEligibility.checked = false;
      ackPrivacy.disabled = false;
      ackTerms.disabled = false;
      ackPrivacy.removeAttribute('aria-disabled');
      ackTerms.removeAttribute('aria-disabled');
      syncPermitHolderAccess();
      renderEligibilityAgreement();
    }

    function getFieldContainer(el) {
      return el?.closest('.row') || el?.closest('.agreement-item') || el?.parentElement;
    }

    function updateAriaDescribedBy(el, id, add) {
      if (!el || !id) return;
      const current = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      const has = current.includes(id);
      if (add && !has) current.push(id);
      if (!add && has) current.splice(current.indexOf(id), 1);
      if (current.length) {
        el.setAttribute('aria-describedby', current.join(' '));
      } else {
        el.removeAttribute('aria-describedby');
      }
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
      if (!target.id) {
        const baseId = el.id || el.name || 'field';
        target.id = `${baseId}-error`;
      }
      if (message) {
        target.textContent = message;
        target.classList.add('active');
        el.setAttribute('aria-invalid', 'true');
        updateAriaDescribedBy(el, target.id, true);
      } else {
        target.textContent = '';
        target.classList.remove('active');
        el.removeAttribute('aria-invalid');
        updateAriaDescribedBy(el, target.id, false);
      }
    }

    function clearAllFieldErrors() {
      document.querySelectorAll('.field-error').forEach(el => {
        el.textContent = '';
        el.classList.remove('active');
      });
      document.querySelectorAll('[aria-invalid="true"]').forEach(el => el.removeAttribute('aria-invalid'));
      document.querySelectorAll('[aria-describedby]').forEach((el) => {
        const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        const filtered = ids.filter(id => !id.endsWith('-error'));
        if (filtered.length) {
          el.setAttribute('aria-describedby', filtered.join(' '));
        } else {
          el.removeAttribute('aria-describedby');
        }
      });
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
      if (id === 'ptypeGroup' && !model.ptype) return 'Select what you are collecting to view available permits.';
      if (id === 'state' && !val) return 'Choose a state to see offices in that area.';
      if (id === 'officeInput') {
        if (!model.state) return 'Select a state to choose a BWL office.';
        if (!model.officeId) return 'Select a BWL office from the list to continue.';
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
      if (id === 'DeliveryEmail') {
        if (!val) return 'Enter an email address for delivery.';
        if (!EMAIL_PATTERN.test(val)) return 'Enter an email in the format name@example.com.';
        if (val.length > LENGTH_LIMITS.DeliveryEmail) return `Email must be ${LENGTH_LIMITS.DeliveryEmail} characters or fewer.`;
      }
      if (id === 'ConfirmEmail') {
        if (!val) return 'Confirm your email address.';
        if (!EMAIL_PATTERN.test(val)) return 'Enter an email in the format name@example.com.';
        const primary = (permitHolder.DeliveryEmail.value || '').trim();
        if (primary && primary.toLowerCase() !== val.toLowerCase()) return 'Confirm email must match the delivery email.';
        if (val.length > LENGTH_LIMITS.ConfirmEmail) return `Email must be ${LENGTH_LIMITS.ConfirmEmail} characters or fewer.`;
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
      totalEl.value = p.price === 0 ? 'No fee' : money(total);
      if (totalAmount) totalAmount.textContent = totalLabelFor(p.price || 0, total);
      totalCalc.textContent = `${p.price === 0 ? 'No-fee permit' : `${money(p.price)} × ${v} ${p.unit}${v === 1 ? '' : 's'} = ${totalEl.value}`}`;
      animateTotalUpdate();
      return true;
    }

    function animateTotalUpdate() {
      if (!totalAmount || prefersReducedMotion) return;
      totalAmount.classList.remove('is-updating');
      void totalAmount.offsetWidth;
      totalAmount.classList.add('is-updating');
      window.setTimeout(() => totalAmount.classList.remove('is-updating'), 180);
    }

    function resetQuantityState() {
      model.qty = 0;
      totalEl.value = '';
      if (totalAmount) totalAmount.textContent = '—';
      totalCalc.textContent = '';
      stepState.completed[1] = false;
      stepState.available[2] = false;
      stepState.completed[2] = false;
      stepState.open[2] = false;
      hideReview();
      updateStepUI(model.step);
      updateReviewActions();
    }

    function commitQuantity({ showErrors = true } = {}) {
      const wasCompleted = stepState.completed[1];
      const msg = getFieldErrorMessage(qtyEl);
      if (showErrors) {
        setFieldError(qtyEl, msg);
      } else {
        setFieldError(qtyEl, '');
      }

      if (msg) {
        resetQuantityState();
        persistState();
        return false;
      }

      const ok = validateQty();
      stepState.completed[1] = ok;
      stepState.available[2] = ok;
      if (ok && !wasCompleted) {
        stepState.open[2] = true;
      }
      updateStepUI(model.step);
      updateReviewActions();
      persistState();
      return ok;
    }

    function validatePermitHolder({ touchFields = false } = {}) {
      const msgs = [];
      const required = ['FirstName','LastName','AddressLine1','City','AddrState','Zip','DeliveryEmail','ConfirmEmail'];
      for (const k of required) {
        const el = permitHolder[k];
        const msg = getFieldErrorMessage(el);
        if (msg) msgs.push(msg);
        if (touchFields) setFieldError(el, msg);
      }
      return msgs;
    }

    function setStepOpenState(idx, open, { collapseOthers = false, scroll = false, scrollIfNeeded = false } = {}) {
      if (!stepState.available[idx]) return;

      if (collapseOthers) {
        stepState.open = stepState.open.map((_, i) => (i === idx ? open : false));
      } else {
        stepState.open[idx] = open;
      }

      updateStepUI(idx);
      hideErrors();

      if (open && (scroll || scrollIfNeeded)) {
        const head = stepSections[idx]?.querySelector('.step-head');
        if (head) scrollIntoViewSafe(head, { force: scroll });
      }
    }

    function openStepIfAvailable(idx, { scrollIfNeeded = false } = {}) {
      if (!stepState.available[idx]) return;
      if (stepState.open[idx]) return false;
      setStepOpenState(idx, true, { collapseOthers: false, scrollIfNeeded });
      return true;
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
      const wasCompleted = stepState.completed[0];
      validateProductType({ showErrors: false });
      const ok = validateStep1();
      stepState.available[1] = ok;
      if (!ok) {
        resetFollowingSteps(0);
        stepState.open = [true, false, false];
        hideLocationNotice();
        productListEl.innerHTML = '';
        qtySection.style.display = 'none';
        updateReviewActions();
        persistState();
        return;
      }

      if (ok && !wasCompleted) {
        stepState.open[1] = true;
      }
      renderProducts();

      updateStepUI(model.step);

      updateReviewActions();
      persistState();
    }

    function handleProductTypeChange(value) {
      setProductType(value);
      resetStateSelection();
      resetProductSelection();
      hideReview();
      hideLocationNotice();
      resetFollowingSteps(0);
      stepState.open = [true, false, false];
      validateProductType({ showErrors: false });
      setFieldError(stateEl, '');
      setFieldError(officeInput, '');
      syncSelectionAvailability();
      updateReviewActions();
      persistState();
      attemptAdvanceFromStep1();
    }

    function updateLockNotes() {
  const humanJoin = (items) => {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
  };

  if (lockNotes[1]) {
    const needs = [];
    if (!model.ptype) needs.push('select what you are collecting');
    if (!model.state) needs.push('choose a state');
    if (!model.officeId) needs.push('pick a BWL office');

    lockNotes[1].textContent = needs.length
      ? `To unlock Step 2, ${humanJoin(needs)}.`
      : '';
  }

  if (lockNotes[2]) {
    if (!model.product) {
      lockNotes[2].textContent = 'To unlock Step 3, choose a product and enter a quantity.';
    } else if (!model.qty) {
      lockNotes[2].textContent = 'To unlock Step 3, enter a quantity within the allowed range.';
    } else {
      lockNotes[2].textContent = '';
    }
  }
}

    function evaluateFinalStep({ showErrorsOnFail = false } = {}) {
      const ackOk = ackRequirementsMet();
      const permitHolderErrors = validatePermitHolder({ touchFields: showErrorsOnFail });
      const permitHolderValid = permitHolderErrors.length === 0;

      syncPermitHolderAccess();

      if (!ackOk || !permitHolderValid) {
        stepState.completed[2] = false;
        handoff.style.display = 'none';
        confirmPaygovBtn.disabled = true;
        if (showErrorsOnFail) {
          const errs = [];
          if (!ackOk) {
            if (!ackPrivacy.checked) errs.push('You must acknowledge the Privacy Act notification.');
            if (!ackTerms.checked) errs.push('You must agree to the Terms and Conditions.');
            if (productRequiresEligibility(model.product) && !(ackEligibility && ackEligibility.checked)) {
              errs.push('You must certify you meet the eligibility requirements for this permit.');
            }
          }
          showErrors(errs.concat(permitHolderErrors));
        }
        updateStepUI(model.step);
        updateReviewPanels();
        persistState();
        return false;
      }

      hideErrors();
      stepState.completed[2] = true;
      updateStepUI(2);
      updateReviewPanels();
      persistState();
      return true;
    }

    // Events
    stateEl.addEventListener('change', () => {
      if (!model.ptype) {
        stateEl.value = '';
        syncSelectionAvailability();
        return;
      }

      model.state = stateEl.value;

      resetOfficeSelection();
      resetProductSelection();

      stepState.completed[0] = false;
      resetFollowingSteps(0);
      stepState.open = [true, false, false];

      if (model.state) {
        officeOptions = filterOfficeOptions('');
        renderOfficeList(officeOptions, '');
        setOfficeExpanded(true);
        activeIndex = officeOptions.length ? 0 : -1;
      } else {
        activeIndex = -1;
      }

      validateField(stateEl);
      setFieldError(officeInput, '');
      validateStep1();
      hideReview();
      hideLocationNotice();
      syncSelectionAvailability();
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
      const priorOfficeId = model.officeId;
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

      // Rendering products can be expensive; only re-evaluate step gating when selection state changes.
      if (priorOfficeId !== model.officeId) {
        attemptAdvanceFromStep1();
      }
    });

    officeInput.addEventListener('blur', () => {
      setTimeout(() => setOfficeExpanded(false), 120);
      validateField(officeInput);
    });

    officeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOfficeExpanded(false);
        activeIndex = -1;
        officeInput.removeAttribute('aria-activedescendant');
        return;
      }
    
      if (officeInput.getAttribute('aria-expanded') !== 'true') {
        setOfficeExpanded(true);
      }
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
        if (officeInput.getAttribute('aria-expanded') === 'true' && activeIndex >= 0) {
          e.preventDefault();
          selectOffice(activeIndex);
        }
      }
    });


    document.addEventListener('click', (e) => {
      if (!officeCombo.contains(e.target)) setOfficeExpanded(false);
    });

    stepToggles.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        if (!stepState.available[idx]) return;
        setStepOpenState(idx, true, { collapseOthers: false, scrollIfNeeded: true });
      });
    });

    progressEditButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.editStep);
        if (!stepState.available[idx]) return;
        setStepOpenState(idx, true, { collapseOthers: false, scrollIfNeeded: true });
      });
    });

    qtyEl.addEventListener('input', () => {
      const wasCompleted = stepState.completed[1];
      setFieldError(qtyEl, '');
      const max = Number(qtyEl.max || '');
      const val = Number(qtyEl.value);
      if (Number.isFinite(max) && Number.isFinite(val) && val > max) {
        qtyEl.value = String(max);
      }
      totalCalc.textContent = '';
      const ok = validateQty();
      if (!ok && totalAmount) totalAmount.textContent = '—';
      stepState.completed[1] = ok;
      stepState.available[2] = ok;
      if (ok && !wasCompleted) {
        stepState.open[2] = true;
      }
      stepState.completed[2] = false;
      clearConfirmation();
      hideReview();
      updateLockNotes();
      updateStepUI(model.step);
      persistState();
      updateReviewActions();
    });

    qtyEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Explicit action: allow opening the next step.
        commitQuantity();
      } else if (e.key === 'Tab') {
        // Normal navigation: validate, but do NOT auto-advance or trap focus.
        commitQuantity({ showErrors: true });
      }
    });

    qtyEl.addEventListener('blur', () => {
      // Leaving the field should not auto-advance or yank focus back.
      commitQuantity({ showErrors: true });
    });

    function onAckChange() { syncPermitHolderAccess(); evaluateFinalStep(); }
    ackPrivacy.addEventListener('change', onAckChange);
    ackTerms.addEventListener('change', onAckChange);
    if (ackEligibility) ackEligibility.addEventListener('change', onAckChange);

    Object.values(permitHolder).forEach((el) => {
      el.addEventListener('input', () => { validateField(el); evaluateFinalStep(); });
      el.addEventListener('blur', () => { validateField(el); evaluateFinalStep(); });
    });

    if (permitDownloadBtn) {
      permitDownloadBtn.addEventListener('click', () => {
        if (!permitDownloadUrl) return;
        const ref = permitRefEl ? permitRefEl.textContent.trim() : 'permit';
        const a = document.createElement('a');
        a.href = permitDownloadUrl;
        a.download = `${ref || 'permit'}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
    }

    confirmPaygovBtn.addEventListener('click', () => {
      const ok = evaluateFinalStep({ showErrorsOnFail: true });
      if (!ok) return;
      clearConfirmation();

      const unitPrice = model.product?.price || 0;
      const quantity = model.qty || 0;
      const total = unitPrice * quantity;
      const permitHolderName = [permitHolder.FirstName.value.trim(), permitHolder.MiddleName.value.trim(), permitHolder.LastName.value.trim()].filter(Boolean).join(' ');
      const permitHolderEmail = permitHolder.DeliveryEmail.value.trim();

      if (unitPrice === 0 && total === 0) {
        const permitReference = `PERMIT-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

        const payload = {
          idempotencyKey: permitReference,
          permitReference,
          state: model.state,
          officeId: model.officeId,
          officeName: model.officeName,
          productType: model.ptype,
          productName: model.product?.name,
          unit: model.product?.unit,
          unitPrice,
          quantity,
          total,
          permitHolder: {
            FirstName: permitHolder.FirstName.value.trim(),
            MiddleName: permitHolder.MiddleName.value.trim(),
            LastName: permitHolder.LastName.value.trim(),
            AddressLine1: permitHolder.AddressLine1.value.trim(),
            AddressLine2: permitHolder.AddressLine2.value.trim(),
            City: permitHolder.City.value.trim(),
            State: permitHolder.AddrState.value,
            Zip: permitHolder.Zip.value.trim(),
            DeliveryEmail: permitHolderEmail
          },
          eligibility: productRequiresEligibility(model.product)
            ? { certified: Boolean(ackEligibility && ackEligibility.checked), basis: model.product?.eligibility?.basis || 'Eligibility certification required' }
            : { certified: false, basis: 'Not required' },
          nextStep: 'Issue permit (no fee) server-side, then present a confirmation page with a download link for the permit PDF.',
          deliveryPlan: 'Permit is available immediately after confirmation and sent to the provided email address (demo behavior).',
          serverChecks: { verifyEmailMatch: true, enforcePayloadLimitBytes: MAX_PAYLOAD_BYTES }
        };

        const payloadSize = new TextEncoder().encode(JSON.stringify(payload)).length;
        if (payloadSize > MAX_PAYLOAD_BYTES) {
          showErrors([`Form data is too large (${payloadSize} bytes). Shorten text entries and try again.`]);
          return;
        }

        const lines = [
          'Bureau of Wandering Lands — Forest Product Permit (DEMO)',
          '',
          `Permit reference: ${permitReference}`,
          `Issued to: ${permitHolderName || '—'}`,
          `Delivery email: ${permitHolderEmail || '—'}`,
          '',
          `Office: ${model.officeName || '—'} (${model.officeId || '—'})`,
          `Product: ${model.product?.name || '—'}`,
          `Quantity: ${quantity} ${model.product?.unit || 'unit'}${quantity === 1 ? '' : 's'}`,
          'Fee: No fee',
          '',
          'This is a prototype-generated demo permit. Do not use for actual harvesting.'
        ];
        const blob = buildDemoPermitPdf(lines);
        permitDownloadUrl = URL.createObjectURL(blob);

        if (permitRefEl) permitRefEl.textContent = permitReference;
        if (confirmation) confirmation.style.display = 'flex';
        if (permitDownloadBtn) permitDownloadBtn.disabled = false;

        handoff.style.display = 'block';
        handoff.className = 'summary';
        handoff.innerHTML = '';
        const payloadKey = document.createElement('div');
        payloadKey.className = 'k';
        payloadKey.textContent = 'Demo issuance payload (no fee)';
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
        note.textContent = 'In production, the site would request permit issuance from the permitting system and return a signed permit PDF for download.';

        handoff.appendChild(payloadKey);
        handoff.appendChild(payloadVal);
        handoff.appendChild(note);

        scrollIntoViewSafe(confirmation || handoff, { force: true });
        return;
      }

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
        unitPrice,
        quantity,
        total,
        permitHolder: {
          FirstName: permitHolder.FirstName.value.trim(),
          MiddleName: permitHolder.MiddleName.value.trim(),
          LastName: permitHolder.LastName.value.trim(),
          AddressLine1: permitHolder.AddressLine1.value.trim(),
          AddressLine2: permitHolder.AddressLine2.value.trim(),
          City: permitHolder.City.value.trim(),
          State: permitHolder.AddrState.value,
          Zip: permitHolder.Zip.value.trim(),
          DeliveryEmail: permitHolderEmail
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
      scrollIntoViewSafe(handoff);
    });

    resetAllBtn.addEventListener('click', () => {
      resetStateSelection();
      setProductType('');
      resetProductSelection();
      setOfficeExpanded(false);
      stepState.available = [true, false, false];
      stepState.completed = [false, false, false];
      stepState.open = [true, false, false];
      resetAcknowledgements();
      hideReview();
      hideErrors();
      hideLocationNotice();
      clearAllFieldErrors();
      syncSelectionAvailability();
      updateStepUI(0);
      updateReviewActions();
      clearPersistedState();
    });

    async function boot() {
      renderProductTypes();
      syncSelectionAvailability();
      await loadProductData();
      populateUSStates(permitHolder.AddrState);
      restoreState();
      syncPermitHolderAccess();
      updateReviewActions();
      syncSelectionAvailability();
      updateStepUI(0);
    }

    boot();
})();
