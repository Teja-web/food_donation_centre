const DONATION_STATUSES = Object.freeze({
  PENDING_REVIEW: "pending_review",
  CHANGES_REQUESTED: "changes_requested",
  APPROVED: "approved",
  ALLOCATED: "allocated",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  REJECTED: "rejected",
  EXPIRED: "expired",
});

const REQUEST_STATUSES = Object.freeze({
  OPEN: "open",
  ALLOCATED: "allocated",
  FULFILLED: "fulfilled",
  CANCELLED: "cancelled",
});

const OPERATION_STATUSES = Object.freeze({
  READY_FOR_PICKUP: "ready_for_pickup",
  PICKED_UP: "picked_up",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
});

const INVENTORY_STATUSES = new Set([
  DONATION_STATUSES.APPROVED,
  DONATION_STATUSES.ALLOCATED,
  DONATION_STATUSES.DELIVERED,
  DONATION_STATUSES.EXPIRED,
  DONATION_STATUSES.CANCELLED,
]);

function normalizeDonationInput(input) {
  return {
    donorName: String(input.donorName ?? "").trim(),
    contact: String(input.contact ?? "").trim(),
    foodType: String(input.foodType ?? "").trim(),
    quantity: Number(input.quantity),
    unit: String(input.unit ?? "").trim(),
    expiryAt: String(input.expiryAt ?? "").trim(),
    pickupLocation: String(input.pickupLocation ?? "").trim(),
    availabilityWindow: String(input.availabilityWindow ?? "").trim(),
    storageNotes: String(input.storageNotes ?? "").trim(),
  };
}

function normalizeRecipientRequestInput(input) {
  return {
    recipientName: String(input.recipientName ?? "").trim(),
    recipientContact: String(input.recipientContact ?? "").trim(),
    requestedFood: String(input.requestedFood ?? "").trim(),
    quantityNeeded: Number(input.quantityNeeded),
    unit: String(input.requestUnit ?? input.unit ?? "").trim(),
    urgency: String(input.urgency ?? "").trim(),
    fulfillmentPreference: String(input.fulfillmentPreference ?? "").trim(),
    notes: String(input.notes ?? "").trim(),
  };
}

