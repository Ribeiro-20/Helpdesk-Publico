from django.contrib import admin
from .models import Transaction

@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ("trid", "identifier", "method", "amount_value", "amount_currency", "status", "date")
    search_fields = ("trid", "identifier")
    list_filter = ("status", "method")
    ordering = ("-date",)
    readonly_fields = ("id", "created_at", "updated_at")
