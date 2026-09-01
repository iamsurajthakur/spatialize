from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import api_view
from rest_framework.generics import RetrieveAPIView

from .serializers import SceneSerializer
from .models import Scene
from scenes.vlm_service import analyze_image
from typing import cast
from .validators import validate_scene_json
from .vlm_service import analyze_image


@api_view(["GET"])
def ping(request):
    return Response({"status": "ok"})

class SceneCreateView(APIView):
    parser_classes = [MultiPartParser]
    
    def post(self, request):
        serializer = SceneSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        scene = cast(
            Scene,
            serializer.save(
                scene_data={},
                status="processing",
            )
        )
        
        try:
            # Send the uploaded image to Gemini
            result = analyze_image(scene.image.path)

            # Validate and clean Gemini's output
            validated_scene_data = validate_scene_json(result)

            # Save the validated data
            scene.scene_data = validated_scene_data
            scene.status = "completed"

            scene.save(
                update_fields=[
                    "scene_data",
                    "status",
                ]
            )

            print("\n========== GEMINI RESPONSE ==========\n")
            print(validated_scene_data)
            print("\n=====================================\n")

            
        except Exception as error:
            scene.status = "failed"

            scene.save(
                update_fields=["status"]
            )

            print("\nGemini analysis failed:")
            print(error)

            return Response(
                {
                    "id": scene.id, # type: ignore
                    "status": "failed",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        
        return Response(
            SceneSerializer(scene).data,
            status=status.HTTP_201_CREATED
        )   

class SceneDetailView(RetrieveAPIView):
    queryset = Scene.objects.all()
    serializer_class = SceneSerializer
    