function validateDonationInput(input, now = new Date()) {
  const donation = normalizeDonationInput(input);
  const errors = {};

  if (!donation.donorName) errors.donorName = "Donor name is required.";
  if (!donation.contact) errors.contact = "Contact is required.";
  if (!donation.foodType) errors.foodType = "Food type is required.";
  if (!Number.isFinite(donation.quantity) || donation.quantity <= 0) {
    errors.quantity = "Quantity must be greater than zero.";
  }
  if (!donation.unit) errors.unit = "Unit is required.";
  if (!donation.pickupLocation) errors.pickupLocation = "Pickup location is required.";
  if (!donation.availabilityWindow) {
    errors.availabilityWindow = "Availability window is required.";
  }

  const expiryDate = new Date(donation.expiryAt);
  if (!donation.expiryAt || Number.isNaN(expiryDate.getTime())) {
    errors.expiryAt = "Expiry date and time is required.";
  } else if (expiryDate <= now) {
    errors.expiryAt = "Expiry must be in the future.";
  }

  return {
    donation,
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

function validateRecipientRequestInput(input) {
  const request = normalizeRecipientRequestInput(input);
  const errors = {};

  if (!request.recipientName) errors.recipientName = "Recipient or organization is required.";
  if (!request.recipientContact) errors.recipientContact = "Recipient contact is required.";
  if (!request.requestedFood) errors.requestedFood = "Requested food category is required.";
  if (!Number.isFinite(request.quantityNeeded) || request.quantityNeeded <= 0) {
    errors.quantityNeeded = "Quantity needed must be greater than zero.";
  }
  if (!request.unit) errors.requestUnit = "Unit is required.";
  if (!request.urgency) errors.urgency = "Urgency is required.";
  if (!request.fulfillmentPreference) {
    errors.fulfillmentPreference = "Pickup or delivery preference is required.";
  }

  return {
    request,
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

function makeId(prefix, now = new Date()) {
  return `${prefix}_${now.toISOString().replace(/[-:.TZ]/g, "")}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function createDonation(input, now = new Date()) {
  const result = validateDonationInput(input, now);
  if (!result.valid) return result;

  const createdAt = now.toISOString();

  return {
    valid: true,
    errors: {},
    donation: {
      ...result.donation,
      id: makeId("don", now),
      status: DONATION_STATUSES.PENDING_REVIEW,
      statusReason: "",
      recipientRequestId: "",
      allocationNote: "",
      allocatedAt: "",
      deliveredAt: "",
      operationStatus: "",
      operationNote: "",
      createdAt,
      updatedAt: createdAt,
      reviewedAt: "",
    },
  };
}

function createRecipientRequest(input, now = new Date()) {
  const result = validateRecipientRequestInput(input);
  if (!result.valid) return result;

  const createdAt = now.toISOString();

  return {
    valid: true,
    errors: {},
    request: {
      ...result.request,
      id: makeId("req", now),
      status: REQUEST_STATUSES.OPEN,
      allocatedDonationId: "",
      fulfilledAt: "",
      createdAt,
      updatedAt: createdAt,
    },
  };
}

function reviewDonation(donation, decision, reason = "", now = new Date()) {
  const decisions = {
    approve: DONATION_STATUSES.APPROVED,
    reject: DONATION_STATUSES.REJECTED,
    request_changes: DONATION_STATUSES.CHANGES_REQUESTED,
  };
  const nextStatus = decisions[decision];
  const statusReason = String(reason ?? "").trim();

  if (!nextStatus) {
    throw new Error(`Unsupported review decision: ${decision}`);
  }

  if (donation.status !== DONATION_STATUSES.PENDING_REVIEW) {
    throw new Error("Only pending donations can be reviewed.");
  }

  if (
    [DONATION_STATUSES.REJECTED, DONATION_STATUSES.CHANGES_REQUESTED].includes(nextStatus) &&
    !statusReason
  ) {
    throw new Error("A reason is required for rejection or change requests.");
  }

  return {
    ...donation,
    status: nextStatus,
    statusReason,
    operationStatus:
      nextStatus === DONATION_STATUSES.APPROVED
        ? OPERATION_STATUSES.READY_FOR_PICKUP
        : donation.operationStatus || "",
    reviewedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function canAllocateDonation(donation, now = new Date()) {
  if (!donation) return false;
  if (donation.status !== DONATION_STATUSES.APPROVED) return false;
  if (donation.recipientRequestId) return false;

  const expiryDate = new Date(donation.expiryAt);
  return !Number.isNaN(expiryDate.getTime()) && expiryDate > now;
}

function allocateDonationToRequest(donation, request, note = "", now = new Date()) {
  if (!canAllocateDonation(donation, now)) {
    throw new Error("Only approved, unallocated, unexpired inventory can be allocated.");
  }

  if (!request || request.status !== REQUEST_STATUSES.OPEN) {
    throw new Error("Only open recipient requests can receive an allocation.");
  }

  const timestamp = now.toISOString();

  return {
    donation: {
      ...donation,
      status: DONATION_STATUSES.ALLOCATED,
      recipientRequestId: request.id,
      allocationNote: String(note ?? "").trim(),
      allocatedAt: timestamp,
      updatedAt: timestamp,
    },
    request: {
      ...request,
      status: REQUEST_STATUSES.ALLOCATED,
      allocatedDonationId: donation.id,
      updatedAt: timestamp,
    },
  };
}

function updateOperationStatus(donation, status, note = "", now = new Date()) {
  if (!Object.values(OPERATION_STATUSES).includes(status)) {
    throw new Error(`Unsupported operation status: ${status}`);
  }

  if (![DONATION_STATUSES.APPROVED, DONATION_STATUSES.ALLOCATED].includes(donation.status)) {
    throw new Error("Only approved or allocated inventory can receive operations updates.");
  }

  const timestamp = now.toISOString();
  const nextStatusByOperation = {
    [OPERATION_STATUSES.READY_FOR_PICKUP]: donation.status,
    [OPERATION_STATUSES.PICKED_UP]: donation.status,
    [OPERATION_STATUSES.DELIVERED]: DONATION_STATUSES.DELIVERED,
    [OPERATION_STATUSES.CANCELLED]: DONATION_STATUSES.CANCELLED,
    [OPERATION_STATUSES.EXPIRED]: DONATION_STATUSES.EXPIRED,
  };

  return {
    ...donation,
    status: nextStatusByOperation[status],
    operationStatus: status,
    operationNote: String(note ?? "").trim(),
    deliveredAt: status === OPERATION_STATUSES.DELIVERED ? timestamp : donation.deliveredAt || "",
    updatedAt: timestamp,
  };
}

function syncRequestAfterDonationUpdate(request, donation, now = new Date()) {
  if (!request || request.allocatedDonationId !== donation.id) return request;

  if (donation.status === DONATION_STATUSES.DELIVERED) {
    return {
      ...request,
      status: REQUEST_STATUSES.FULFILLED,
      fulfilledAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  if ([DONATION_STATUSES.CANCELLED, DONATION_STATUSES.EXPIRED].includes(donation.status)) {
    return {
      ...request,
      status: REQUEST_STATUSES.OPEN,
      allocatedDonationId: "",
      updatedAt: now.toISOString(),
    };
  }

  return request;
}

function isNearExpiry(donation, now = new Date(), thresholdHours = 24) {
  const expiryAt = new Date(donation.expiryAt);
  if (Number.isNaN(expiryAt.getTime())) return false;

  const diffMs = expiryAt.getTime() - now.getTime();
  return diffMs > 0 && diffMs <= thresholdHours * 60 * 60 * 1000;
}

function isExpired(donation, now = new Date()) {
  const expiryAt = new Date(donation.expiryAt);
  return !Number.isNaN(expiryAt.getTime()) && expiryAt <= now;
}

function getInventoryItems(donations, filter = "active", now = new Date()) {
  return donations
    .filter((donation) => {
      if (filter === "all") return INVENTORY_STATUSES.has(donation.status);
      if (filter === "active") {
        return [DONATION_STATUSES.APPROVED, DONATION_STATUSES.ALLOCATED].includes(
          donation.status,
        );
      }
      return donation.status === filter && INVENTORY_STATUSES.has(donation.status);
    })
    .map((donation) => ({
      ...donation,
      nearExpiry: isNearExpiry(donation, now),
      expired: isExpired(donation, now),
    }));
}

function getAvailableInventory(donations, now = new Date()) {
  return donations.filter((donation) => canAllocateDonation(donation, now));
}

function deriveNotifications(donations, requests, now = new Date()) {
  const notifications = [];

  donations
    .filter((donation) => donation.status === DONATION_STATUSES.PENDING_REVIEW)
    .forEach((donation) => {
      notifications.push({
        id: `pending-${donation.id}`,
        tone: "info",
        title: "Donation waiting for review",
        message: `${donation.foodType} from ${donation.donorName} needs an admin decision.`,
      });
    });

  donations
    .filter((donation) => donation.status === DONATION_STATUSES.REJECTED)
    .forEach((donation) => {
      notifications.push({
        id: `rejected-${donation.id}`,
        tone: "danger",
        title: "Donation rejected",
        message: `${donation.foodType} was rejected: ${donation.statusReason || "No reason recorded."}`,
      });
    });

  getInventoryItems(donations, "active", now)
    .filter((donation) => donation.nearExpiry)
    .forEach((donation) => {
      notifications.push({
        id: `expiry-${donation.id}`,
        tone: "warning",
        title: "Near-expiry inventory",
        message: `${donation.foodType} expires soon and should be prioritized.`,
      });
    });

  donations
    .filter(
      (donation) =>
        [DONATION_STATUSES.APPROVED, DONATION_STATUSES.ALLOCATED].includes(donation.status) &&
        !isExpired(donation, now),
    )
    .forEach((donation) => {
      const operationLabel = donation.operationStatus
        ? statusLabel(donation.operationStatus)
        : "Ready for pickup";
      notifications.push({
        id: `operation-${donation.id}`,
        tone: "info",
        title: "Pending operations action",
        message: `${donation.foodType} is ${operationLabel.toLowerCase()} and needs pickup or delivery tracking.`,
      });
    });

  requests
    .filter((request) => request.status === REQUEST_STATUSES.OPEN)
    .forEach((request) => {
      notifications.push({
        id: `request-${request.id}`,
        tone: "info",
        title: "Open recipient request",
        message: `${request.recipientName} needs ${request.quantityNeeded} ${request.unit} of ${request.requestedFood}.`,
      });
    });

  return notifications;
}

function filterReportDonations(donations, filters = {}) {
  return donations.filter((donation) => {
    if (filters.donationStatus && filters.donationStatus !== "all") {
      if (filters.donationStatus === "active") {
        if (![DONATION_STATUSES.APPROVED, DONATION_STATUSES.ALLOCATED].includes(donation.status)) {
          return false;
        }
      } else if (donation.status !== filters.donationStatus) {
        return false;
      }
    }

    if (filters.operationStatus && filters.operationStatus !== "all") {
      return donation.operationStatus === filters.operationStatus;
    }

    return true;
  });
}

function filterReportRequests(requests, filters = {}) {
  return requests.filter((request) => {
    if (filters.requestStatus && filters.requestStatus !== "all") {
      return request.status === filters.requestStatus;
    }

    return true;
  });
}

function getReportSummary(donations, requests, now = new Date(), filters = {}) {
  const filteredDonations = filterReportDonations(donations, filters);
  const filteredRequests = filterReportRequests(requests, filters);
  const inventory = getInventoryItems(filteredDonations, "all", now);

  return {
    totalDonations: filteredDonations.length,
    pendingReview: filteredDonations.filter((item) => item.status === DONATION_STATUSES.PENDING_REVIEW)
      .length,
    approvedQuantity: filteredDonations
      .filter((item) => [DONATION_STATUSES.APPROVED, DONATION_STATUSES.ALLOCATED].includes(item.status))
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    allocatedQuantity: filteredDonations
      .filter((item) => item.status === DONATION_STATUSES.ALLOCATED)
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    deliveredQuantity: filteredDonations
      .filter((item) => item.status === DONATION_STATUSES.DELIVERED)
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    expiredItems: inventory.filter(
      (item) => item.status === DONATION_STATUSES.EXPIRED || item.expired,
    ).length,
    rejectedItems: filteredDonations.filter((item) => item.status === DONATION_STATUSES.REJECTED).length,
    openRequests: filteredRequests.filter((item) => item.status === REQUEST_STATUSES.OPEN).length,
    fulfilledRequests: filteredRequests.filter((item) => item.status === REQUEST_STATUSES.FULFILLED)
      .length,
  };
}

function statusLabel(status) {
  return String(status)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export {
  DONATION_STATUSES,
  OPERATION_STATUSES,
  REQUEST_STATUSES,
  allocateDonationToRequest,
  canAllocateDonation,
  createDonation,
  createRecipientRequest,
  deriveNotifications,
  getAvailableInventory,
  getInventoryItems,
  getReportSummary,
  isNearExpiry,
  reviewDonation,
  statusLabel,
  syncRequestAfterDonationUpdate,
  updateOperationStatus,
  validateDonationInput,
  validateRecipientRequestInput,
};
