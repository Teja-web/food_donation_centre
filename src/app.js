import {
  DONATION_STATUSES,
  OPERATION_STATUSES,
  REQUEST_STATUSES,
  allocateDonationToRequest,
  createDonation,
  createRecipientRequest,
  deriveNotifications,
  getAvailableInventory,
  getInventoryItems,
  getReportSummary,
  reviewDonation,
  statusLabel,
  syncRequestAfterDonationUpdate,
  updateOperationStatus,
  validateDonationInput,
  validateRecipientRequestInput,
} from "./domain.js";
import { createAppStateRepository } from "./repository.js";

const donationForm = document.querySelector("#donation-form");
const donationFormStatus = document.querySelector("#form-status");
const recipientForm = document.querySelector("#recipient-form");
const recipientFormStatus = document.querySelector("#recipient-form-status");
const donorHistory = document.querySelector("#donor-history");
const adminReview = document.querySelector("#admin-review");
const inventoryList = document.querySelector("#inventory-list");
const inventoryFilter = document.querySelector("#inventory-filter");
const requestList = document.querySelector("#request-list");
const allocationList = document.querySelector("#allocation-list");
const operationsList = document.querySelector("#operations-list");
const notificationsList = document.querySelector("#notifications-list");
const reportsList = document.querySelector("#reports-list");
const reportDonationFilter = document.querySelector("#report-donation-filter");
const reportRequestFilter = document.querySelector("#report-request-filter");
const reportOperationFilter = document.querySelector("#report-operation-filter");
const seedDemoButton = document.querySelector("#seed-demo");

const repository = createAppStateRepository();
let state = repository.load();

function saveState() {
  repository.save(state);
}

function setFormErrors(form, errors) {
  form.querySelectorAll("[data-error]").forEach((node) => node.remove());
  form.querySelectorAll(".invalid").forEach((node) => node.classList.remove("invalid"));

  Object.entries(errors).forEach(([name, message]) => {
    const field = form.elements.namedItem(name);
    if (!field) return;

    field.classList.add("invalid");
    const error = document.createElement("span");
    error.className = "field-error";
    error.dataset.error = name;
    error.textContent = message;
    field.closest("label").append(error);
  });
}

function handleDonationSubmit(event) {
  event.preventDefault();
  const input = Object.fromEntries(new FormData(donationForm).entries());
  const preview = validateDonationInput(input);
  setFormErrors(donationForm, preview.errors);

  if (!preview.valid) {
    setStatus(donationFormStatus, "Fix the highlighted donation fields before submitting.", "error");
    return;
  }

  const result = createDonation(input);
  state = {
    ...state,
    donations: [result.donation, ...state.donations],
  };
  saveState();
  donationForm.reset();
  setStatus(donationFormStatus, "Donation submitted for admin review.", "success");
  render();
}

function handleRecipientSubmit(event) {
  event.preventDefault();
  const input = Object.fromEntries(new FormData(recipientForm).entries());
  const preview = validateRecipientRequestInput(input);
  setFormErrors(recipientForm, preview.errors);

  if (!preview.valid) {
    setStatus(recipientFormStatus, "Fix the highlighted recipient fields before submitting.", "error");
    return;
  }

  const result = createRecipientRequest(input);
  state = {
    ...state,
    recipientRequests: [result.request, ...state.recipientRequests],
  };
  saveState();
  recipientForm.reset();
  setStatus(recipientFormStatus, "Recipient request submitted for allocation.", "success");
  render();
}

function setStatus(target, message, tone) {
  target.textContent = message;
  target.className = `form-status ${tone}`;
}

function updateDonation(id, updater) {
  state = {
    ...state,
    donations: state.donations.map((donation) =>
      donation.id === id ? updater(donation) : donation,
    ),
  };
  saveState();
  render();
}

function applyAllocation(donationId, requestId, note) {
  const donation = state.donations.find((item) => item.id === donationId);
  const request = state.recipientRequests.find((item) => item.id === requestId);
  const result = allocateDonationToRequest(donation, request, note);

  state = {
    ...state,
    donations: state.donations.map((item) =>
      item.id === donationId ? result.donation : item,
    ),
    recipientRequests: state.recipientRequests.map((item) =>
      item.id === requestId ? result.request : item,
    ),
  };
  saveState();
  render();
}

