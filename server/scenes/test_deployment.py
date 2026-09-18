import io
import json
import os
import runpy
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from PIL import Image
from storages.backends.s3 import S3Storage

from .models import Scene

PRODUCTION_ENV = {
    "RENDER": "true",
    "RENDER_EXTERNAL_HOSTNAME": "spatialize-api.onrender.com",
    "DJANGO_SECRET_KEY": "test-only-" + "a1B2c3D4e5" * 6,
    "DJANGO_CORS_ALLOWED_ORIGINS": "https://spatialize.vercel.app",
    "DATABASE_URL": "postgresql://user:password@db.example.com:5432/postgres",
    "AWS_S3_ENDPOINT_URL": "https://example.storage.supabase.co/storage/v1/s3",
    "AWS_S3_REGION_NAME": "ap-southeast-1",
    "AWS_STORAGE_BUCKET_NAME": "scene-images",
    "AWS_ACCESS_KEY_ID": "test-access-key",
    "AWS_SECRET_ACCESS_KEY": "test-secret-key",
}


def load_settings(environment):
    # Never read the developer's .env or contact a real database/storage service.
    with patch.dict(os.environ, environment, clear=True), patch("dotenv.load_dotenv"):
        return runpy.run_path(Path(__file__).parents[1] / "config" / "settings.py")


class DeploymentSettingsTests(SimpleTestCase):
    def test_local_development_needs_no_cloud_credentials(self):
        config = load_settings({})
        self.assertTrue(config["DEBUG"])
        self.assertEqual(
            config["DATABASES"]["default"]["ENGINE"], "django.db.backends.sqlite3"
        )
        self.assertEqual(config["MEDIA_STORAGE"], "local")
        self.assertFalse(config["CORS_ALLOW_ALL_ORIGINS"])
        self.assertIn("http://localhost:3000", config["CORS_ALLOWED_ORIGINS"])

    def test_render_uses_https_postgres_and_signed_storage_urls(self):
        config = load_settings(PRODUCTION_ENV)
        self.assertFalse(config["DEBUG"])
        self.assertTrue(config["SECURE_SSL_REDIRECT"])
        self.assertTrue(config["SESSION_COOKIE_SECURE"])
        self.assertEqual(
            config["SECURE_PROXY_SSL_HEADER"], ("HTTP_X_FORWARDED_PROTO", "https")
        )
        self.assertEqual(
            config["ALLOWED_HOSTS"], [PRODUCTION_ENV["RENDER_EXTERNAL_HOSTNAME"]]
        )
        self.assertEqual(
            config["DATABASES"]["default"]["OPTIONS"]["sslmode"], "require"
        )
        storage = S3Storage(**config["STORAGES"]["default"]["OPTIONS"])
        url = urlsplit(storage.url("scenes/room.png"))
        self.assertEqual(url.scheme, "https")
        self.assertEqual(url.path, "/storage/v1/s3/scene-images/scenes/room.png")
        self.assertEqual(parse_qs(url.query)["X-Amz-Expires"], ["3600"])
        self.assertIn("X-Amz-Signature", parse_qs(url.query))
        with self.assertRaises(NotImplementedError):
            storage.path("scenes/room.png")

    def test_production_rejects_missing_credentials_and_ephemeral_storage(self):
        for name in ("DJANGO_SECRET_KEY", "DATABASE_URL", "AWS_SECRET_ACCESS_KEY"):
            with self.subTest(name=name):
                environment = {
                    key: value for key, value in PRODUCTION_ENV.items() if key != name
                }
                with self.assertRaisesMessage(ImproperlyConfigured, name):
                    load_settings(environment)
        for update in (
            {"MEDIA_STORAGE": "local"},
            {"DJANGO_ALLOWED_HOSTS": "*"},
            {"DATABASE_URL": "sqlite:///db.sqlite3"},
        ):
            with self.subTest(update=update), self.assertRaises(ImproperlyConfigured):
                load_settings({**PRODUCTION_ENV, **update})

    def test_cors_allows_configured_frontend_only(self):
        with self.settings(CORS_ALLOWED_ORIGINS=["https://spatialize.vercel.app"]):
            allowed = self.client.options(
                "/api/scenes/",
                HTTP_ORIGIN="https://spatialize.vercel.app",
                HTTP_ACCESS_CONTROL_REQUEST_METHOD="PATCH",
            )
            self.assertEqual(
                allowed["Access-Control-Allow-Origin"], "https://spatialize.vercel.app"
            )
            denied = self.client.options(
                "/api/scenes/",
                HTTP_ORIGIN="https://unrelated.example",
                HTTP_ACCESS_CONTROL_REQUEST_METHOD="PATCH",
            )
            self.assertNotIn("Access-Control-Allow-Origin", denied)


class PathlessStorage(Storage):
    """Model a remote backend: bytes and URLs exist, filesystem paths do not."""

    def __init__(self):
        self.files = {}

    def _save(self, name, content):
        self.files[name] = content.read()
        return name

    def _open(self, name, mode="rb"):
        return ContentFile(self.files[name], name=name)

    def exists(self, name):
        return name in self.files

    def url(self, name):
        return f"https://storage.example/{name}?signature=test"


class RemoteUploadTests(TestCase):
    def test_upload_and_retrieve_work_without_a_local_image_path(self):
        fixture = json.loads(
            (
                Path(__file__).with_name("fixtures") / "basic_room_annotated.json"
            ).read_text()
        )
        pixels = io.BytesIO()
        Image.new("RGB", (4, 3)).save(pixels, format="PNG")
        upload = SimpleUploadedFile(
            "room.png", pixels.getvalue(), content_type="image/png"
        )
        storage = PathlessStorage()
        with (
            patch.object(Scene._meta.get_field("image"), "storage", storage),
            patch("scenes.views.analyze_image_bytes", return_value=fixture) as analyze,
        ):
            response = self.client.post("/api/scenes/", {"image": upload})
            self.assertEqual(response.status_code, 201, response.content)
            analyze.assert_called_once_with(pixels.getvalue())
            payload = response.json()
            self.assertEqual(payload["status"], "completed")
            detail = self.client.get(f'/api/scenes/{payload["id"]}/').json()
            self.assertTrue(
                detail["image"].startswith("https://storage.example/scenes/")
            )
            self.assertEqual(detail["scene_data"], payload["scene_data"])
