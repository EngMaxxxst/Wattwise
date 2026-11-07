/* ============================================================
   WattWise — application logic
   ============================================================ */

(function () {
  'use strict';

  const STORAGE_KEY = 'wattwise.state.v1';
  const PALETTE = ['#a3ed2a', '#5fd0a0', '#f4b740', '#6cc4e8', '#c8a6ff', '#ff8f6b', '#8fd65a', '#f2e06b'];
  const ICONS = ['❄️', '🧊', '📺', '🌀', '🧺', '💡', '🍳', '💻', '🔌', '🚿', '☕', '🧹', '🌡️', '🔊', '🖥️', '🛁'];
  const SAMPLE_APPLIANCES = [
    { id: 'ac', name: 'Air Conditioner', icon: '❄️', watts: 1000, hours: 6, color: '#a3ed2a' },
    { id: 'ref', name: 'Refrigerator', icon: '🧊', watts: 50, hours: 24, color: '#5fd0a0' },
    { id: 'tv', name: 'Television', icon: '📺', watts: 100, hours: 5, color: '#f4b740' },
    { id: 'fan', name: 'Electric Fan', icon: '🌀', watts: 60, hours: 8, color: '#6cc4e8' }
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const pesoFormatter = new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const numberFormatter = new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  const oneDecimalFormatter = new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });

  const money = (value) => '₱' + pesoFormatter.format(Number.isFinite(value) ? value : 0);
  const kwh = (value) => oneDecimalFormatter.format(Number.isFinite(value) ? value : 0);
  const whole = (value) => numberFormatter.format(Number.isFinite(value) ? value : 0);
  const hoursLabel = (value) => {
    const rounded = Math.round(value * 10) / 10;
    return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)) + ' h/day';
  };
  const pct = (part, wholeValue) => (wholeValue > 0 ? (part / wholeValue) * 100 : 0);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'app-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function defaultState() {
    return {
      rate: 12,
      days: 30,
      budget: 3000,
      appliances: SAMPLE_APPLIANCES.map((item) => ({ ...item }))
    };
  }

  function normalizeAppliance(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : '';
    const watts = Number(raw.watts);
    const hours = Number(raw.hours);
    if (!name || !Number.isFinite(watts) || watts <= 0 || watts > 30000) return null;
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) return null;

    const icon = typeof raw.icon === 'string' && raw.icon.length <= 8 ? raw.icon : ICONS[index % ICONS.length];
    const color = typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color)
      ? raw.color
      : PALETTE[index % PALETTE.length];

    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : makeId(),
      name,
      icon,
      watts,
      hours,
      color
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaultState();

      const rate = Number(parsed.rate);
      const days = Number(parsed.days);
      const budget = Number(parsed.budget);
      const appliances = Array.isArray(parsed.appliances)
        ? parsed.appliances.map(normalizeAppliance).filter(Boolean)
        : [];

      return {
        rate: Number.isFinite(rate) && rate > 0 && rate <= 100 ? rate : 12,
        days: Number.isFinite(days) && days >= 1 && days <= 31 ? Math.round(days) : 30,
        budget: Number.isFinite(budget) && budget >= 0 ? budget : 3000,
        appliances
      };
    } catch (error) {
      return defaultState();
    }
  }

  let state = loadState();
  let whatIfId = null;
  let whatIfHours = 0;
  let selectedIcon = ICONS[0];
  let lastFocusedElement = null;

  const sortState = {
    steps: [],
    index: 0,
    timer: null,
    playing: false
  };

  const el = {
    rateChipValue: $('#rateChipValue'),
    rateChip: $('#rateChip'),
    settingsBtn: $('#settingsBtn'),
    addBtn: $('#addBtn'),
    quickTakeText: $('#quickTakeText'),
    quickTakeAction: $('#quickTakeAction'),

    statKwh: $('#statKwh'),
    statKwhFoot: $('#statKwhFoot'),
    statCost: $('#statCost'),
    statCostFoot: $('#statCostFoot'),
    statBudget: $('#statBudget'),
    statHeadroom: $('#statHeadroom'),
    headroomLabel: $('#headroomLabel'),
    headroomPill: $('#headroomPill'),
    headroomCard: $('#headroomCard'),
    editBudgetBtn: $('#editBudgetBtn'),

    mixBar: $('#mixBar'),
    mixLegend: $('#mixLegend'),
    applianceList: $('#applianceList'),
    emptyState: $('#emptyState'),
    emptyAddBtn: $('#emptyAddBtn'),
    restoreBtn: $('#restoreBtn'),
    visualizeBtn: $('#visualizeBtn'),
    opportunityList: $('#opportunityList'),
    opportunityTotal: $('#opportunityTotal'),

    budgetDonut: $('#budgetDonut'),
    budgetPct: $('#budgetPct'),
    budgetStatus: $('#budgetStatus'),
    budgetDetail: $('#budgetDetail'),
    budgetRowBudget: $('#budgetRowBudget'),
    budgetRowCost: $('#budgetRowCost'),
    budgetRowRemaining: $('#budgetRowRemaining'),
    budgetRowRemainingLabel: $('#budgetRowRemainingLabel'),
    budgetTip: $('#budgetTip'),
    budgetSettingsBtn: $('#budgetSettingsBtn'),

    whatifAppliance: $('#whatifAppliance'),
    whatifHours: $('#whatifHours'),
    whatifHoursOut: $('#whatifHoursOut'),
    whatifOriginalCost: $('#whatifOriginalCost'),
    whatifOriginalMeta: $('#whatifOriginalMeta'),
    whatifRevisedCost: $('#whatifRevisedCost'),
    whatifRevisedMeta: $('#whatifRevisedMeta'),
    whatifDiffLabel: $('#whatifDiffLabel'),
    whatifDiff: $('#whatifDiff'),
    whatifAnnual: $('#whatifAnnual'),
    whatifBudgetImpact: $('#whatifBudgetImpact'),
    applyWhatifBtn: $('#applyWhatifBtn'),
    resetWhatifBtn: $('#resetWhatifBtn'),

    applianceModal: $('#applianceModal'),
    applianceModalEyebrow: $('#applianceModalEyebrow'),
    applianceModalTitle: $('#applianceModalTitle'),
    applianceForm: $('#applianceForm'),
    applianceId: $('#applianceId'),
    applianceName: $('#applianceName'),
    applianceWatts: $('#applianceWatts'),
    applianceHours: $('#applianceHours'),
    iconPicker: $('#iconPicker'),
    previewKwh: $('#previewKwh'),
    previewCost: $('#previewCost'),
    applianceError: $('#applianceError'),
    applianceSubmit: $('#applianceSubmit'),

    settingsModal: $('#settingsModal'),
    settingsForm: $('#settingsForm'),
    settingRate: $('#settingRate'),
    settingDays: $('#settingDays'),
    settingBudget: $('#settingBudget'),
    settingsError: $('#settingsError'),
    resetDataBtn: $('#resetDataBtn'),

    sortModal: $('#sortModal'),
    sortRows: $('#sortRows'),
    sortComparisons: $('#sortComparisons'),
    sortSwaps: $('#sortSwaps'),
    sortMessage: $('#sortMessage'),
    sortPlayBtn: $('#sortPlayBtn'),
    sortPlayLabel: $('#sortPlayLabel'),
    sortStepBtn: $('#sortStepBtn'),
    sortResetBtn: $('#sortResetBtn'),

    toastStack: $('#toastStack')
  };

  /* ------------------------------------------------------------
     Calculations
     ------------------------------------------------------------ */

  function calculate(appliance) {
    const dailyKwh = (appliance.watts * appliance.hours) / 1000;
    const monthlyKwh = dailyKwh * state.days;
    const monthlyCost = monthlyKwh * state.rate;
    return { ...appliance, dailyKwh, monthlyKwh, monthlyCost };
  }

  function calculatedList() {
    return state.appliances.map(calculate);
  }

  function totals() {
    const items = calculatedList();
    const monthlyKwh = items.reduce((sum, item) => sum + item.monthlyKwh, 0);
    const monthlyCost = items.reduce((sum, item) => sum + item.monthlyCost, 0);
    return { items, monthlyKwh, monthlyCost };
  }

  // The selected data structure is an ArrayList; this is the actual
  // selection sort used to rank appliances from highest to lowest kWh.
  function selectionSort(items) {
    const arr = items.slice();
    for (let i = 0; i < arr.length - 1; i += 1) {
      let maxIndex = i;
      for (let j = i + 1; j < arr.length; j += 1) {
        if (arr[j].monthlyKwh > arr[maxIndex].monthlyKwh) {
          maxIndex = j;
        }
      }
      if (maxIndex !== i) {
        const temp = arr[i];
        arr[i] = arr[maxIndex];
        arr[maxIndex] = temp;
      }
    }
    return arr;
  }

  function sortedCalculated() {
    return selectionSort(calculatedList());
  }

  function pickColor() {
    const used = new Set(state.appliances.map((item) => item.color));
    const unused = PALETTE.find((color) => !used.has(color));
    return unused || PALETTE[state.appliances.length % PALETTE.length];
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // Storage can be unavailable in private or file-based contexts.
    }
  }

  /* ------------------------------------------------------------
     Rendering — summary
     ------------------------------------------------------------ */

  function renderStats() {
    const { monthlyKwh, monthlyCost } = totals();
    const remaining = state.budget - monthlyCost;
    const dailyAverage = state.days > 0 ? monthlyKwh / state.days : 0;

    el.statKwh.textContent = kwh(monthlyKwh);
    el.statKwhFoot.textContent = '≈ ' + kwh(dailyAverage) + ' kWh per day';
    el.statCost.textContent = money(monthlyCost);
    el.statCostFoot.textContent = 'At ' + money(state.rate) + ' per kWh';
    el.statBudget.textContent = money(state.budget);
    el.rateChipValue.textContent = money(state.rate) + ' / kWh';

    el.headroomCard.classList.toggle('is-over', remaining < 0);
    el.headroomLabel.textContent = remaining < 0 ? 'Over budget' : 'Budget headroom';
    el.statHeadroom.textContent = money(Math.abs(remaining));
    el.headroomPill.className = 'status-pill ' + (remaining < 0 ? 'warn' : 'good');
    el.headroomPill.innerHTML = '<span class="dot"></span> ' + (remaining < 0 ? 'Over budget' : 'Under budget');
  }

  function renderQuickTake(sorted) {
    if (!sorted.length) {
      el.quickTakeText.textContent = 'Add your first appliance to see where your electricity goes.';
      el.quickTakeAction.hidden = true;
      return;
    }

    const { monthlyKwh } = totals();
    const top = sorted.find((item) => item.hours > 0) || sorted[0];
    const share = Math.round(pct(top.monthlyKwh, monthlyKwh));
    const cut = top.hours >= 2 ? 2 : top.hours;
    const savings = (top.watts * cut / 1000) * state.days * state.rate;

    if (cut > 0) {
      el.quickTakeText.innerHTML = '<strong>' + escapeHtml(top.name) + '</strong> uses about <strong>' +
        share + '%</strong> of your estimated energy. Cutting <strong>' + hoursLabel(cut) +
        '</strong> could save <strong>' + money(savings) + '</strong> a month.';
      el.quickTakeAction.hidden = false;
      el.quickTakeAction.dataset.id = top.id;
      el.quickTakeAction.dataset.hours = String(Math.max(0, top.hours - cut));
    } else {
      el.quickTakeText.innerHTML = '<strong>' + escapeHtml(top.name) + '</strong> is the largest registered load at <strong>' +
        kwh(top.monthlyKwh) + ' kWh</strong> per month. Set its operating hours to unlock a what-if.';
      el.quickTakeAction.hidden = true;
    }
  }

  /* ------------------------------------------------------------
     Rendering — ranking
     ------------------------------------------------------------ */

  function rowActions(id, name) {
    const safeName = escapeHtml(name);
    return '<div class="row-actions">' +
      '<button type="button" class="row-action" data-action="edit" data-id="' + escapeHtml(id) + '" aria-label="Edit ' + safeName + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>' +
      '</button>' +
      '<button type="button" class="row-action" data-action="delete" data-id="' + escapeHtml(id) + '" aria-label="Remove ' + safeName + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>' +
      '</button>' +
      '</div>';
  }

  function renderRanking() {
    const sorted = sortedCalculated();
    const { monthlyKwh } = totals();
    const hasItems = sorted.length > 0;

    el.emptyState.hidden = hasItems;
    el.applianceList.hidden = !hasItems;
    el.mixBar.hidden = !hasItems;
    el.mixLegend.hidden = !hasItems;
    el.visualizeBtn.disabled = !hasItems;

    if (!hasItems) {
      el.applianceList.innerHTML = '';
      el.mixBar.innerHTML = '';
      el.mixLegend.innerHTML = '';
      renderOpportunities(sorted);
      return;
    }

    const maxKwh = sorted[0].monthlyKwh || 1;

    el.applianceList.innerHTML = sorted.map((item, index) => {
      const share = pct(item.monthlyKwh, monthlyKwh);
      const barWidth = clamp((item.monthlyKwh / maxKwh) * 100, 2, 100);
      const rank = String(index + 1).padStart(2, '0');
      const topTag = index === 0 ? '<span class="tag">Top consumer</span>' : '';

      return '<article class="appliance-row" style="--accent:' + item.color + ';--i:' + index + '">' +
        '<span class="rank-badge">' + rank + '</span>' +
        '<span class="appliance-icon" aria-hidden="true">' + escapeHtml(item.icon) + '</span>' +
        '<div class="appliance-info">' +
          '<div class="appliance-title"><h3>' + escapeHtml(item.name) + '</h3>' + topTag + '</div>' +
          '<div class="appliance-meta"><span>' + whole(item.watts) + ' W</span><span class="sep">·</span>' +
            '<span>' + hoursLabel(item.hours) + '</span><span class="sep">·</span>' +
            '<span>' + kwh(item.dailyKwh) + ' kWh/day</span></div>' +
          '<div class="appliance-bar"><span style="width:' + barWidth.toFixed(1) + '%"></span></div>' +
        '</div>' +
        '<div class="appliance-figures"><strong>' + money(item.monthlyCost) + '</strong>' +
          '<span>' + kwh(item.monthlyKwh) + ' kWh · ' + Math.round(share) + '%</span></div>' +
        rowActions(item.id, item.name) +
      '</article>';
    }).join('');

    el.mixBar.innerHTML = sorted.map((item) => {
      const share = pct(item.monthlyKwh, monthlyKwh);
      return '<span class="mix-segment" style="width:' + share.toFixed(2) + '%;background:' + item.color +
        '" title="' + escapeHtml(item.name) + ' — ' + kwh(item.monthlyKwh) + ' kWh"></span>';
    }).join('');

    el.mixLegend.innerHTML = sorted.map((item) => {
      const share = pct(item.monthlyKwh, monthlyKwh);
      return '<span class="mix-legend-item"><i style="background:' + item.color + '"></i>' +
        escapeHtml(item.name) + ' <strong>' + Math.round(share) + '%</strong></span>';
    }).join('');

    renderQuickTake(sorted);
    renderOpportunities(sorted);
  }

  /* ------------------------------------------------------------
     Rendering — savings opportunities
     ------------------------------------------------------------ */

  function renderOpportunities(sorted) {
    const candidates = sorted
      .filter((item) => item.hours > 0)
      .map((item) => {
        const cut = Math.min(1, item.hours);
        const savedKwh = (item.watts * cut / 1000) * state.days;
        return { ...item, cut, savedKwh, savings: savedKwh * state.rate };
      })
      .filter((item) => item.savings > 0.004)
      .sort((a, b) => b.savings - a.savings)
      .slice(0, 3);

    if (!candidates.length) {
      el.opportunityList.innerHTML = '<p class="opportunity-empty">Add an appliance with operating hours to reveal your biggest savings opportunities.</p>';
      el.opportunityTotal.textContent = money(0);
      return;
    }

    el.opportunityList.innerHTML = candidates.map((item) =>
      '<article class="opportunity-row" style="--accent:' + item.color + '">' +
        '<span class="opp-icon" aria-hidden="true">' + escapeHtml(item.icon) + '</span>' +
        '<div class="opp-info"><strong>' + escapeHtml(item.name) + '</strong>' +
          '<span>' + hoursLabel(item.cut) + ' less · ' + kwh(item.savedKwh) + ' kWh saved</span></div>' +
        '<div class="opp-saving"><strong>' + money(item.savings) + '</strong><span>per month</span></div>' +
        '<button type="button" class="opp-try" data-id="' + escapeHtml(item.id) + '" data-hours="' +
          String(Math.max(0, item.hours - item.cut)) + '" aria-label="Simulate saving on ' +
          escapeHtml(item.name) + '" title="Load in what-if lab">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
        '</button>' +
      '</article>'
    ).join('');

    const total = candidates.reduce((sum, item) => sum + item.savings, 0);
    el.opportunityTotal.textContent = money(total);
  }

  /* ------------------------------------------------------------
     Rendering — budget
     ------------------------------------------------------------ */

  function renderBudget() {
    const { monthlyCost } = totals();
    const remaining = state.budget - monthlyCost;
    const usage = state.budget > 0 ? pct(monthlyCost, state.budget) : (monthlyCost > 0 ? 100 : 0);
    const displayPct = Math.round(usage);
    const isOver = remaining < 0;

    let color = 'var(--lime)';
    let statusClass = 'good';
    let statusText = "You're under budget.";
    if (isOver) {
      color = usage > 110 ? 'var(--red)' : 'var(--amber)';
      statusClass = usage > 110 ? 'bad' : 'warn';
      statusText = "You're over budget.";
    }

    el.budgetDonut.style.setProperty('--pct', clamp(usage, 0, 100).toFixed(2));
    el.budgetDonut.style.setProperty('--donut-color', color);
    el.budgetPct.textContent = displayPct + '%';
    el.budgetStatus.textContent = statusText;
    el.budgetStatus.className = 'budget-status ' + statusClass;

    if (state.budget <= 0) {
      el.budgetDetail.textContent = 'Set a monthly budget to track your estimate.';
    } else if (isOver) {
      el.budgetDetail.textContent = 'Your estimate is ' + money(Math.abs(remaining)) + ' above the ' +
        money(state.budget) + ' budget.';
    } else {
      el.budgetDetail.textContent = displayPct + '% of your ' + money(state.budget) +
        ' budget is accounted for, with ' + money(remaining) + ' left.';
    }

    el.budgetRowBudget.textContent = money(state.budget);
    el.budgetRowCost.textContent = money(monthlyCost);
    el.budgetRowRemainingLabel.textContent = isOver ? 'Over budget by' : 'Remaining';
    el.budgetRowRemaining.textContent = money(Math.abs(remaining));
    el.budgetRowRemaining.parentElement.classList.toggle('is-over', isOver);

    const top = sortedCalculated()[0];
    if (top) {
      const cut = top.hours >= 1 ? 1 : 0;
      const savings = (top.watts * cut / 1000) * state.days * state.rate;
      if (cut > 0) {
        el.budgetTip.innerHTML = '<span class="tip-icon">💡</span><p>Trimming <strong>' +
          escapeHtml(top.name) + '</strong> by 1 hour a day could save about <strong>' +
          money(savings) + '</strong> a month.</p>';
      } else {
        el.budgetTip.innerHTML = '<span class="tip-icon">💡</span><p>Your top appliance is already at 0 hours. Try the what-if lab with another appliance.</p>';
      }
    } else {
      el.budgetTip.innerHTML = '<span class="tip-icon">💡</span><p>Add appliances to see personalised budget tips.</p>';
    }
  }

  /* ------------------------------------------------------------
     Rendering — what-if
     ------------------------------------------------------------ */

  function ensureWhatIfSelection() {
    const list = state.appliances;
    if (!list.length) {
      whatIfId = null;
      whatIfHours = 0;
      return;
    }
    const existing = list.find((item) => item.id === whatIfId);
    if (!existing) {
      const top = sortedCalculated()[0] || list[0];
      whatIfId = top.id;
      whatIfHours = top.hours;
    }
  }

  function renderWhatIfOptions() {
    ensureWhatIfSelection();

    if (!state.appliances.length) {
      el.whatifAppliance.innerHTML = '<option value="">No appliances yet</option>';
      el.whatifAppliance.disabled = true;
      return;
    }

    el.whatifAppliance.disabled = false;
    el.whatifAppliance.innerHTML = state.appliances.map((item) =>
      '<option value="' + escapeHtml(item.id) + '"' + (item.id === whatIfId ? ' selected' : '') + '>' +
        escapeHtml(item.icon) + '  ' + escapeHtml(item.name) +
      '</option>'
    ).join('');
  }

  function updateWhatIf() {
    ensureWhatIfSelection();
    const appliance = state.appliances.find((item) => item.id === whatIfId);

    if (!appliance) {
      el.whatifHours.disabled = true;
      el.applyWhatifBtn.disabled = true;
      el.whatifHoursOut.textContent = '—';
      el.whatifOriginalCost.textContent = money(0);
      el.whatifRevisedCost.textContent = money(0);
      el.whatifOriginalMeta.textContent = 'No appliance';
      el.whatifRevisedMeta.textContent = 'Add one to simulate';
      el.whatifDiff.textContent = money(0);
      el.whatifAnnual.textContent = money(0) + ' / year';
      el.whatifBudgetImpact.textContent = 'Add an appliance to run a what-if comparison.';
      return;
    }

    whatIfHours = clamp(whatIfHours, 0, 24);
    const originalCost = (appliance.watts * appliance.hours / 1000) * state.days * state.rate;
    const revisedCost = (appliance.watts * whatIfHours / 1000) * state.days * state.rate;
    const difference = originalCost - revisedCost;
    const { monthlyCost } = totals();
    const projected = monthlyCost - originalCost + revisedCost;
    const projectedRemaining = state.budget - projected;

    el.whatifHours.disabled = false;
    el.whatifHours.value = String(whatIfHours);
    el.whatifHours.style.setProperty('--fill', ((whatIfHours / 24) * 100).toFixed(1) + '%');
    el.whatifHoursOut.textContent = hoursLabel(whatIfHours);

    el.whatifOriginalCost.textContent = money(originalCost);
    el.whatifOriginalMeta.textContent = hoursLabel(appliance.hours);
    el.whatifRevisedCost.textContent = money(revisedCost);
    el.whatifRevisedMeta.textContent = hoursLabel(whatIfHours);

    const changed = Math.abs(whatIfHours - appliance.hours) > 0.001;
    const savingsRow = el.whatifDiff.closest('.savings-row');
    savingsRow.classList.toggle('is-negative', difference < 0);
    el.whatifDiffLabel.textContent = difference < 0 ? 'Estimated added cost' : 'Estimated savings';
    el.whatifDiff.textContent = money(Math.abs(difference));
    el.whatifAnnual.textContent = money(Math.abs(difference) * 12) + ' / year';

    if (Math.abs(difference) < 0.005) {
      el.whatifBudgetImpact.textContent = 'Move the slider to compare a different number of operating hours.';
    } else if (projectedRemaining >= 0) {
      const verb = difference > 0 ? 'drop' : 'rise';
      el.whatifBudgetImpact.textContent = 'Your bill would ' + verb + ' to ' + money(projected) +
        ' — still ' + money(projectedRemaining) + ' under budget.';
    } else {
      el.whatifBudgetImpact.textContent = 'Your bill would be ' + money(projected) + ' — ' +
        money(Math.abs(projectedRemaining)) + ' over budget.';
    }

    el.applyWhatifBtn.disabled = !changed;
    el.applyWhatifBtn.textContent = changed ? 'Apply new hours' : 'No changes to apply';
  }

  function renderWhatIf() {
    renderWhatIfOptions();
    updateWhatIf();
  }

  function loadWhatIf(id, hours) {
    if (!state.appliances.some((item) => item.id === id)) return;
    whatIfId = id;
    whatIfHours = clamp(Number(hours) || 0, 0, 24);
    renderWhatIfOptions();
    updateWhatIf();
    $('.whatif-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      el.whatifHours.focus({ preventScroll: true });
    }, 500);
  }

  /* ------------------------------------------------------------
     Render all
     ------------------------------------------------------------ */

  function renderAll() {
    ensureWhatIfSelection();
    renderStats();
    renderRanking();
    renderBudget();
    renderWhatIf();
  }

  /* ------------------------------------------------------------
     Modals
     ------------------------------------------------------------ */

  function openModal(modal) {
    if (!modal) return;
    lastFocusedElement = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    const focusTarget = $('[data-autofocus]', modal) || $('input, select, button.btn-primary, button', modal);
    if (focusTarget) {
      window.setTimeout(() => focusTarget.focus(), 30);
    }
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.hidden = true;
    if (modal === el.sortModal) stopSort();
    if (!$$('.modal').some((item) => !item.hidden)) {
      document.body.classList.remove('modal-open');
    }
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const open = $$('.modal').find((item) => !item.hidden);
    if (!open) return;
    const focusable = $$('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea, [tabindex]:not([tabindex="-1"])', open)
      .filter((item) => item.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ------------------------------------------------------------
     Appliance form
     ------------------------------------------------------------ */

  function renderIconPicker() {
    el.iconPicker.innerHTML = ICONS.map((icon) =>
      '<button type="button" class="icon-option' + (icon === selectedIcon ? ' is-selected' : '') +
      '" data-icon="' + escapeHtml(icon) + '" aria-label="Use icon ' + escapeHtml(icon) +
      '" aria-pressed="' + (icon === selectedIcon ? 'true' : 'false') + '">' + escapeHtml(icon) + '</button>'
    ).join('');
  }

  function selectIcon(icon) {
    selectedIcon = icon;
    $$('.icon-option', el.iconPicker).forEach((button) => {
      const active = button.dataset.icon === icon;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function updatePreview() {
    const watts = Number(el.applianceWatts.value);
    const hours = Number(el.applianceHours.value);
    if (Number.isFinite(watts) && watts > 0 && Number.isFinite(hours) && hours >= 0) {
      const monthlyKwh = (watts * hours / 1000) * state.days;
      el.previewKwh.textContent = kwh(monthlyKwh) + ' kWh';
      el.previewCost.textContent = money(monthlyKwh * state.rate);
    } else {
      el.previewKwh.textContent = '0.0 kWh';
      el.previewCost.textContent = money(0);
    }
  }

  function openAddModal() {
    el.applianceForm.reset();
    el.applianceId.value = '';
    el.applianceModalEyebrow.textContent = 'New appliance';
    el.applianceModalTitle.textContent = 'Add an appliance';
    el.applianceSubmit.textContent = 'Add appliance';
    el.applianceError.hidden = true;
    selectedIcon = ICONS[0];
    renderIconPicker();
    updatePreview();
    openModal(el.applianceModal);
  }

  function openEditModal(id) {
    const appliance = state.appliances.find((item) => item.id === id);
    if (!appliance) return;
    el.applianceForm.reset();
    el.applianceId.value = appliance.id;
    el.applianceName.value = appliance.name;
    el.applianceWatts.value = String(appliance.watts);
    el.applianceHours.value = String(appliance.hours);
    el.applianceModalEyebrow.textContent = 'Edit appliance';
    el.applianceModalTitle.textContent = appliance.name;
    el.applianceSubmit.textContent = 'Save changes';
    el.applianceError.hidden = true;
    selectedIcon = appliance.icon;
    renderIconPicker();
    updatePreview();
    openModal(el.applianceModal);
  }

  function submitAppliance(event) {
    event.preventDefault();
    const name = el.applianceName.value.trim();
    const watts = Number(el.applianceWatts.value);
    const hours = Number(el.applianceHours.value);

    let error = '';
    if (!name) error = 'Give the appliance a name.';
    else if (!Number.isFinite(watts) || watts <= 0) error = 'Wattage must be greater than zero.';
    else if (watts > 30000) error = 'Wattage looks too high. Use a value up to 30,000 W.';
    else if (!Number.isFinite(hours) || hours < 0 || hours > 24) error = 'Hours per day must be between 0 and 24.';

    if (error) {
      el.applianceError.textContent = error;
      el.applianceError.hidden = false;
      return;
    }

    el.applianceError.hidden = true;
    const id = el.applianceId.value;

    if (id) {
      const index = state.appliances.findIndex((item) => item.id === id);
      if (index === -1) return;
      state.appliances[index] = {
        ...state.appliances[index],
        name,
        icon: selectedIcon,
        watts,
        hours
      };
      saveState();
      closeModal(el.applianceModal);
      renderAll();
      showToast('Updated ' + name + '.');
    } else {
      const appliance = {
        id: makeId(),
        name,
        icon: selectedIcon,
        watts,
        hours,
        color: pickColor()
      };
      state.appliances.push(appliance);
      whatIfId = appliance.id;
      whatIfHours = appliance.hours;
      saveState();
      closeModal(el.applianceModal);
      renderAll();
      showToast('Added ' + name + ' to your ranking.');
    }
  }

  /* ------------------------------------------------------------
     Settings
     ------------------------------------------------------------ */

  function openSettings() {
    el.settingRate.value = String(state.rate);
    el.settingDays.value = String(state.days);
    el.settingBudget.value = String(state.budget);
    el.settingsError.hidden = true;
    openModal(el.settingsModal);
  }

  function submitSettings(event) {
    event.preventDefault();
    const rate = Number(el.settingRate.value);
    const days = Number(el.settingDays.value);
    const budget = Number(el.settingBudget.value);

    let error = '';
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) error = 'Rate must be between ₱0.01 and ₱100 per kWh.';
    else if (!Number.isFinite(days) || days < 1 || days > 31) error = 'Days must be between 1 and 31.';
    else if (!Number.isFinite(budget) || budget < 0) error = 'Budget cannot be negative.';

    if (error) {
      el.settingsError.textContent = error;
      el.settingsError.hidden = false;
      return;
    }

    el.settingsError.hidden = true;
    state.rate = rate;
    state.days = Math.round(days);
    state.budget = budget;
    saveState();
    closeModal(el.settingsModal);
    renderAll();
    showToast('Settings saved. Everything recalculated.');
  }

  function restoreSampleData(fromSettings) {
    const previous = JSON.parse(JSON.stringify(state));
    state = defaultState();
    whatIfId = null;
    whatIfHours = 0;
    saveState();
    renderAll();
    if (fromSettings) closeModal(el.settingsModal);
    showToast('Sample data restored.', {
      actionLabel: 'Undo',
      onAction: () => {
        state = previous;
        saveState();
        renderAll();
        showToast('Previous data restored.');
      }
    });
  }

  /* ------------------------------------------------------------
     Delete with undo
     ------------------------------------------------------------ */

  function removeAppliance(id) {
    const index = state.appliances.findIndex((item) => item.id === id);
    if (index === -1) return;
    const removed = state.appliances[index];
    state.appliances.splice(index, 1);
    if (whatIfId === id) {
      whatIfId = null;
      whatIfHours = 0;
    }
    saveState();
    renderAll();
    showToast('Removed ' + removed.name + '.', {
      actionLabel: 'Undo',
      onAction: () => {
        state.appliances.splice(Math.min(index, state.appliances.length), 0, removed);
        saveState();
        renderAll();
        showToast(removed.name + ' restored.');
      }
    });
  }

  /* ------------------------------------------------------------
     Selection sort visualizer
     ------------------------------------------------------------ */

  function buildSortSteps(items) {
    const arr = items.map((item) => ({ ...item }));
    const steps = [];
    let comparisons = 0;
    let swaps = 0;

    const snapshot = (extra) => ({
      arr: arr.map((item) => ({ ...item })),
      comparisons,
      swaps,
      ...extra
    });

    if (!arr.length) return steps;

    steps.push(snapshot({
      type: 'start',
      message: 'Starting in registration order. Selection sort will build the ranking from the top down.'
    }));

    for (let i = 0; i < arr.length - 1; i += 1) {
      let maxIndex = i;
      steps.push(snapshot({
        type: 'select',
        current: i,
        maxIndex,
        message: 'Pass ' + (i + 1) + ': assume ' + arr[i].name + ' is the highest in the unsorted portion.'
      }));

      for (let j = i + 1; j < arr.length; j += 1) {
        comparisons += 1;
        const isHigher = arr[j].monthlyKwh > arr[maxIndex].monthlyKwh;
        if (isHigher) maxIndex = j;
        steps.push(snapshot({
          type: 'compare',
          current: i,
          scan: j,
          maxIndex,
          message: isHigher
            ? arr[j].name + ' (' + kwh(arr[j].monthlyKwh) + ' kWh) becomes the new highest so far.'
            : arr[j].name + ' (' + kwh(arr[j].monthlyKwh) + ' kWh) does not beat ' +
              arr[maxIndex].name + '.'
        }));
      }

      if (maxIndex !== i) {
        const currentName = arr[i].name;
        const maxName = arr[maxIndex].name;
        steps.push(snapshot({
          type: 'swap',
          current: i,
          maxIndex,
          message: 'Swap ' + currentName + ' and ' + maxName + ' so ' + maxName +
            ' locks into position ' + (i + 1) + '.'
        }));
        const temp = arr[i];
        arr[i] = arr[maxIndex];
        arr[maxIndex] = temp;
        swaps += 1;
      }

      steps.push(snapshot({
        type: 'locked',
        locked: i,
        message: 'Position ' + (i + 1) + ' is locked: ' + arr[i].name + ' (' +
          kwh(arr[i].monthlyKwh) + ' kWh).'
      }));
    }

    steps.push(snapshot({
      type: 'done',
      locked: arr.length - 1,
      message: 'Ranking complete: ' + arr.map((item) => item.name).join(' → ') + '.'
    }));

    return steps;
  }

  function renderSortStep() {
    const step = sortState.steps[sortState.index];
    if (!step) return;

    const maxKwh = Math.max(...step.arr.map((item) => item.monthlyKwh), 1);

    el.sortRows.innerHTML = step.arr.map((item, position) => {
      let classes = 'sort-row';
      if (step.type === 'select') {
        if (position === step.current) classes += ' is-current';
        if (position === step.maxIndex) classes += ' is-max';
      } else if (step.type === 'compare') {
        if (position === step.current) classes += ' is-current';
        if (position === step.maxIndex) classes += ' is-max';
        else if (position === step.scan) classes += ' is-scan';
      } else if (step.type === 'swap') {
        if (position === step.current || position === step.maxIndex) classes += ' is-swap';
      } else if (step.type === 'locked' || step.type === 'done') {
        if (position <= step.locked) classes += ' is-locked';
      }

      return '<div class="' + classes + '">' +
        '<span class="sort-rank">' + String(position + 1).padStart(2, '0') + '</span>' +
        '<span class="sort-name" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.icon) + ' ' + escapeHtml(item.name) + '</span>' +
        '<span class="sort-track"><span class="sort-bar" style="width:' +
          clamp((item.monthlyKwh / maxKwh) * 100, 3, 100).toFixed(1) + '%;background:' + item.color + '"></span></span>' +
        '<span class="sort-kwh">' + kwh(item.monthlyKwh) + '</span>' +
      '</div>';
    }).join('');

    el.sortComparisons.textContent = String(step.comparisons);
    el.sortSwaps.textContent = String(step.swaps);
    el.sortMessage.textContent = step.message;

    const atEnd = sortState.index >= sortState.steps.length - 1;
    el.sortStepBtn.disabled = atEnd;
    if (atEnd) {
      stopSort();
      el.sortPlayLabel.textContent = 'Replay';
    } else if (!sortState.playing) {
      el.sortPlayLabel.textContent = 'Play';
    }
  }

  function openSortModal() {
    if (!state.appliances.length) {
      showToast('Add an appliance before visualizing the ranking.');
      return;
    }

    const items = calculatedList();
    sortState.steps = buildSortSteps(items);
    sortState.index = 0;
    renderSortStep();
    openModal(el.sortModal);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced && sortState.steps.length > 1) {
      startSort();
    }
  }

  function startSort() {
    if (!sortState.steps.length) return;
    if (sortState.index >= sortState.steps.length - 1) {
      sortState.index = 0;
      renderSortStep();
    }
    sortState.playing = true;
    el.sortPlayLabel.textContent = 'Pause';
    el.sortPlayBtn.setAttribute('aria-pressed', 'true');
    sortState.timer = window.setInterval(() => {
      if (sortState.index >= sortState.steps.length - 1) {
        stopSort();
        el.sortPlayLabel.textContent = 'Replay';
        return;
      }
      sortState.index += 1;
      renderSortStep();
    }, 720);
  }

  function stopSort() {
    sortState.playing = false;
    if (sortState.timer) {
      window.clearInterval(sortState.timer);
      sortState.timer = null;
    }
    el.sortPlayBtn.setAttribute('aria-pressed', 'false');
    if (el.sortPlayLabel.textContent === 'Pause') {
      el.sortPlayLabel.textContent = 'Play';
    }
  }

  function toggleSortPlayback() {
    if (sortState.playing) {
      stopSort();
    } else {
      startSort();
    }
  }

  function stepSort() {
    stopSort();
    if (sortState.index < sortState.steps.length - 1) {
      sortState.index += 1;
      renderSortStep();
    }
  }

  function resetSort() {
    stopSort();
    sortState.index = 0;
    renderSortStep();
    el.sortPlayLabel.textContent = 'Play';
  }

  /* ------------------------------------------------------------
     Toasts
     ------------------------------------------------------------ */

  function showToast(message, options = {}) {
    const toast = document.createElement('div');
    toast.className = 'toast';

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = options.icon || '✓';

    const text = document.createElement('div');
    text.className = 'toast-message';
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);

    let timer = null;
    const dismiss = () => {
      if (timer) window.clearTimeout(timer);
      toast.classList.add('is-leaving');
      window.setTimeout(() => toast.remove(), 240);
    };

    if (options.actionLabel && typeof options.onAction === 'function') {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'toast-action';
      action.textContent = options.actionLabel;
      action.addEventListener('click', () => {
        options.onAction();
        dismiss();
      });
      toast.appendChild(action);
    }

    el.toastStack.appendChild(toast);
    timer = window.setTimeout(dismiss, options.duration || 5600);
  }

  /* ------------------------------------------------------------
     Event wiring
     ------------------------------------------------------------ */

  function bindEvents() {
    // Settings
    [el.settingsBtn, el.rateChip, el.editBudgetBtn, el.budgetSettingsBtn].forEach((button) => {
      button.addEventListener('click', openSettings);
    });

    // Add appliance
    [el.addBtn, el.emptyAddBtn].forEach((button) => {
      button.addEventListener('click', openAddModal);
    });

    // Icon picker
    el.iconPicker.addEventListener('click', (event) => {
      const button = event.target.closest('.icon-option');
      if (button) selectIcon(button.dataset.icon);
    });

    // Live preview
    [el.applianceWatts, el.applianceHours].forEach((input) => {
      input.addEventListener('input', updatePreview);
    });

    // Forms
    el.applianceForm.addEventListener('submit', submitAppliance);
    el.settingsForm.addEventListener('submit', submitSettings);

    // Restore sample
    el.restoreBtn.addEventListener('click', () => restoreSampleData(false));
    el.resetDataBtn.addEventListener('click', () => restoreSampleData(true));

    // Ranking actions
    el.applianceList.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const id = button.dataset.id;
      if (button.dataset.action === 'edit') openEditModal(id);
      else if (button.dataset.action === 'delete') removeAppliance(id);
    });

    // What-if
    el.whatifAppliance.addEventListener('change', () => {
      whatIfId = el.whatifAppliance.value;
      const appliance = state.appliances.find((item) => item.id === whatIfId);
      whatIfHours = appliance ? appliance.hours : 0;
      updateWhatIf();
    });

    el.whatifHours.addEventListener('input', () => {
      whatIfHours = Number(el.whatifHours.value);
      updateWhatIf();
    });

    $$('.quick-set button').forEach((button) => {
      button.addEventListener('click', () => {
        whatIfHours = clamp(whatIfHours + Number(button.dataset.adjust), 0, 24);
        updateWhatIf();
      });
    });

    el.applyWhatifBtn.addEventListener('click', () => {
      const appliance = state.appliances.find((item) => item.id === whatIfId);
      if (!appliance) return;
      appliance.hours = whatIfHours;
      saveState();
      renderAll();
      showToast(appliance.name + ' now runs ' + hoursLabel(whatIfHours) + '.');
    });

    el.resetWhatifBtn.addEventListener('click', () => {
      const appliance = state.appliances.find((item) => item.id === whatIfId);
      if (!appliance) return;
      whatIfHours = appliance.hours;
      updateWhatIf();
    });

    // Quick take CTA
    el.quickTakeAction.addEventListener('click', () => {
      const id = el.quickTakeAction.dataset.id;
      const hours = Number(el.quickTakeAction.dataset.hours);
      if (!id) return;
      loadWhatIf(id, Number.isFinite(hours) ? hours : 0);
    });

    // Savings opportunity rows
    el.opportunityList.addEventListener('click', (event) => {
      const button = event.target.closest('.opp-try');
      if (!button) return;
      loadWhatIf(button.dataset.id, Number(button.dataset.hours));
    });

    // Sort visualizer
    el.visualizeBtn.addEventListener('click', openSortModal);
    el.sortPlayBtn.addEventListener('click', toggleSortPlayback);
    el.sortStepBtn.addEventListener('click', stepSort);
    el.sortResetBtn.addEventListener('click', resetSort);

    // Close buttons and backdrops
    $$('[data-close]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.close;
        closeModal(document.getElementById(id));
      });
    });

    // Keyboard
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const open = $$('.modal').filter((item) => !item.hidden).pop();
        if (open) closeModal(open);
      }
      trapFocus(event);
    });
  }

  /* ------------------------------------------------------------
     Init
     ------------------------------------------------------------ */

  function init() {
    renderIconPicker();
    bindEvents();
    renderAll();
  }

  init();
})();
