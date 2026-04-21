from rest_framework import serializers

class amount(serializers.Serializer):
    pass # WIP

class fees(serializers.Serializers):
    pass # WIP

class transactionSerializer(serializers.Serializer):
    entity = serializers.IntegerField()
    reference = serializers.IntegerField()
    identifier = serializers.CharField(max_length=255)
    method = serializers.CharField(max_length=255)
    #amount
    #fees
    date = serializers.DateTimeField()
    trid = serializers.IntegerField()
    status = serializers.CharField(max_length=63)

class channelSerializer(serializers.Serializer):
    name = serializers.CharField(max_lengthdd=255)

class webhook_dataSerializer(serializers.Serializer):
    transaction = transactionSerializer() # TO BE ADDED PARAMS
    channel = channelSerializer() # TO BE ADDED PARAMS
    data = serializers.CharField(max_length=255)