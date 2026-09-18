#!/usr/bin/env bash
set -euo pipefail

python -m pip install -r requirements.txt
python manage.py check --deploy --fail-level WARNING
python manage.py collectstatic --noinput
# Free Render services have no pre-deploy command or interactive shell.
python manage.py migrate --noinput
