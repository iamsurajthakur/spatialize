import io
import os
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from django.core.management import CommandError, call_command
from google.genai import errors


class CheckAiModelsTests(TestCase):
    def test_reports_individual_failures_and_success_without_provider_details(self):
        output = io.StringIO()
        with (
            patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}),
            patch("scenes.management.commands.check_ai_models.genai.Client") as client,
        ):
            generate = (
                client.return_value.__enter__.return_value.models.generate_content
            )
            generate.side_effect = [
                errors.ServerError(503, {"message": "private-provider-details"}),
                SimpleNamespace(text='{"color":"blue"}'),
            ]
            call_command("check_ai_models", model=["busy", "working"], stdout=output)
            self.assertEqual(
                [call.kwargs["model"] for call in generate.call_args_list],
                ["busy", "working"],
            )
            self.assertEqual(
                generate.call_args.kwargs["contents"][0].inline_data.mime_type,
                "image/png",
            )
        self.assertIn("FAIL busy: HTTP 503", output.getvalue())
        self.assertIn("OK   working", output.getvalue())
        self.assertNotIn("private-provider-details", output.getvalue())

    def test_all_failed_probes_exit_unsuccessfully(self):
        with (
            patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}),
            patch("scenes.management.commands.check_ai_models.genai.Client") as client,
        ):
            client.return_value.__enter__.return_value.models.generate_content.side_effect = errors.ClientError(
                404, {}
            )
            with self.assertRaisesRegex(CommandError, "No model passed"):
                call_command("check_ai_models", model=["missing"], stdout=io.StringIO())
