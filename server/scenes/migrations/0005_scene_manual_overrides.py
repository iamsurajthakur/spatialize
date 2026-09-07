from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("scenes", "0004_alter_scene_status")]

    operations = [
        migrations.AddField(
            model_name="scene",
            name="manual_overrides",
            field=models.JSONField(default=dict, blank=True),
        ),
    ]
