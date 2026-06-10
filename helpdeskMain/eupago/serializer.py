from rest_framework import serializers
from core import serializer as core_serializer
class EupagoWebhookSerializer(serializers.Serializer):
    transaction = core_serializer.transactionSerializer()
    channel = core_serializer.channelSerializer()
    data = serializers.CharField(max_length=255)