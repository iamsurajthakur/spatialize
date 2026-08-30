from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import api_view
from rest_framework.generics import RetrieveAPIView

from .serializers import SceneSerializer
from .sample_scene import SAMPLE_SCENE_DATA
from .models import Scene

@api_view(["GET"])
def ping(request):
    return Response({"status": "ok"})

class SceneCreateView(APIView):
    parser_classes = [MultiPartParser]
    
    def post(self, request):
        serializer = SceneSerializer(data=request.data)
        
        if serializer.is_valid():
            scene = serializer.save(
                scene_data=SAMPLE_SCENE_DATA
            )
            
            return Response(
                SceneSerializer(scene).data,
                status=status.HTTP_201_CREATED,
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST,
        )
        
class SceneDetailView(RetrieveAPIView):
    queryset = Scene.objects.all()
    serializer_class = SceneSerializer
    
