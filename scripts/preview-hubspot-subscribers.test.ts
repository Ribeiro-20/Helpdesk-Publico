import assert from "node:assert/strict";
import test from "node:test";
import {
  planSync,
  type ExistingClient,
  type PreviewContact,
} from "./preview-hubspot-subscribers.js";

const listId = "1355";

function existingClient(overrides: Partial<ExistingClient> = {}): ExistingClient {
  return {
    id: "client-1",
    name: "Client One",
    contact_name: "Client One",
    first_name: "Client",
    last_name: "One",
    email: "client@example.com",
    phone: null,
    company_name: null,
    cpv_s_alerta_concursos_publicos: "12345678",
    hubspot_contact_id: "hs-1",
    hubspot_company_id: null,
    hubspot_service_value: "active",
    hubspot_list_id: listId,
    hubspot_added_to_list_at: null,
    hubspot_created_at: null,
    hubspot_updated_at: null,
    hubspot_synced_at: "2026-06-21T10:00:00.000Z",
    hubspot_removed_at: null,
    is_active: true,
    client_cpv_rules: [
      {
        pattern: "12345678",
        match_type: "EXACT",
        is_exclusion: false,
        source: "hubspot",
      },
    ],
    ...overrides,
  };
}

function previewContact(): PreviewContact {
  const syncedAt = "2026-06-22T10:00:00.000Z";
  return {
    hubspot_contact_id: "hs-1",
    hubspot_company_id: null,
    first_name: "Client",
    last_name: "One",
    contact_name: "Client One",
    email: "client@example.com",
    phone: null,
    company_name: null,
    service_value: "active",
    cpvs_raw: "12345678",
    cpvs: ["12345678"],
    invalid_cpvs: [],
    added_to_list_at: null,
    hubspot_created_at: null,
    hubspot_updated_at: null,
    proposed_client: {
      name: "Client One",
      contact_name: "Client One",
      first_name: "Client",
      last_name: "One",
      email: "client@example.com",
      phone: null,
      company_name: null,
      cpv_s_alerta_concursos_publicos: "12345678",
      hubspot_contact_id: "hs-1",
      hubspot_company_id: null,
      hubspot_service_value: "active",
      hubspot_list_id: listId,
      hubspot_added_to_list_at: null,
      hubspot_created_at: null,
      hubspot_updated_at: null,
      hubspot_synced_at: syncedAt,
      hubspot_removed_at: null,
      is_active: false,
    },
    proposed_cpv_rules: [
      { pattern: "12345678", match_type: "EXACT", is_exclusion: false },
    ],
  };
}

test("plans deactivation when a managed contact leaves the HubSpot list", () => {
  const { actions } = planSync([], [existingClient()], new Set(), listId);

  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.action, "remove");
  assert.equal(actions[0]?.reason, "removed_from_hubspot_list");
});

test("does not repeatedly remove a contact already marked as removed", () => {
  const { actions } = planSync(
    [],
    [existingClient({ hubspot_removed_at: "2026-06-22T07:00:00.000Z", is_active: false })],
    new Set(),
    listId,
  );

  assert.deepEqual(actions, []);
});

test("clears the removal marker when the contact returns to the list", () => {
  const contact = previewContact();
  const { actions } = planSync(
    [contact],
    [existingClient({ hubspot_removed_at: "2026-06-22T07:00:00.000Z", is_active: false })],
    new Set([contact.hubspot_contact_id]),
    listId,
  );

  assert.equal(actions[0]?.action, "update");
  assert.ok(actions[0]?.changes.includes("hubspot_removed_at"));
});

test("repairs HubSpot CPV rule drift even when client fields are unchanged", () => {
  const contact = previewContact();
  const { actions } = planSync(
    [contact],
    [existingClient({ client_cpv_rules: [] })],
    new Set([contact.hubspot_contact_id]),
    listId,
  );

  assert.equal(actions[0]?.action, "update");
  assert.ok(actions[0]?.changes.includes("hubspot_cpv_rules"));
});
