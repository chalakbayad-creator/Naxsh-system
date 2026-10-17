const searchInput = document.querySelector('#module-search');
const moduleCards = [...document.querySelectorAll('.module-card')];
const moduleGrid = document.querySelector('#module-grid');
const emptyState = document.querySelector('#empty-state');
const pageIndicator = document.querySelector('#page-indicator');
const previousPageButton = document.querySelector('#page-prev');
const nextPageButton = document.querySelector('#page-next');
const dashboardScreen = document.querySelector('#dashboard-screen');
const genericModuleScreen = document.querySelector('#generic-module-screen');
const ordersScreen = document.querySelector('#orders-screen');
const orderModal = document.querySelector('#order-modal');
const backButtons = [...document.querySelectorAll('[data-back-dashboard]')];
const PAGE_SIZE = 10;
let currentPage = 0;
let pageTransitioning = false;

function showOnlyScreen(screen) {
  dashboardScreen.hidden = screen !== 'dashboard';
  genericModuleScreen.hidden = screen !== 'module';
  ordersScreen.hidden = screen !== 'orders';
  orderModal.hidden = screen !== 'new-order';
}

function navigateToScreen(screen, state = {}, push = true) {
  showOnlyScreen(screen);
  if (push) history.pushState({ screen, ...state }, '', `#${screen}`);
}

function showDashboard(push = true) {
  navigateToScreen('dashboard', {}, push);
}

function openGenericModule(card, push = true) {
  const title = card.querySelector('strong').textContent.trim();
  const icon = card.querySelector('.module-icon').innerHTML;

  document.querySelector('#generic-body-title').textContent = title;
  document.querySelector('#generic-large-icon').innerHTML = icon;
  navigateToScreen('module', { moduleName: title }, push);
}

function openOrders(push = true) {
  navigateToScreen('orders', {}, push);
}

function filteredModules() {
  const query = searchInput.value.trim().toLocaleLowerCase('ku');
  return moduleCards.filter((card) =>
    card.dataset.name.toLocaleLowerCase('ku').includes(query)
  );
}

function renderPageIndicator(totalPages) {
  pageIndicator.replaceChildren();
  pageIndicator.hidden = totalPages <= 1;

  for (let page = 0; page < totalPages; page += 1) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `page-dot${page === currentPage ? ' is-active' : ''}`;
    dot.setAttribute('aria-label', `پەڕەی ${page + 1}`);
    dot.setAttribute('aria-current', page === currentPage ? 'page' : 'false');
    dot.addEventListener('click', () => changePage(page));
    pageIndicator.append(dot);
  }
}

function renderModules() {
  const matches = filteredModules();
  const totalPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages - 1);
  const firstCard = currentPage * PAGE_SIZE;
  const pageCards = matches.slice(firstCard, firstCard + PAGE_SIZE);
  const visibleCards = new Set(pageCards);

  moduleCards.forEach((card) => {
    card.hidden = !visibleCards.has(card);
  });

  moduleGrid.classList.toggle(
    'is-sparse-page',
    totalPages > 1 && pageCards.length > 0 && pageCards.length <= 5,
  );

  emptyState.classList.toggle('visible', matches.length === 0);
  previousPageButton.disabled = currentPage === 0;
  nextPageButton.disabled = currentPage >= totalPages - 1;
  moduleGrid.style.setProperty('--page-columns', Math.max(1, Math.min(5, pageCards.length)));
  moduleGrid.style.setProperty('--page-rows', Math.max(1, Math.ceil(pageCards.length / 5)));
  renderPageIndicator(totalPages);
}

function changePage(nextPage) {
  const totalPages = Math.max(1, Math.ceil(filteredModules().length / PAGE_SIZE));
  const targetPage = Math.max(0, Math.min(nextPage, totalPages - 1));
  if (pageTransitioning || targetPage === currentPage) return;

  pageTransitioning = true;
  const direction = targetPage > currentPage ? 'next' : 'previous';
  moduleGrid.classList.add(`page-leave-${direction}`);

  window.setTimeout(() => {
    currentPage = targetPage;
    renderModules();
    moduleGrid.classList.remove('page-leave-next', 'page-leave-previous');
    moduleGrid.classList.add(`page-enter-${direction}`);
    window.setTimeout(() => {
      moduleGrid.classList.remove('page-enter-next', 'page-enter-previous');
      pageTransitioning = false;
    }, 300);
  }, 120);
}

searchInput.addEventListener('input', () => {
  currentPage = 0;
  renderModules();
});

