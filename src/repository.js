const STORAGE_KEY = "foodDonationCentre.state.v2";
const LEGACY_DONATION_KEY = "foodDonationCentre.donations.v1";

function createEmptyState() {
  return {
    version: 2,
    donations: [],
    recipientRequests: [],
  };
}

function normalizeState(value) {
  return {
    ...createEmptyState(),
    ...value,
    donations: Array.isArray(value?.donations) ? value.donations : [],
    recipientRequests: Array.isArray(value?.recipientRequests) ? value.recipientRequests : [],
  };
}

function createAppStateRepository(storage = window.localStorage) {
  return {
    load() {
      try {
        const stored = storage.getItem(STORAGE_KEY);
        if (stored) return normalizeState(JSON.parse(stored));

        const legacyDonations = storage.getItem(LEGACY_DONATION_KEY);
        if (legacyDonations) {
          return normalizeState({ donations: JSON.parse(legacyDonations) });
        }
      } catch {
        return createEmptyState();
      }

      return createEmptyState();
    },

    save(state) {
      storage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
    },
  };
}

export { createAppStateRepository, createEmptyState };
