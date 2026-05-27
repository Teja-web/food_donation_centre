import test from "node:test";
import assert from "node:assert/strict";

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
  isNearExpiry,
  reviewDonation,
  syncRequestAfterDonationUpdate,
  updateOperationStatus,
  validateDonationInput,
  validateRecipientRequestInput,
} from "../src/domain.js";

const now = new Date("2026-05-26T12:00:00.000Z");

function validDonationInput(overrides = {}) {
  return {
    donorName: "Community Kitchen",
    contact: "+91 90000 00000",
    foodType: "Cooked meals",
    quantity: 50,
    unit: "meals",
    expiryAt: "2026-05-27T12:00",
    pickupLocation: "Main Street",
    availabilityWindow: "6 PM - 8 PM",
    storageNotes: "Packed and refrigerated.",
    ...overrides,
  };
}

function validRequestInput(overrides = {}) {
  return {
    recipientName: "Sunrise Shelter",
    recipientContact: "+91 90000 99999",
    requestedFood: "Cooked meals",
    quantityNeeded: 30,
    requestUnit: "meals",
    urgency: "High",
    fulfillmentPreference: "delivery",
    notes: "Dinner service.",
    ...overrides,
  };
}

function approvedDonation(overrides = {}) {
  return reviewDonation(createDonation(validDonationInput(overrides), now).donation, "approve", "", now);
}

test("validates required donation details", () => {
  const result = validateDonationInput(validDonationInput({ donorName: "", quantity: 0 }), now);

  assert.equal(result.valid, false);
  assert.equal(result.errors.donorName, "Donor name is required.");
  assert.equal(result.errors.quantity, "Quantity must be greater than zero.");
});

test("rejects donations that expire in the past", () => {
  const result = validateDonationInput(validDonationInput({ expiryAt: "2026-05-25T12:00" }), now);

  assert.equal(result.valid, false);
  assert.equal(result.errors.expiryAt, "Expiry must be in the future.");
});

test("creates submitted donations with pending review status", () => {
  const result = createDonation(validDonationInput(), now);

  assert.equal(result.valid, true);
  assert.equal(result.donation.status, DONATION_STATUSES.PENDING_REVIEW);
  assert.equal(result.donation.quantity, 50);
});

test("admin approval moves donation into inventory", () => {
  const donation = createDonation(validDonationInput(), now).donation;
  const approved = reviewDonation(donation, "approve", "", now);
  const inventory = getInventoryItems([approved], "active", now);

  assert.equal(approved.status, DONATION_STATUSES.APPROVED);
  assert.equal(approved.operationStatus, OPERATION_STATUSES.READY_FOR_PICKUP);
  assert.equal(inventory.length, 1);
  assert.equal(inventory[0].id, approved.id);
});

test("admin rejection requires and captures a reason", () => {
  const donation = createDonation(validDonationInput(), now).donation;

  assert.throws(
    () => reviewDonation(donation, "reject", "", now),
    /A reason is required/,
  );

  const rejected = reviewDonation(donation, "reject", "Packaging was damaged.", now);
  const inventory = getInventoryItems([rejected], "all", now);

  assert.equal(rejected.status, DONATION_STATUSES.REJECTED);
  assert.equal(rejected.statusReason, "Packaging was damaged.");
  assert.equal(inventory.length, 0);
});

test("near-expiry items are flagged for priority action", () => {
  const donation = createDonation(validDonationInput({ expiryAt: "2026-05-26T20:00" }), now).donation;

  assert.equal(isNearExpiry(donation, now), true);
});

test("validates recipient requests", () => {
  const result = validateRecipientRequestInput(
    validRequestInput({ recipientContact: "", quantityNeeded: 0 }),
  );

  assert.equal(result.valid, false);
  assert.equal(result.errors.recipientContact, "Recipient contact is required.");
  assert.equal(result.errors.quantityNeeded, "Quantity needed must be greater than zero.");
});

test("creates open recipient requests", () => {
  const result = createRecipientRequest(validRequestInput(), now);

  assert.equal(result.valid, true);
  assert.equal(result.request.status, REQUEST_STATUSES.OPEN);
  assert.equal(result.request.quantityNeeded, 30);
});

test("allocation links approved inventory to an open recipient request", () => {
  const donation = approvedDonation();
  const request = createRecipientRequest(validRequestInput(), now).request;
  const result = allocateDonationToRequest(donation, request, "Deliver before 7 PM.", now);

  assert.equal(result.donation.status, DONATION_STATUSES.ALLOCATED);
  assert.equal(result.donation.recipientRequestId, request.id);
  assert.equal(result.request.status, REQUEST_STATUSES.ALLOCATED);
  assert.equal(result.request.allocatedDonationId, donation.id);
});

