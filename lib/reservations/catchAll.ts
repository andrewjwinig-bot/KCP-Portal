// The catch-all tenant: staff file a reservation under it when the person who
// booked is not on the rent roll (a subtenant, a guest of the building), so the
// request stops reading "Unmatched" without being forced onto the wrong tenant.
// Shared by the page and the API, so it is kept out of the server-only store.

export const CATCH_ALL_TENANT = "TENANT";