function applyOperationUpdate(donationId, status, note) {
  const updatedAt = new Date();
  let updatedDonation;

  state = {
    ...state,
    donations: state.donations.map((donation) => {
      if (donation.id !== donationId) return donation;
      updatedDonation = updateOperationStatus(donation, status, note, updatedAt);
      return updatedDonation;
    }),
  };

  if (updatedDonation) {
    state = {
      ...state,
      recipientRequests: state.recipientRequests.map((request) =>
        syncRequestAfterDonationUpdate(request, updatedDonation, updatedAt),
      ),
    };
  }

  saveState();
  render();
}

function handleReviewClick(event) {
  const button = event.target.closest("[data-review]");
  if (!button) return;

  const card = button.closest("[data-donation-id]");
  const donation = state.donations.find((item) => item.id === card.dataset.donationId);
  if (!donation) return;

  const reasonField = card.querySelector("[name='reviewReason']");
  const reason = reasonField.value;

  try {
    updateDonation(donation.id, (current) => reviewDonation(current, button.dataset.review, reason));
  } catch (error) {
    reasonField.classList.add("invalid");
    const feedback = card.querySelector("[data-card-feedback]");
    feedback.textContent = error.message;
  }
}

function handleAllocationClick(event) {
  const button = event.target.closest("[data-allocate]");
  if (!button) return;

  const card = button.closest("[data-donation-id]");
  const requestField = card.querySelector("[name='requestId']");
  const noteField = card.querySelector("[name='allocationNote']");

  try {
    applyAllocation(card.dataset.donationId, requestField.value, noteField.value);
  } catch (error) {
    const feedback = card.querySelector("[data-card-feedback]");
    feedback.textContent = error.message;
  }
}

function handleOperationClick(event) {
  const button = event.target.closest("[data-operation]");
  if (!button) return;

  const card = button.closest("[data-donation-id]");
  const note = card.querySelector("[name='operationNote']").value;

  try {
    applyOperationUpdate(card.dataset.donationId, button.dataset.operation, note);
  } catch (error) {
    const feedback = card.querySelector("[data-card-feedback]");
    feedback.textContent = error.message;
  }
}

function donationMeta(donation) {
  return `${donation.quantity} ${donation.unit} | Expires ${formatDateTime(
    donation.expiryAt,
  )} | ${donation.pickupLocation}`;
}

function requestMeta(request) {
  return `${request.quantityNeeded} ${request.unit} | ${request.urgency} | ${statusLabel(
    request.fulfillmentPreference,
  )}`;
}

function renderDonationCard(donation, options = {}) {
  const card = document.createElement("article");
  card.className = "item-card";
  card.dataset.donationId = donation.id;

  const linkedRequest = state.recipientRequests.find(
    (request) => request.id === donation.recipientRequestId,
  );
  const reason =
    donation.statusReason && donation.status !== DONATION_STATUSES.APPROVED
      ? `<p class="reason">${escapeHtml(donation.statusReason)}</p>`
      : "";
  const allocation =
    linkedRequest
      ? `<p class="link-note">Allocated to ${escapeHtml(linkedRequest.recipientName)}</p>`
      : "";
  const actions = options.review
    ? `<textarea name="reviewReason" rows="2" placeholder="Reason for rejection or change request"></textarea>
       <p class="card-feedback" data-card-feedback></p>
       <div class="button-row">
         <button class="primary-button small" type="button" data-review="approve">Approve</button>
         <button class="secondary-button small" type="button" data-review="request_changes">Request changes</button>
         <button class="danger-button small" type="button" data-review="reject">Reject</button>
       </div>`
    : "";

  card.innerHTML = `
    <div class="card-title-row">
      <h3>${escapeHtml(donation.foodType)}</h3>
      <span class="status-pill ${donation.status}">${statusLabel(donation.status)}</span>
    </div>
    <p>${escapeHtml(donationMeta(donation))}</p>
    <dl>
      <div><dt>Donor</dt><dd>${escapeHtml(donation.donorName)}</dd></div>
      <div><dt>Contact</dt><dd>${escapeHtml(donation.contact)}</dd></div>
      <div><dt>Available</dt><dd>${escapeHtml(donation.availabilityWindow)}</dd></div>
    </dl>
    ${donation.storageNotes ? `<p>${escapeHtml(donation.storageNotes)}</p>` : ""}
    ${allocation}
    ${reason}
    ${actions}
  `;

  return card;
}

