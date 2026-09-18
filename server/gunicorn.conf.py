"""Render entry point: gunicorn config.wsgi:application --config gunicorn.conf.py"""

import os

bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"
# Keep memory usage modest, while allowing health checks during image analysis.
workers = int(os.getenv("WEB_CONCURRENCY", "1"))
worker_class = "gthread"
threads = int(os.getenv("GUNICORN_THREADS", "2"))
timeout = int(os.getenv("GUNICORN_TIMEOUT", "180"))
accesslog = "-"
errorlog = "-"
# Avoid logging signed image URLs, query strings, or request bodies.
access_log_format = '%(h)s %(m)s %(U)s %(s)s %(L)s'
