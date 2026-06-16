from rest_framework import serializers
# TODO: Validação de dados do frontend

class PaymentDataSerializerMBWay(serializers.Serializer):
    indicativo = serializers.CharField(max_length=6, required=False, allow_blank=True)
    telemovel = serializers.CharField(max_length=15)
    telefone = serializers.CharField(max_length=20, required=False, allow_blank=True)

class PaymentDataSerializerCC(serializers.Serializer):
    email = serializers.CharField(required=True)
    telefone = serializers.CharField()

class PaymentDataSerializerDirectDebito(serializers.Serializer):
    nome_empresa = serializers.CharField()
    iban = serializers.CharField()
    bic = serializers.CharField()
    enail = serializers.CharField()


class SummarySerializer(serializers.Serializer):
    preco_final_estimado = serializers.FloatField()
    valor_a_cobrar_agora = serializers.FloatField()
    valor_mensal = serializers.FloatField(required=False, allow_null=True)
    meses = serializers.IntegerField()
    acresce_iva = serializers.BooleanField()


class CheckoutFormSerializer(serializers.Serializer):
    pedido_id = serializers.CharField(max_length=50)
    tipo_servico = serializers.CharField(max_length=100)
    modalidade = serializers.CharField(max_length=50)
    tipo_servico_original = serializers.CharField(max_length=100)
    modalidade_original = serializers.CharField(max_length=50)
    opcao_pagamento = serializers.CharField(max_length=50)
    metodo_pagamento = serializers.CharField(max_length=30)
    codigo_produto = serializers.CharField(max_length=30)
    pvp = serializers.CharField(max_length=20)

    dados_pagamento = serializers.JSONField()
    resumo_apresentado = SummarySerializer()