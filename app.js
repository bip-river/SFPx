    let DATA = {};
    const DATA_SOURCE = 'products.json';

    const PRODUCT_TYPES = [
      { id: 'fuelwood', label: 'Fuelwood' },
      { id: 'christmas', label: 'Christmas trees' },
      { id: 'mushrooms', label: 'Mushrooms' }
    ];

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
    const totalEl = document.getElementById('total');

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

    const resetAllBtn = document.getElementById('resetAll');

    // Purchaser fields
    const purchaser = {
      FirstName: document.getElementById('FirstName'),
      MiddleName: document.getElementById('MiddleName'),
      LastName: document.getElementById('LastName'),
      Phone: document.getElementById('Phone'),
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
      officeCombo.setAttribute('aria-expanded', String(expanded));
      officeList.setAttribute('aria-hidden', String(!expanded));
    }

    function getOfficesForState(code) {
      return (DATA[code]?.offices || []).map(o => ({ id:o.id, name:o.name }));
    }

    function renderOfficeList(items, query) {
      officeList.innerHTML = '';
      if (!items.length) {
        const div = document.createElement('div');
        div.className = 'opt';
        div.setAttribute('role','option');
        div.setAttribute('aria-selected','false');
        div.textContent = query ? 'No matches. Try another search.' : 'Start typing to search offices.';
        officeList.appendChild(div);
        return;
      }
      items.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'opt';
        div.setAttribute('role','option');
        div.dataset.index = String(idx);
        div.innerHTML = `<div>${item.name}</div><span class="small">${item.id}</span>`;
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
    }

    function selectOffice(idx) {
      const item = officeOptions[idx];
      if (!item) return;
      officeInput.value = item.name;
      officeIdEl.value = item.id;
      model.officeId = item.id;
      model.officeName = item.name;
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
      return { validForDays, expirationDate };
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

      const docList = hasDocs
        ? `<div class="detail"><strong>Attachments for this area:</strong><ul>${attachments.map(d => `<li><a href="${d.url}">${d.label}</a></li>`).join('')}</ul></div>`
        : '';

      locationNotice.innerHTML = `
        <div class="title"><span class="badge" aria-hidden="true">i</span><span>Local details for your selection</span></div>
        ${hasStateDesc ? `<div class="detail"><strong>${stateData.name}:</strong> ${stateData.description}</div>` : ''}
        ${hasOfficeDesc ? `<div class="detail"><strong>${office.name}:</strong> ${office.description}</div>` : ''}
        ${docList}
      `;
      locationNotice.style.display = 'block';
    }

    function renderSummary(el) {
      const stateName = DATA[model.state]?.name || '';
      const ptypeLabel = (PRODUCT_TYPES.find(t => t.id === model.ptype)?.label) || '';
      const prod = model.product;
      const qty = model.qty;
      el.innerHTML = `
        <div class="k">Selection</div>
        <div class="v">${stateName || '—'} • ${model.officeName || '—'} • ${ptypeLabel || '—'}</div>
        <div class="k" style="margin-top:8px;">Product</div>
        <div class="v">${prod ? prod.name : '—'}</div>
        <div class="k" style="margin-top:8px;">Quantity</div>
        <div class="v">${qty ? qty + ' ' + (prod?.unit || '') + (qty === 1 ? '' : 's') : '—'}</div>
      `;
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
      ].filter(Boolean).join('<br />');
      const phone = purchaser.Phone.value.trim() || 'Not provided';
      const email = purchaser.Email.value.trim();
      const total = (model.product?.price || 0) * (model.qty || 0);
      const totalLabel = (model.product?.price === 0) ? 'Free' : money(total);
      const qtyLabel = model.qty ? `${model.qty} ${model.product?.unit || 'unit'}${model.qty === 1 ? '' : 's'}` : '—';

      handoff.style.display = 'none';
      reviewSummary.innerHTML = `
        <div class="k">Customer</div>
        <div class="v">
          ${fullName || '—'}<br />
          ${addressParts || '—'}<br />
          Phone: ${phone}<br />
          Email: ${email}
        </div>
        <div class="k" style="margin-top:10px;">Product</div>
        <div class="v">
          ${stateName} — ${model.officeName || '—'}<br />
          ${model.product?.name || '—'}<br />
          ${qtyLabel}<br />
          Estimated total: ${totalLabel}
        </div>
      `;

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

        productListEl.innerHTML = `<div class="alert" role="status" aria-live="polite">
          <div class="icon" aria-hidden="true">i</div>
          <div class="txt">
            <strong>Nothing to select</strong>
            ${msg}
          </div>
        </div>`;
        return;
      }

      products.forEach((p, idx) => {
        const id = `prod_${idx}`;
        const priceLine = p.price === 0 ? 'Free' : `${money(p.price)} per ${p.unit}`;
        const saleEnd = p.availableUntil ? `Available until ${formatDate(p.availableUntil)}` : 'Availability varies';
        const { validForDays, expirationDate } = calculatePermitValidity(p);
        const validity = `Valid for ${validForDays} days • Permit expires ${formatDate(expirationDate)}`;
        const docs = buildRequiredDocs(p).map(d => `<a href="${d.url}">${d.label}</a>`).join(' · ');

        const card = document.createElement('label');
        card.className = 'prod';
        card.setAttribute('for', id);
        card.innerHTML = `
          <input type="radio" name="product" id="${id}" value="${idx}" />
          <div>
            <div class="name">${p.name}</div>
            <div class="meta">${model.officeName} · ${priceLine}</div>
            <div class="meta">${saleEnd}</div>
            <div class="kv">
              <span class="chip">${validity}</span>
            </div>
            <div class="docs">${docs ? 'Required documents: ' + docs : ''}</div>
          </div>
        `;

        card.querySelector('input').addEventListener('change', () => {
          model.productIndex = idx;
          model.product = p;
          qtyHint.textContent = `Enter 1–${p.maxQty} ${p.unit}(s). Price: ${p.price===0?'Free':money(p.price)} per ${p.unit}.`;
          qtyEl.min = 1;
          qtyEl.max = p.maxQty || '';
          qtyEl.value = '';
          totalEl.value = '';
          qtySection.style.display = 'block';
          model.qty = 0;
          stepState.completed[1] = false;
          stepState.available[2] = false;
          ackPrivacy.checked = false;
          ackTerms.checked = false;
          hideReview();
          renderSummary(progressSummary);
          setOpenStep(1);
          qtyEl.focus();
        });

        productListEl.appendChild(card);
      });
    }

    function updateStepUI(activeIdx = model.step) {
      model.step = activeIdx;
      steps.forEach((el, i) => {
        const isActive = stepState.open[i];
        el.classList.toggle('active', isActive);
        el.classList.toggle('done', stepState.completed[i]);
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
      return true;
    }

    function validatePurchaser() {
      const msgs = [];
      const required = [
        ['FirstName','First name is required.'],
        ['LastName','Last name is required.'],
        ['AddressLine1','Street address line 1 is required.'],
        ['City','City is required.'],
        ['AddrState','State is required.'],
        ['Zip','ZIP is required.'],
        ['Email','Email is required.'],
        ['Email2','Repeat email is required.']
      ];
      for (const [k,msg] of required) {
        const el = purchaser[k];
        const val = (el.value || '').trim();
        if (!val) msgs.push(msg);
      }
      const e1 = (purchaser.Email.value || '').trim();
      const e2 = (purchaser.Email2.value || '').trim();
      if (e1 && e2 && e1.toLowerCase() !== e2.toLowerCase()) msgs.push('Email addresses must match.');
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (e1 && !emailPattern.test(e1)) msgs.push('Enter a valid email address.');
      const zip = (purchaser.Zip.value || '').trim();
      if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) msgs.push('ZIP must be 5 digits (or ZIP+4).');
      const phone = (purchaser.Phone.value || '').trim();
      const digits = phone.replace(/\D/g, '');
      if (phone && digits.length < 10) msgs.push('Enter a valid phone number with area code.');
      const address = (purchaser.AddressLine1.value || '').trim();
      if (address && address.length < 5) msgs.push('Enter a full street address.');
      const city = (purchaser.City.value || '').trim();
      if (city && city.length < 2) msgs.push('Enter a valid city name.');
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
        return;
      }

      renderSummary(progressSummary);
      renderProducts();
      setOpenStep(1);
      updateStepUI(1);
    }

    function handleQuantityProgress() {
      const ok = validateQty();
      stepState.completed[1] = ok;
      stepState.available[2] = ok;
      if (ok) {
        renderSummary(progressSummary);
        setOpenStep(2);
      } else {
        model.qty = 0;
        stepState.completed[2] = false;
        stepState.open = [stepState.open[0], true, false];
        renderSummary(progressSummary);
        reviewSummary.style.display = 'none';
        reviewNotice.style.display = 'none';
        reviewActions.style.display = 'none';
        confirmPaygovBtn.disabled = true;
      }
      updateStepUI(model.step);
    }

    function evaluateFinalStep({ showErrorsOnFail = false } = {}) {
      const ackOk = ackPrivacy.checked && ackTerms.checked;
      const purchaserErrors = validatePurchaser();
      const purchaserValid = purchaserErrors.length === 0;

      if (!ackOk || !purchaserValid) {
        stepState.completed[2] = false;
        reviewSummary.style.display = 'none';
        reviewNotice.style.display = 'none';
        reviewActions.style.display = 'none';
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

      validateStep1();
      hideReview();
      hideLocationNotice();
      renderSummary(progressSummary);
      updateStepUI(0);
    });

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

    officeInput.addEventListener('keydown', (e) => {
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
      model.qty = 0;
      hideReview();
      qtySection.style.display = 'none';
      resetFollowingSteps(0);
      stepState.open = [true, false, false];
      attemptAdvanceFromStep1();
      hideLocationNotice();
    });

    stepToggles.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        if (!stepState.available[idx]) return;
        setOpenStep(idx);
      });
    });

    qtyEl.addEventListener('input', () => {
      if (!validateQty()) {
        totalEl.value = '';
      }
      handleQuantityProgress();
    });

    function onAckChange() { evaluateFinalStep(); }
    ackPrivacy.addEventListener('change', onAckChange);
    ackTerms.addEventListener('change', onAckChange);

    Object.values(purchaser).forEach((el) => {
      el.addEventListener('input', () => evaluateFinalStep());
      el.addEventListener('blur', () => evaluateFinalStep());
    });

    confirmPaygovBtn.addEventListener('click', () => {
      const ok = evaluateFinalStep({ showErrorsOnFail: true });
      if (!ok) return;
      const payload = {
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
          Phone: purchaser.Phone.value.trim(),
          AddressLine1: purchaser.AddressLine1.value.trim(),
          AddressLine2: purchaser.AddressLine2.value.trim(),
          City: purchaser.City.value.trim(),
          State: purchaser.AddrState.value,
          Zip: purchaser.Zip.value.trim(),
          Email: purchaser.Email.value.trim()
        },
        nextStep: "Redirect to Pay.gov (secure payment processing), then return to forestproducts.blm.gov to download the permit."
      };

      handoff.style.display = 'block';
      handoff.className = 'summary';
      handoff.innerHTML = `
        <div class="k">Demo handoff payload</div>
        <div class="v" style="margin-top:6px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size:13px; white-space:pre-wrap;">
${JSON.stringify(payload, null, 2)}
        </div>
        <div class="k" style="margin-top:10px;">In production, the site would create a Sale ID and redirect the user to Pay.gov with that transaction context.</div>
      `;
      handoff.scrollIntoView({ behavior:'smooth', block:'start' });
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
      model.qty = 0;
      qtySection.style.display = 'none';
      setOfficeExpanded(false);
      productListEl.innerHTML = '';
      stepState.available = [true, false, false];
      stepState.completed = [false, false, false];
      stepState.open = [true, false, false];
      hideReview();
      hideErrors();
      hideLocationNotice();
      renderSummary(progressSummary);
      updateStepUI(0);
    });

    async function boot() {
      await loadProductData();
      populateUSStates(purchaser.AddrState);
      renderSummary(progressSummary);
      updateStepUI(0);
    }

    boot();
