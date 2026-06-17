DJANGO_DIR=helpdeskMain
WORKING_DIR=cd $(DJANGO_DIR) &&

install:
	pip install -r requirements.txt

run:
	$(WORKING_DIR) python manage.py runserver

test:
	$(WORKING_DIR) pytest

migrate:
	$(WORKING_DIR) python manage.py migrate

migrations:
	$(WORKING_DIR) python manage.py makemigrations

fullmigrate:
	$(WORKING_DIR) python manage.py migrate && python manage.py makemigrations

shell:
	$(WORKING_DIR) python manage.py shell

lint:
	$(WORKING_DIR) pylint . || true

pyrefly:
	$(WORKING_DIR) pyrefly check .

pipeline: lint pyrefly test