test("allocation rejects expired, rejected, delivered, or already allocated inventory", () => {
  const firstRequest = createRecipientRequest(validRequestInput(), now).request;
  const secondRequest = createRecipientRequest(
    validRequestInput({ recipientName: "Night Shelter" }),
    now,
  ).request;
  const rejected = reviewDonation(
    createDonation(validDonationInput(), now).donation,
    "reject",
    "Not usable.",
    now,
  );
  const expired = {
    ...approvedDonation(),
    expiryAt: "2026-05-26T13:00:00.000Z",
  };
  const allocated = allocateDonationToRequest(approvedDonation(), firstRequest, "", now).donation;

  assert.equal(getAvailableInventory([rejected, expired, allocated], new Date("2026-05-26T14:00:00.000Z")).length, 0);
  assert.throws(
    () => allocateDonationToRequest(allocated, secondRequest, "", now),
    /Only approved, unallocated, unexpired inventory can be allocated/,
  );
});

test("delivery updates donation and fulfills linked request", () => {
  const donation = approvedDonation();
  const request = createRecipientRequest(validRequestInput(), now).request;
  const allocated = allocateDonationToRequest(donation, request, "", now);
  const delivered = updateOperationStatus(
    allocated.donation,
    OPERATION_STATUSES.DELIVERED,
    "Handed to shelter coordinator.",
    now,
  );
  const fulfilled = syncRequestAfterDonationUpdate(allocated.request, delivered, now);

  assert.equal(delivered.status, DONATION_STATUSES.DELIVERED);
  assert.equal(delivered.deliveredAt, now.toISOString());
  assert.equal(fulfilled.status, REQUEST_STATUSES.FULFILLED);
});

test("notifications cover pending review, operations, near-expiry, rejection, and open requests", () => {
  const pending = createDonation(validDonationInput(), now).donation;
  const nearExpiry = approvedDonation({ expiryAt: "2026-05-26T20:00" });
  const rejected = reviewDonation(
    createDonation(validDonationInput({ foodType: "Fruit" }), now).donation,
    "reject",
    "Expired at pickup.",
    now,
  );
  const request = createRecipientRequest(validRequestInput(), now).request;
  const notifications = deriveNotifications([pending, nearExpiry, rejected], [request], now);

  assert.equal(notifications.some((item) => item.id.startsWith("pending-")), true);
  assert.equal(notifications.some((item) => item.id.startsWith("operation-")), true);
  assert.equal(notifications.some((item) => item.id.startsWith("expiry-")), true);
  assert.equal(notifications.some((item) => item.id.startsWith("rejected-")), true);
  assert.equal(notifications.some((item) => item.id.startsWith("request-")), true);
});

test("reports summarize the workflow source of truth", () => {
  const request = createRecipientRequest(validRequestInput(), now).request;
  const allocated = allocateDonationToRequest(approvedDonation(), request, "", now);
  const delivered = updateOperationStatus(
    allocated.donation,
    OPERATION_STATUSES.DELIVERED,
    "",
    now,
  );
  const fulfilled = syncRequestAfterDonationUpdate(allocated.request, delivered, now);
  const rejected = reviewDonation(
    createDonation(validDonationInput({ foodType: "Bread" }), now).donation,
    "reject",
    "Unsafe packaging.",
    now,
  );
  const summary = getReportSummary([delivered, rejected], [fulfilled], now);

  assert.equal(summary.totalDonations, 2);
  assert.equal(summary.deliveredQuantity, 50);
  assert.equal(summary.rejectedItems, 1);
  assert.equal(summary.fulfilledRequests, 1);
});

test("reports can be filtered by workflow status and operation stage", () => {
  const approved = approvedDonation();
  const delivered = updateOperationStatus(
    allocateDonationToRequest(
      approvedDonation({ foodType: "Produce" }),
      createRecipientRequest(validRequestInput(), now).request,
      "",
      now,
    ).donation,
    OPERATION_STATUSES.DELIVERED,
    "",
    now,
  );
  const request = createRecipientRequest(validRequestInput({ recipientName: "Clinic" }), now).request;

  const activeSummary = getReportSummary([approved, delivered], [request], now, {
    donationStatus: "active",
    requestStatus: "open",
  });
  const deliveredSummary = getReportSummary([approved, delivered], [request], now, {
    operationStatus: OPERATION_STATUSES.DELIVERED,
  });

  assert.equal(activeSummary.totalDonations, 1);
  assert.equal(activeSummary.approvedQuantity, 50);
  assert.equal(activeSummary.openRequests, 1);
  assert.equal(deliveredSummary.totalDonations, 1);
  assert.equal(deliveredSummary.deliveredQuantity, 50);
});
