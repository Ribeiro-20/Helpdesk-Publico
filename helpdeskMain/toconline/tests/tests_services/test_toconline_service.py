from unittest.mock import Mock

from toconline.client import TOCOnlineClient
from toconline.services.toconline import TOCOnlineService


def test_service_get_customers():
    client = Mock(spec=TOCOnlineClient)
    client.get_customers.return_value = {
        "data": [
            {
                "type": "customers",
                "id": "62",
                "attributes": {
                    "tax_registration_number": "221976302",
                    "business_name": "Empresa de Testes",
                },
            }
        ]
    }

    service = TOCOnlineService(client=client)
    result = service.get_customers()

    assert "data" in result
    assert len(result["data"]) == 1
    assert result["data"][0]["id"] == "62"
    client.get_customers.assert_called_once()


def test_service_get_customer():
    client = Mock(spec=TOCOnlineClient)
    client.get_customer_by_id.return_value = {
        "data": {
            "type": "customers",
            "id": "62",
            "attributes": {
                "tax_registration_number": "221976302",
                "business_name": "Empresa de Testes",
            },
        }
    }

    service = TOCOnlineService(client=client)
    result = service.get_customer("62")

    assert result["data"]["id"] == "62"
    client.get_customer_by_id.assert_called_once_with("62")