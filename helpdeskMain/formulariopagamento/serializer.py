from rest_framework import serializers

class amountSerializer(serializers.Serializer):
    amount = serializers.FloatField()
    currency = serializers.CharField(max_length=63)

class feesSerializer(serializers.Serializer):
    amount = serializers.FloatField()
    currency = serializers.CharField(max_length=63)

class transactionSerializer(serializers.Serializer):
    entity = serializers.IntegerField()
    reference = serializers.IntegerField()
    identifier = serializers.CharField(max_length=255)
    method = serializers.CharField(max_length=255)
    amount = amountSerializer() # WIP
    fees = feesSerializer() #WIP
    date = serializers.DateTimeField()
    trid = serializers.IntegerField()
    status = serializers.CharField(max_length=63)

class channelSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)

class webhook_dataSerializer(serializers.Serializer):
    transaction = transactionSerializer() # TO BE ADDED PARAMS
    channel = channelSerializer() # TO BE ADDED PARAMS
    data = serializers.CharField(max_length=255)