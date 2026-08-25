from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import api_view

from .serializers import SceneSerializer

@api_view(["GET"])
def ping(request):
    return Response({"status": "ok"})

class SceneCreateView(APIView):
    parser_classes = [MultiPartParser]
    
    def post(self, request):
        serializer = SceneSerializer(data=request.data)
        
        if serializer.is_valid():
            scene = serializer.save()
            return Response(
                SceneSerializer(scene).data,
                status=status.HTTP_201_CREATED,
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST,
        )