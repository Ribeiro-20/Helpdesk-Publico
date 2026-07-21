# Django Management Commands Documentation | EuPago Integration

A quick reference guide for executing custom management commands (`BaseCommand`) within the EuPago payment ecosystem

## General Usage

To run any management command from the root of the project:

```shell
python manage.py [command] [--args]
```

## Available Commands

### 1. `create_mbway_payment`

> **Internal Method:** `MBWayService.create_payment`
> 
> **Returns:** `MBWayResponse`

* `--identifier` **(str)** ➔ Internal order reference / unique ID.


* `--amount` **(int)** ➔ Payment amount **in cents** (e.g., `2550` for €25.50).


* `--currency` **(str)** ➔ ISO currency code (e.g., `EUR`).


* `--customer-phone` **(str)** ➔ Phone number linked to the customer's MBWay.


* `--country-code` **(str)** ➔ International country calling code (e.g., `351`).


* `--notify` **(flag, optional)** ➔ Enables the payment notification callback.


* `--fail-over` **(int)** ➔ Fallback behavior configuration flag.


* `--customer-name` **(str)** ➔ Customer's full name.


* `--email` **(str)** ➔ Customer's email address.


* `--payment-phone` **(str)** ➔ Phone number used for payment validation.



#### Execution Example

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
---

### 2. `create_multibanco_payment`

> **Internal Method:** `MultibancoService.create_payment`
> 
> **Returns:** `MultibancoResponse`

* `--id` **(str)** ➔ Payment reference/identifier (e.g., `PAY-12345`).


* `--valor` **(str)** ➔ Amount value as a decimal string (e.g., `"100.00"`).


* `--data_inicio` **(date YYYY-MM-DD)** ➔ Validity start date.


* `--data_fim` **(date YYYY-MM-DD)** ➔ Payment expiration deadline.


* `--valor_maximo` **(str)** ➔ Maximum allowed value for reception.


* `--valor_minimo` **(str)** ➔ Minimum allowed value for reception.


* `--per_dup` **(int)** ➔ Duplicate payment permission flag.


* `--extrafields` **(str)** ➔ Optional JSON payload containing metadata.


* `--failOver` **(bool|str)** ➔ Fallback behavior definition on gateway failure.


* `--email` **(str)** ➔ Customer's contact email.


* `--contacto` **(str)** ➔ Customer's phone number.


* `--userID` **(str)** ➔ Internal system user identifier.

---

### 3. `create_creditcard_payment`

> **Internal Method:** `CreditCardService.create_payment`
> 
> **Returns:** `CreditCardResponse`

* `--identifier` **(str)** ➔ Unique global identifier for the transaction.


* `--amount` **(float)** ➔ Amount in euros **with decimals** (e.g., `25.50`).


* `--currency` **(str)** ➔ ISO currency code (default: `EUR`).


* `--success-url` **(str)** ➔ Redirect URL upon successful gateway payment.


* `--fail-url` **(str)** ➔ Redirect URL upon payment failure or processing error.


* `--back-url` **(str)** ➔ Redirect URL if the user manually cancels the operation.


* `--lang` **(str)** ➔ Form interface language code (default: `PT`).


* `--minutes-form-up` **(int)** ➔ Link expiration time in minutes (default: `60`, max: `1440`).


* `--notify` **(flag, optional)** ➔ Triggers an automatic email notification to the customer.


* `--customer-email` **(str)** ➔ Recipient email address for notifications.



#### Execution Example

```shell
python manage.py create_creditcard_payment \
  --identifier "order-456" \
  --amount 25.50 \
  --currency "EUR" \
  --success-url "https://omeusite.pt/pagamento/sucesso" \
  --fail-url "https://omeusite.pt/pagamento/falhou" \
  --back-url "https://omeusite.pt/pagamento/cancelado" \
  --lang "PT" \
  --minutes-form-up 60 \
  --notify \
  --customer-email "cliente@email.com"
```

---

### 4. `get_toconline_customers`

> **Internal Method:** `TOCOnlineService.get_customers` / `TOCOnlineService.get_customer`

* `--customer-id` **(str, opcional)**: ID específico de um cliente a obter. Se omitido, devolve a lista completa de clientes.

#### Execution Examples

Obter a lista de todos os clientes:
```shell
python manage.py get_toconline_customers
```

Obter um cliente específico por ID:
```shell
python manage.py get_toconline_customers --customer-id "62"
```