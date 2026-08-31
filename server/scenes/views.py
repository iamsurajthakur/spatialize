from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import api_view
from rest_framework.generics import RetrieveAPIView

from .serializers import SceneSerializer
from .sample_scene import SAMPLE_SCENE_DATA
from .models import Scene
from scenes.vlm_service import analyze_image
from typing import cast


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
            serializer.save(scene_data=SAMPLE_SCENE_DATA)
        )
        
        try:
            result = analyze_image(scene.image.path)
            
            print("\n========== GEMINI RESPONSE ==========\n")
            print(result)
            print("\n=====================================\n")
            
        except Exception as error:
            print("\nGemini analysis failed:")
            print(error)
        
        return Response(
            SceneSerializer(scene).data,
            status=status.HTTP_201_CREATED
        )   

class SceneDetailView(RetrieveAPIView):
    queryset = Scene.objects.all()
    serializer_class = SceneSerializer
    
