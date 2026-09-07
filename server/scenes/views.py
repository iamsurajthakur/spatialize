import logging
from typing import cast

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.generics import RetrieveAPIView
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .geometry_engine import compute_geometry
from .models import Scene
from .schemas import SceneGeometryInput
from .serializers import ManualOverridesSerializer, SceneSerializer
from .validators import validate_scene_json
from .vlm_service import analyze_image

logger = logging.getLogger(__name__)


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
            ),
        )

        try:
            # Send the uploaded image to Gemini
            vlm_result = analyze_image(scene.image.path)

            # Convert to SceneGeometryInput
            geom_input = SceneGeometryInput(**vlm_result)

            # Convert semantic relations to 3D geometry
            scene_data_obj = compute_geometry(geom_input)

            # Dump to dict
            raw_scene_data = scene_data_obj.model_dump()

            # Validate and clean final SceneData
            validated_scene_data = validate_scene_json(raw_scene_data)

            # Save the validated data
            scene.scene_data = validated_scene_data
            scene.status = "completed"

            scene.save(
                update_fields=[
                    "scene_data",
                    "status",
                ]
            )

            logger.info(
                "Scene %s placed using %s",
                scene.pk,
                validated_scene_data["debug_info"]["floor_mapping"]["method"],
            )

        except Exception as error:
            scene.status = "failed"

            scene.save(update_fields=["status"])

            logger.exception("Scene %s analysis/geometry failed: %s", scene.pk, error)

            return Response(
                {
                    "id": scene.id,  # type: ignore
                    "status": "failed",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(SceneSerializer(scene).data, status=status.HTTP_201_CREATED)


class SceneDetailView(RetrieveAPIView):
    queryset = Scene.objects.all()
    serializer_class = SceneSerializer

    def patch(self, request, *args, **kwargs):
        scene = self.get_object()
        serializer = ManualOverridesSerializer(scene, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(SceneSerializer(scene, context=self.get_serializer_context()).data)
