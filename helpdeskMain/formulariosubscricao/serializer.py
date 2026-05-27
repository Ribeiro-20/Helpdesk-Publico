from rest_framework import serializers


class webhook_dataSerializer(serializers.Serializer):
    """Serializer for incoming poll items.

    Expects keys exactly as provided by the external API: `recordId` and `membershipTimestamp`.
    """

    recordId = serializers.CharField(required=True)
    membershipTimestamp = serializers.DateTimeField(required=False, allow_null=True)


class ContactPropertiesSerializer(serializers.Serializer):
    createdate = serializers.DateTimeField(required=False, allow_null=True)
    email = serializers.EmailField(required=False, allow_null=True, allow_blank=True)
    firstname = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    hs_object_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    lastmodifieddate = serializers.DateTimeField(required=False, allow_null=True)
    lastname = serializers.CharField(required=False, allow_null=True, allow_blank=True)


class ContactSerializer(serializers.Serializer):
    """Serializer for a HubSpot contact record (no DB model).

    Example payload shape accepted (matches user's example):
    {
        "id": "620014550210",
        "properties": { ... },
        "createdAt": "2026-01-01T13:14:35.963Z",
        "updatedAt": "2026-05-19T01:11:59.763Z",
        "archived": false,
        "url": "https://..."
    }
    """

    id = serializers.CharField()
    properties = ContactPropertiesSerializer(required=False)
    createdAt = serializers.DateTimeField(required=False, allow_null=True)
    updatedAt = serializers.DateTimeField(required=False, allow_null=True)
    archived = serializers.BooleanField(required=False)
    # Some HubSpot-like URLs may not validate with Django's URLValidator
    # (they may use short hostnames), so accept them as plain strings.
    url = serializers.CharField(required=False, allow_null=True, allow_blank=True)