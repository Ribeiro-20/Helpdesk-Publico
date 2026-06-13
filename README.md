# Project Setup

## Requirements

- Python 3.x 🐍
- pip

---

## Install Dependencies

```bash
pip install -r requirements.txt
```

# Environment Variables

Follow .env.template:
```sh
EAPI_KEY=your_eupago_api_key
TAPI_KEY=your_toconline_api_key
HAPI_KEY=your_hubspot_api_key
```

# Run Project

python manage.py migrate
python manage.py runserver

# Testing

pytest

# Admin (optional)

- URL: /admin
- User: estagio2026HelpDesk
- Password: 123