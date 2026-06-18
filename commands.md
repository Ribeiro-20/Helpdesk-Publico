# Commands

To execute commands you must run:
```shell
python manage.py [command] [--args]
```

Example :
```shell
python manage.py create_mbway_payment \
  --identifier "order-123" \
  --amount 2550 \
  --currency "EUR" \
  --customer-phone 912345678 \
  --country-code 351 \
  --notify \
  --fail-over 0 \
  --customer-name "Rogerio Silva" \
  --email "santos@email.com" \
  --payment-phone 912345678
```

## EuPago

- create_mbway_payment

Executes MBWayService.create_payment method and returns MBWayResponse.

--identifier (str) → internal order reference\
--amount (int) → amount in cents\
--currency (str) → currency code (e.g. EUR)\
--customer-phone (str) → MBWay linked phone\
--country-code (str) → phone country code (e.g. 351)\
--notify (flag, optional) → enable notification callback\
--fail-over (int) → fallback behavior flag\
--customer-name (str) → customer full name\
--email (str) → customer email\
--payment-phone (str) → phone used for payment validation

- create_multibanco_payment

Executes MultibancoService.create_payment method and returns MultibancoResponse

--id (str) → payment reference (e.g. PAY-12345)\
--valor (str) → amount value (decimal string, e.g. "100.00")\
--data_inicio (date YYYY-MM-DD)\
--data_fim (date YYYY-MM-DD)\
--valor_maximo (str) → max allowed value\
--valor_minimo (str) → min allowed value\
--per_dup (int) → duplicate payment permission flag\
--extrafields (str) → optional metadata payload\
--failOver (bool|string) → fallback behavior\
--email (str) → customer email\
--contacto (str) → customer phone\
--userID (str) → internal user identifier