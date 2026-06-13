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

- create_mbway_payment\
Executes MBWayService.create_payment method and returns MBWayResponse.\
(to be added flags in docs)