previousPageButton.addEventListener('click', () => {
  changePage(currentPage - 1);
});

nextPageButton.addEventListener('click', () => {
  changePage(currentPage + 1);
});

moduleCards.forEach((card) => {
  card.addEventListener('click', () => {
    if (card.dataset.screen === 'orders') openOrders();
    else openGenericModule(card);
  });
});

backButtons.forEach((button) => {
  button.addEventListener('click', () => showDashboard());
});

window.addEventListener('popstate', (event) => {
  const screen = event.state?.screen || 'dashboard';
  if (screen === 'orders') {
    openOrders(false);
  } else if (screen === 'new-order') {
    navigateToScreen('new-order', {}, false);
  } else if (screen === 'module' && event.state?.moduleName) {
    const card = moduleCards.find(
      (item) => item.querySelector('strong').textContent.trim() === event.state.moduleName
    );
    if (card) openGenericModule(card, false);
    else showDashboard(false);
  } else {
    showDashboard(false);
  }
});

const orderRows = [...document.querySelectorAll('.order-row')];
const pipelineButtons = [...document.querySelectorAll('.order-pipeline button')];
const ordersSearch = document.querySelector('#orders-search');
const ordersResultCount = document.querySelector('#orders-result-count');
const orderForm = document.querySelector('#order-form');
const customerCombobox = document.querySelector('#customer-combobox');
const customerSearchInput = document.querySelector('#customer-search-input');
const customerDropdown = document.querySelector('#customer-dropdown');
const customerOptions = document.querySelector('#customer-options');
const selectedCustomerId = document.querySelector('#selected-customer-id');
const customerPhone = document.querySelector('#customer-phone');
const customerAddress = document.querySelector('#customer-address');
const customerChannel = document.querySelector('#customer-channel');
const customerModal = document.querySelector('#customer-modal');
const customerForm = document.querySelector('#customer-form');
const formItems = document.querySelector('#form-items');
const formItemsTable = document.querySelector('.pos-items-panel .form-items-table');
const warehousePicker = document.querySelector('#warehouse-picker');
const deadlinePicker = document.querySelector('#deadline-picker');
const deadlineTrigger = document.querySelector('#deadline-trigger');
const deadlinePopover = document.querySelector('#deadline-popover');
const deadlineInput = document.querySelector('#deadline-input');
const deadlineDisplay = document.querySelector('#deadline-display');
const calendarTitle = document.querySelector('#calendar-title');
const calendarDays = document.querySelector('#calendar-days');
const urgentOrder = document.querySelector('#urgent-order');
const deleteItemConfirm = document.querySelector('#delete-item-confirm');
const priceEditConfirm = document.querySelector('#price-edit-confirm');
const discountInput = document.querySelector('#discount-input');
const subtotalValue = document.querySelector('#subtotal-value');
const discountValue = document.querySelector('#discount-value');
const grandTotalValue = document.querySelector('#grand-total-value');
const discountUnit = document.querySelector('#discount-unit');
const discountModeButtons = [...document.querySelectorAll('[data-discount-mode]')];
let pendingDeleteItem = null;
let pendingPriceInput = null;
let discountMode = 'percent';
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

const customers = [
  { id: 'CUS-1001', name: 'چاپخانەی ڕۆژ', phone: '0750 123 4567', address: 'هەولێر، شەقامی 100 مەتری', channel: 'تەلەفۆن' },
  { id: 'CUS-1002', name: 'کۆمپانیای ئاسۆ', phone: '0751 222 9080', address: 'سلێمانی، سالم', channel: 'واتساپ' },
  { id: 'CUS-1003', name: 'مارکێتی دڵنیا', phone: '0770 440 2211', address: 'هەولێر، عەنکاوە', channel: 'تەلەفۆن' },
  { id: 'CUS-1004', name: 'ڕێکلامی شاری', phone: '0750 884 1100', address: 'دهۆک، ناوەندی شار', channel: 'ئیمەیڵ' },
  { id: 'CUS-1005', name: 'کافێی مۆکا', phone: '0750 310 9060', address: 'هەولێر، گولان', channel: 'واتساپ' }
];

function setCustomerDropdown(open) {
  customerDropdown.hidden = !open;
  customerSearchInput.setAttribute('aria-expanded', String(open));
  customerCombobox.classList.toggle('is-open', open);
}

function clearSelectedCustomer() {
  selectedCustomerId.value = '';
  customerPhone.value = '';
  customerAddress.value = '';
  customerChannel.value = '';
}

