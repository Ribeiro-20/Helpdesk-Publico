from hubspot.services.contacts import HubspotContactsService


def test_hubspot_contacts_service_instantiation():
    service = HubspotContactsService()
    assert isinstance(service, HubspotContactsService)
