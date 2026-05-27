from rest_framework import serializers


class webhook_dataSerializer(serializers.Serializer):
    """Serializer for incoming poll items.

    Expects keys exactly as provided by the external API: `recordId` and `membershipTimestamp`.
    """

    recordId = serializers.CharField(required=True)
    membershipTimestamp = serializers.DateTimeField(required=False, allow_null=True)