function selectCustomer(customer) {
  selectedCustomerId.value = customer.id;
  customerSearchInput.value = customer.name;
  customerSearchInput.setCustomValidity('');
  customerPhone.value = customer.phone;
  customerAddress.value = customer.address;
  customerChannel.value = customer.channel;
  setCustomerDropdown(false);
}

function renderCustomerOptions(query = '') {
  const normalizedQuery = query.trim().toLocaleLowerCase('ku');
  const matches = customers.filter((customer) =>
    `${customer.name} ${customer.phone}`.toLocaleLowerCase('ku').includes(normalizedQuery)
  );

  customerOptions.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement('div');
    empty.className = 'customer-empty';
    empty.textContent = 'هیچ کڕیارێک نەدۆزرایەوە';
    customerOptions.append(empty);
    return;
  }

  matches.forEach((customer) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'customer-option';
    option.setAttribute('role', 'option');
    option.dataset.customerId = customer.id;

    const avatar = document.createElement('span');
    avatar.textContent = customer.name.slice(0, 2);
    const text = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = customer.name;
    const meta = document.createElement('small');
    meta.textContent = `${customer.phone} • ${customer.channel}`;
    text.append(name, meta);
    option.append(avatar, text);
    option.addEventListener('click', () => selectCustomer(customer));
    customerOptions.append(option);
  });
}

customerSearchInput.addEventListener('focus', () => {
  renderCustomerOptions(customerSearchInput.value);
  setCustomerDropdown(true);
});

customerSearchInput.addEventListener('input', () => {
  clearSelectedCustomer();
  customerSearchInput.setCustomValidity('تکایە کڕیارێک لە لیستەکە هەڵبژێرە');
  renderCustomerOptions(customerSearchInput.value);
  setCustomerDropdown(true);
});

document.addEventListener('click', (event) => {
  if (!customerCombobox.contains(event.target)) setCustomerDropdown(false);
});

function setCustomerModal(open) {
  customerModal.hidden = !open;
  if (open) customerForm.elements.name.focus();
}

document.querySelector('#add-customer-option').addEventListener('click', () => {
  setCustomerDropdown(false);
  setCustomerModal(true);
});
document.querySelector('#close-customer-modal').addEventListener('click', () => setCustomerModal(false));
document.querySelector('#cancel-customer').addEventListener('click', () => setCustomerModal(false));
customerModal.addEventListener('click', (event) => {
  if (event.target === customerModal) setCustomerModal(false);
});

customerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(customerForm);
  const customer = {
    id: `CUS-${1000 + customers.length + 1}`,
    name: data.get('name').trim(),
    phone: data.get('phone').trim(),
    address: data.get('address').trim(),
    channel: data.get('channel')
  };
  customers.unshift(customer);
  customerForm.reset();
  setCustomerModal(false);
  selectCustomer(customer);
});

function selectOrder(row) {
  orderRows.forEach((item) => item.classList.toggle('is-selected', item === row));
  document.querySelector('#detail-id').textContent = row.dataset.id;
  document.querySelector('#detail-customer').textContent = row.dataset.customer;
  document.querySelector('#detail-phone').textContent = row.dataset.phone;
  document.querySelector('#detail-item').textContent = row.dataset.item;
  document.querySelector('#detail-deadline').textContent = row.dataset.deadline;
}

function filterOrders() {
  const stage = document.querySelector('.order-pipeline button.is-active')?.dataset.stage || 'all';
  const query = ordersSearch.value.trim().toLocaleLowerCase('ku');
  let visible = 0;

  orderRows.forEach((row) => {
    const matchesStage = stage === 'all' || row.dataset.stage === stage;
    const matchesQuery = row.textContent.toLocaleLowerCase('ku').includes(query);
    row.hidden = !(matchesStage && matchesQuery);
    if (!row.hidden) visible += 1;
  });

  ordersResultCount.textContent = `${visible} ئۆردەر`;
}

orderRows.forEach((row) => row.addEventListener('click', () => selectOrder(row)));
pipelineButtons.forEach((button) => button.addEventListener('click', () => {
  pipelineButtons.forEach((item) => item.classList.toggle('is-active', item === button));
  filterOrders();
}));
ordersSearch.addEventListener('input', filterOrders);

function setOrderModal(open) {
  if (open) {
    renderCustomerOptions();
    navigateToScreen('new-order');
    customerSearchInput.focus();
  } else {
    setCustomerDropdown(false);
    openOrders();
  }
}

function setDeadlinePopover(open) {
  deadlinePopover.hidden = !open;
  deadlineTrigger.setAttribute('aria-expanded', String(open));
  deadlinePicker.classList.toggle('is-open', open);
}

