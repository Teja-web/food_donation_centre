# Food Donation Centre

A dependency-free browser app for the approved food donation centre workflows.

## Implemented Scope

- Donors can submit food donations with required food, quantity, expiry, pickup, and availability details.
- Donation form validation blocks missing or invalid submissions.
- Submitted donations appear in donor history with a pending review status.
- Admins can review pending donations and approve, reject, or request changes with a reason.
- Approved donations appear in inventory.
- Inventory can be filtered by active, approved, allocated, delivered, expired, cancelled, or all inventory states.
- Near-expiry approved inventory is flagged for priority action.
- Recipients can submit food requests with contact, quantity, urgency, and pickup or delivery preference.
- Admins can allocate approved unexpired inventory to open recipient requests.
- Operations users can mark allocated or approved inventory as picked up, delivered, expired, or cancelled.
- Alerts highlight pending reviews, open recipient requests, rejected donations, and near-expiry inventory.
- Alerts also surface pending pickup or delivery actions for approved and allocated inventory.
- Reports summarize donations, pending reviews, quantities approved, allocated, and delivered, expired items, rejected items, and request fulfillment.
- Reports can be filtered by donation status, request status, and operation stage.

## Requirements Covered

- `wlUXsx_pl8zkbjSLHm3hq` - Food Donation Centre Complete Workflow.
- `iFThDqWPFW0-LYwsYu8Uh` - Donor Donation Submission and History.
- `u2V-Dz1dbeRnAcDySSEXr` - Administrator Review and Inventory Control.
- `z-OV61jivaUExRRQy8hZ_` - Recipient Requests and Donation Allocation.
- `fOHQ_izluy8fDvHpgIgQ5` - Operations Notifications Delivery and Reports.

## How To Run

This project does not require installing dependencies.

```bash
pnpm test
pnpm start
```

Then open:

```text
http://localhost:3000
```

If you do not use pnpm, the same commands work with Node directly:

```bash
node --test
node server.js
```

## Notes

- Data is stored in browser `localStorage` through a versioned repository boundary.
- The current implementation is a local workflow slice; no backend database or authentication layer exists yet.
- Roles are represented by workflow sections in the browser app, not by secure authentication.