function renderRequestCard(request) {
  const card = document.createElement("article");
  card.className = "item-card";
  card.dataset.requestId = request.id;

  const linkedDonation = state.donations.find((donation) => donation.id === request.allocatedDonationId);
  const allocation = linkedDonation
    ? `<p class="link-note">Allocated inventory: ${escapeHtml(linkedDonation.foodType)}</p>`
    : "";

  card.innerHTML = `
    <div class="card-title-row">
      <h3>${escapeHtml(request.recipientName)}</h3>
      <span class="status-pill ${request.status}">${statusLabel(request.status)}</span>
    </div>
    <p>${escapeHtml(requestMeta(request))}</p>
    <dl>
      <div><dt>Contact</dt><dd>${escapeHtml(request.recipientContact)}</dd></div>
      <div><dt>Food</dt><dd>${escapeHtml(request.requestedFood)}</dd></div>
      <div><dt>Preference</dt><dd>${statusLabel(request.fulfillmentPreference)}</dd></div>
    </dl>
    ${request.notes ? `<p>${escapeHtml(request.notes)}</p>` : ""}
    ${allocation}
  `;

  return card;
}

function renderAllocationCard(donation, openRequests) {
  const card = renderDonationCard(donation);
  const requestOptions = openRequests
    .map(
      (request) =>
        `<option value="${escapeHtml(request.id)}">${escapeHtml(request.recipientName)} - ${escapeHtml(
          request.requestedFood,
        )}</option>`,
    )
    .join("");

  card.innerHTML += `
    <label>
      Recipient request
      <select name="requestId">${requestOptions}</select>
    </label>
    <label>
      Allocation note
      <textarea name="allocationNote" rows="2" placeholder="Pickup, delivery, or packing note"></textarea>
    </label>
    <p class="card-feedback" data-card-feedback></p>
    <button class="primary-button small" type="button" data-allocate>Allocate</button>
  `;

  return card;
}

function renderOperationCard(donation) {
  const card = renderDonationCard(donation);
  card.innerHTML += `
    <label>
      Operations note
      <textarea name="operationNote" rows="2" placeholder="Pickup or delivery update"></textarea>
    </label>
    <p class="card-feedback" data-card-feedback></p>
    <div class="button-row">
      <button class="secondary-button small" type="button" data-operation="${OPERATION_STATUSES.PICKED_UP}">Picked up</button>
      <button class="primary-button small" type="button" data-operation="${OPERATION_STATUSES.DELIVERED}">Delivered</button>
      <button class="secondary-button small" type="button" data-operation="${OPERATION_STATUSES.EXPIRED}">Expired</button>
      <button class="danger-button small" type="button" data-operation="${OPERATION_STATUSES.CANCELLED}">Cancel</button>
    </div>
  `;

  return card;
}

function renderEmpty(target, message) {
  target.innerHTML = `<p class="empty-state">${message}</p>`;
}

function renderDonorHistory() {
  donorHistory.innerHTML = "";
  if (state.donations.length === 0) {
    renderEmpty(donorHistory, "No donations submitted yet.");
    return;
  }

  state.donations.forEach((donation) => donorHistory.append(renderDonationCard(donation)));
}

function renderAdminReview() {
  adminReview.innerHTML = "";
  const pending = state.donations.filter(
    (donation) => donation.status === DONATION_STATUSES.PENDING_REVIEW,
  );

  if (pending.length === 0) {
    renderEmpty(adminReview, "No donations are waiting for review.");
    return;
  }

  pending.forEach((donation) => adminReview.append(renderDonationCard(donation, { review: true })));
}

function renderInventory() {
  inventoryList.innerHTML = "";
  const items = getInventoryItems(state.donations, inventoryFilter.value);

  if (items.length === 0) {
    renderEmpty(inventoryList, "No inventory items match this filter.");
    return;
  }

  items.forEach((item) => {
    const card = renderDonationCard(item);
    if (item.nearExpiry) {
      const warning = document.createElement("p");
      warning.className = "expiry-warning";
      warning.textContent = "Near expiry - prioritize for allocation.";
      card.append(warning);
    }
    inventoryList.append(card);
  });
}

function renderRequests() {
  requestList.innerHTML = "";
  if (state.recipientRequests.length === 0) {
    renderEmpty(requestList, "No recipient requests submitted yet.");
    return;
  }

  state.recipientRequests.forEach((request) => requestList.append(renderRequestCard(request)));
}

function renderAllocation() {
  allocationList.innerHTML = "";
  const inventory = getAvailableInventory(state.donations);
  const openRequests = state.recipientRequests.filter(
    (request) => request.status === REQUEST_STATUSES.OPEN,
  );

  if (inventory.length === 0 || openRequests.length === 0) {
    renderEmpty(allocationList, "Approved inventory and open recipient requests are both required.");
    return;
  }

  inventory.forEach((donation) => allocationList.append(renderAllocationCard(donation, openRequests)));
}