function formatDeadline(value) {
  if (!value) return 'بەروار هەڵبژێرە';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function setDeadline(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  deadlineInput.value = `${year}-${month}-${day}`;
  deadlineDisplay.textContent = formatDeadline(deadlineInput.value);
  deadlineTrigger.classList.add('has-value');
  calendarMonth = new Date(year, date.getMonth(), 1);
  renderCalendar();
  setDeadlinePopover(false);
}

const calendarMonthNames = [
  'کانوونی دووەم','شوبات','ئادار','نیسان','ئایار','حوزەیران',
  'تەمموز','ئاب','ئەیلوول','تشرینی یەکەم','تشرینی دووەم','کانوونی یەکەم'
];

function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const selectedValue = deadlineInput.value;
  const today = new Date();

  calendarTitle.textContent = `${calendarMonthNames[month]} ${year}`;
  calendarDays.replaceChildren();

  for (let i = 0; i < firstDay; i += 1) {
    const spacer = document.createElement('span');
    spacer.className = 'calendar-spacer';
    calendarDays.append(spacer);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(day);
    const value = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    button.classList.toggle('is-selected', value === selectedValue);
    button.classList.toggle('is-today', day === today.getDate() && month === today.getMonth() && year === today.getFullYear());
    button.addEventListener('click', () => setDeadline(new Date(year, month, day)));
    calendarDays.append(button);
  }
}

deadlineTrigger.addEventListener('click', () => {
  renderCalendar();
  setDeadlinePopover(deadlinePopover.hidden);
});
document.querySelector('#calendar-prev').addEventListener('click', () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  renderCalendar();
});
document.querySelector('#calendar-next').addEventListener('click', () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  renderCalendar();
});
document.querySelectorAll('.deadline-quick-options button').forEach((button) => {
  button.addEventListener('click', () => {
    const date = new Date();
    date.setDate(date.getDate() + Number(button.dataset.days));
    setDeadline(date);
  });
});
document.addEventListener('click', (event) => {
  if (!deadlinePicker.contains(event.target)) setDeadlinePopover(false);
});

urgentOrder.addEventListener('change', () => {
  urgentOrder.closest('.urgent-toggle').classList.toggle('is-urgent', urgentOrder.checked);
});

document.querySelector('#new-order-button').addEventListener('click', () => setOrderModal(true));
document.querySelector('#close-order-modal').addEventListener('click', () => setOrderModal(false));
document.querySelector('#cancel-order').addEventListener('click', () => setOrderModal(false));

function addOrderItem(productName = '', productPrice = 0) {
  const item = document.querySelector('.form-item').cloneNode(true);
  item.querySelector('[name="item"]').value = productName;
  item.querySelector('[name="itemNote"]').value = '';
  item.querySelector('[name="quantity"]').value = '1';
  const price = item.querySelector('[name="price"]');
  price.value = String(productPrice);
  price.dataset.originalPrice = String(productPrice);
  price.readOnly = true;
  item.classList.remove('is-price-editing');
  formItems.append(item);
  formItems.scrollTo({ top: formItems.scrollHeight, behavior: 'smooth' });
  updateOrderTotals();
}

function setWarehousePicker(open) {
  warehousePicker.hidden = !open;
  formItemsTable.hidden = open;
  document.querySelector('#add-order-item').classList.toggle('is-active', open);
}

document.querySelector('#add-order-item').addEventListener('click', () => {
  setWarehousePicker(true);
});
document.querySelector('#close-warehouse-picker').addEventListener('click', () => setWarehousePicker(false));
document.querySelectorAll('.warehouse-product').forEach((product) => {
  product.addEventListener('click', () => {
    addOrderItem(product.dataset.product, Number(product.dataset.price));
    setWarehousePicker(false);
  });
});

const moneyFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function moneyMarkup(value) {
  return `${moneyFormatter.format(Math.max(0, Math.round(value)))} <i>IQD</i>`;
}

function updateOrderTotals() {
  const subtotal = [...formItems.querySelectorAll('.form-item')].reduce((sum, item) => {
    const quantity = Number(item.querySelector('[name="quantity"]').value) || 0;
    const price = Number(item.querySelector('[name="price"]').value) || 0;
    return sum + (quantity * price);
  }, 0);
  const discountRaw = Math.max(0, Number(discountInput.value) || 0);
  const discountAmount = discountMode === 'percent'
    ? subtotal * Math.min(100, discountRaw) / 100
    : Math.min(subtotal, discountRaw);
  subtotalValue.innerHTML = moneyMarkup(subtotal);
  discountValue.innerHTML = moneyMarkup(discountAmount);
  grandTotalValue.innerHTML = moneyMarkup(subtotal - discountAmount);
}

