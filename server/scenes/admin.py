from django.contrib import admin
from django.utils.html import format_html

from .models import Scene

@admin.register(Scene)
class SceneAdmin(admin.ModelAdmin):
    list_display = ("id", "image_preview", "created_at")
    readonly_fields = ("created_at", "image_preview")

    @admin.display(description="Preview")
    def image_preview(self, obj):
        if obj.image:
            return format_html(
                '<img src="{}" width="200" style="object-fit: contain;" />',
                obj.image.url,
            )

        return "No image"