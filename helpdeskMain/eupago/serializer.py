from rest_framework import serializers

class amountSerializer(serializers.Serializer):
    value = serializers.FloatField()
    currency = serializers.CharField()

class feesSerializer(serializers.Serializer):
    value = serializers.FloatField()
    currency = serializers.CharField()

class transactionSerializerDTO(serializers.Serializer):
    entity = serializers.IntegerField()
    reference = serializers.IntegerField()
    identifier = serializers.CharField()
    method = serializers.CharField()
    amount = amountSerializer()
    fees = feesSerializer()
    date = serializers.DateTimeField()
    trid = serializers.IntegerField()
    status = serializers.CharField()

class channelSerializerDTO(serializers.Serializer):
    name = serializers.CharField()

class EupagoWebhookSerializerDTO(serializers.Serializer):
    transactions = transactionSerializerDTO()
    channel = channelSerializerDTO()
    data = serializers.CharField(required=False)