function setPriceConfirm(open, input = null) {
  pendingPriceInput = open ? input : null;
  priceEditConfirm.hidden = !open;
}

function finishPriceEdit(input) {
  input.readOnly = true;
  input.closest('.form-item').classList.remove('is-price-editing');
  updateOrderTotals();
}

function setDeleteConfirm(open, item = null) {
  pendingDeleteItem = open ? item : null;
  deleteItemConfirm.hidden = !open;
}

formItems.addEventListener('click', (event) => {
  const editButton = event.target.closest('.edit-item-price');
  if (editButton) {
    setPriceConfirm(true, editButton.closest('.form-item').querySelector('[name="price"]'));
    return;
  }
  const deleteButton = event.target.closest('.delete-order-item');
  if (deleteButton) setDeleteConfirm(true, deleteButton.closest('.form-item'));
});
formItems.addEventListener('input', (event) => {
  if (event.target.matches('[name="quantity"], [name="price"]')) updateOrderTotals();
});
formItems.addEventListener('keydown', (event) => {
  if (event.target.matches('[name="price"]') && event.key === 'Enter') {
    event.preventDefault();
    finishPriceEdit(event.target);
  }
});
formItems.addEventListener('focusout', (event) => {
  if (event.target.matches('[name="price"]') && !event.target.readOnly) finishPriceEdit(event.target);
});
discountInput.addEventListener('input', updateOrderTotals);
discountModeButtons.forEach((button) => button.addEventListener('click', () => {
  discountMode = button.dataset.discountMode;
  discountModeButtons.forEach((item) => item.classList.toggle('is-active', item === button));
  discountUnit.textContent = discountMode === 'percent' ? '%' : 'IQD';
  discountInput.max = discountMode === 'percent' ? '100' : '';
  discountInput.value = '0';
  updateOrderTotals();
}));
document.querySelector('#cancel-price-edit').addEventListener('click', () => setPriceConfirm(false));
document.querySelector('#confirm-price-edit').addEventListener('click', () => {
  if (!pendingPriceInput) return;
  const input = pendingPriceInput;
  setPriceConfirm(false);
  input.readOnly = false;
  input.closest('.form-item').classList.add('is-price-editing');
  input.focus();
  input.select();
});
priceEditConfirm.addEventListener('click', (event) => {
  if (event.target === priceEditConfirm) setPriceConfirm(false);
});
document.querySelector('#cancel-delete-item').addEventListener('click', () => setDeleteConfirm(false));
document.querySelector('#confirm-delete-item').addEventListener('click', () => {
  if (!pendingDeleteItem) return;
  const rows = formItems.querySelectorAll('.form-item');
  if (rows.length === 1) {
    pendingDeleteItem.querySelector('[name="item"]').value = '';
    pendingDeleteItem.querySelector('[name="itemNote"]').value = '';
    pendingDeleteItem.querySelector('[name="quantity"]').value = '1';
    pendingDeleteItem.querySelector('[name="price"]').value = '0';
  } else {
    pendingDeleteItem.remove();
  }
  setDeleteConfirm(false);
  updateOrderTotals();
});
deleteItemConfirm.addEventListener('click', (event) => {
  if (event.target === deleteItemConfirm) setDeleteConfirm(false);
});

orderForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!selectedCustomerId.value) {
    customerSearchInput.setCustomValidity('تکایە کڕیارێک لە لیستەکە هەڵبژێرە');
    customerSearchInput.reportValidity();
    renderCustomerOptions(customerSearchInput.value);
    setCustomerDropdown(true);
    return;
  }
  setOrderModal(false);
  orderForm.reset();
  clearSelectedCustomer();
  deadlineDisplay.textContent = 'بەروار هەڵبژێرە';
  deadlineTrigger.classList.remove('has-value');
  urgentOrder.closest('.urgent-toggle').classList.remove('is-urgent');
  discountInput.value = '0';
  updateOrderTotals();
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchInput.focus();
  }
});

renderModules();
const initialScreen = window.location.hash.slice(1);
const restoredScreen = initialScreen === 'orders' || initialScreen === 'new-order' ? initialScreen : 'dashboard';
showOnlyScreen(restoredScreen);
history.replaceState({ screen: restoredScreen }, '', `#${restoredScreen}`);
