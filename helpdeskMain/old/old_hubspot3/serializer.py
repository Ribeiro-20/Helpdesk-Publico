from rest_framework import serializers
from core import serializer as core_serializer

class webhook_dataSerializer(serializers.Serializer):
    transaction = core_serializer.transactionSerializer()
    channel = core_serializer.channelSerializer()
    data = serializers.CharField(max_length=255)


class HubspotPollItemSerializer(serializers.Serializer):
    recordId = serializers.CharField(required=True)
    membershipTimestamp = serializers.DateTimeField(required=False, allow_null=True)


class PaymentContactPropertiesSerializer(serializers.Serializer):
    createdate = serializers.DateTimeField(required=False, allow_null=True)
    email = serializers.EmailField(required=False, allow_null=True, allow_blank=True)
    firstname = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    lastname = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    hs_object_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    lastmodifieddate = serializers.DateTimeField(required=False, allow_null=True)
    servico_alerta_concursos_publicos = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    cpv_s_alerta_concursos_publicos = serializers.CharField(required=False, allow_null=True, allow_blank=True)


class PaymentContactSerializer(serializers.Serializer):
    id = serializers.CharField()
    properties = PaymentContactPropertiesSerializer(required=False)
    createdAt = serializers.DateTimeField(required=False, allow_null=True)
    updatedAt = serializers.DateTimeField(required=False, allow_null=True)
    archived = serializers.BooleanField(required=False)
    url = serializers.CharField(required=False, allow_null=True, allow_blank=True)