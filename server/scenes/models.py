from django.db import models

class Scene(models.Model):
    image = models.ImageField(upload_to="scenes/")
    scene_data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Scene {self.id}"