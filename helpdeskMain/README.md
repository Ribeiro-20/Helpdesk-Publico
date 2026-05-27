# Turn production server:

```
python manage.py runserver
```

# Poll subscriptions

Use this command to poll the external subscription API and process new contacts:

```
python manage.py poll_subscriptions
```

## HubSpot API key

The poller uses the `HAPI_KEY` environment variable for authentication.

Linux / macOS:

```bash
export HAPI_KEY="your_api_key_here"
python manage.py poll_subscriptions
```

Windows PowerShell:

```powershell
$env:HAPI_KEY = "your_api_key_here"
python manage.py poll_subscriptions
```

Most of apps inside this folder are subject to change/deletion.