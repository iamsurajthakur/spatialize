from django.db import models


class Scene(models.Model):
    STATUS_CHOICES = [
        ("processing", "Processing"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    image = models.ImageField(upload_to="scenes/")

    scene_data = models.JSONField(default=dict)
    manual_overrides = models.JSONField(default=dict, blank=True)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="processing",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Scene {self.id}"  # type: ignore