function renderOperations() {
  operationsList.innerHTML = "";
  const actionable = state.donations.filter((donation) =>
    [DONATION_STATUSES.APPROVED, DONATION_STATUSES.ALLOCATED].includes(donation.status),
  );

  if (actionable.length === 0) {
    renderEmpty(operationsList, "No approved or allocated inventory needs operations action.");
    return;
  }

  actionable.forEach((donation) => operationsList.append(renderOperationCard(donation)));
}

function renderNotifications() {
  notificationsList.innerHTML = "";
  const notifications = deriveNotifications(state.donations, state.recipientRequests);

  if (notifications.length === 0) {
    renderEmpty(notificationsList, "No pending alerts.");
    return;
  }

  notifications.forEach((notification) => {
    const item = document.createElement("article");
    item.className = `notice ${notification.tone}`;
    item.innerHTML = `
      <h3>${escapeHtml(notification.title)}</h3>
      <p>${escapeHtml(notification.message)}</p>
    `;
    notificationsList.append(item);
  });
}

function renderReports() {
  const summary = getReportSummary(state.donations, state.recipientRequests, new Date(), {
    donationStatus: reportDonationFilter.value,
    requestStatus: reportRequestFilter.value,
    operationStatus: reportOperationFilter.value,
  });
  const metrics = [
    ["Total donations", summary.totalDonations],
    ["Pending review", summary.pendingReview],
    ["Approved quantity", summary.approvedQuantity],
    ["Allocated quantity", summary.allocatedQuantity],
    ["Delivered quantity", summary.deliveredQuantity],
    ["Expired items", summary.expiredItems],
    ["Rejected items", summary.rejectedItems],
    ["Open requests", summary.openRequests],
    ["Fulfilled requests", summary.fulfilledRequests],
  ];

  reportsList.innerHTML = metrics
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `,
    )
    .join("");
}

function render() {
  renderDonorHistory();
  renderAdminReview();
  renderInventory();
  renderRequests();
  renderAllocation();
  renderOperations();
  renderNotifications();
  renderReports();
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function seedDemoData() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 18 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const pending = createDonation(
    {
      donorName: "Green Bowl Kitchen",
      contact: "+91 90000 11111",
      foodType: "Cooked rice meals",
      quantity: 80,
      unit: "meals",
      expiryAt: tomorrow.toISOString().slice(0, 16),
      pickupLocation: "MG Road community kitchen",
      availabilityWindow: "Today, 6 PM - 8 PM",
      storageNotes: "Packed and refrigerated.",
    },
    now,
  ).donation;

  const approved = reviewDonation(
    createDonation(
      {
        donorName: "Fresh Mart",
        contact: "+91 90000 22222",
        foodType: "Vegetable packs",
        quantity: 30,
        unit: "packages",
        expiryAt: nextWeek.toISOString().slice(0, 16),
        pickupLocation: "Central Market",
        availabilityWindow: "Tomorrow, 9 AM - 11 AM",
        storageNotes: "Keep cool and dry.",
      },
      now,
    ).donation,
    "approve",
    "",
    now,
  );

  const request = createRecipientRequest(
    {
      recipientName: "Sunrise Shelter",
      recipientContact: "+91 90000 33333",
      requestedFood: "Cooked meals",
      quantityNeeded: 50,
      requestUnit: "meals",
      urgency: "High",
      fulfillmentPreference: "delivery",
      notes: "Needed for dinner service.",
    },
    now,
  ).request;

  state = {
    ...state,
    donations: [pending, approved, ...state.donations],
    recipientRequests: [request, ...state.recipientRequests],
  };
  saveState();
  render();
}

donationForm.addEventListener("submit", handleDonationSubmit);
recipientForm.addEventListener("submit", handleRecipientSubmit);
adminReview.addEventListener("click", handleReviewClick);
allocationList.addEventListener("click", handleAllocationClick);
operationsList.addEventListener("click", handleOperationClick);
inventoryFilter.addEventListener("change", renderInventory);
reportDonationFilter.addEventListener("change", renderReports);
reportRequestFilter.addEventListener("change", renderReports);
reportOperationFilter.addEventListener("change", renderReports);
seedDemoButton.addEventListener("click", seedDemoData);

render();
