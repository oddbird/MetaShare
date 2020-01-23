from django.contrib.auth import get_user_model
from django.http import HttpResponseRedirect
from django.utils.translation import gettext_lazy as _
from django_filters.rest_framework import DjangoFilterBackend
from github3.exceptions import ResponseError
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import GitHubHookAuthentication
from .filters import ProjectFilter, RepositoryFilter, ScratchOrgFilter, TaskFilter
from .hook_serializers import PrHookSerializer, PushHookSerializer
from .models import SCRATCH_ORG_TYPES, Project, Repository, ScratchOrg, Task
from .paginators import CustomPaginator
from .serializers import (
    CommitSerializer,
    CreatePrSerializer,
    FullUserSerializer,
    MinimalUserSerializer,
    ProjectSerializer,
    RepositorySerializer,
    ScratchOrgSerializer,
    TaskSerializer,
)

User = get_user_model()


class CurrentUserObjectMixin:
    def get_queryset(self):
        return self.model.objects.filter(id=self.request.user.id)

    def get_object(self):
        return self.get_queryset().get()


class CreatePrMixin:
    error_pr_exists = ""  # Implement this

    @action(detail=True, methods=["POST"])
    def create_pr(self, request, pk=None):
        serializer = CreatePrSerializer(data=self.request.data)
        if not serializer.is_valid():
            return Response(
                serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY
            )
        instance = self.get_object()
        if instance.pr_is_open:
            raise ValidationError(self.error_pr_exists)
        instance.queue_create_pr(request.user, **serializer.validated_data)
        return Response(
            self.get_serializer(instance).data, status=status.HTTP_202_ACCEPTED
        )


class HookView(APIView):
    authentication_classes = (GitHubHookAuthentication,)

    def post(self, request):
        # To support the various formats that GitHub can post to this endpoint:
        serializers = {
            "push": PushHookSerializer,
            "pull_request": PrHookSerializer,
        }
        serializer_class = serializers.get(request.META.get("HTTP_X_GITHUB_EVENT"))
        if serializer_class is None:
            return Response(status=status.HTTP_400_BAD_REQUEST)
        serializer = serializer_class(data=request.data)
        if not serializer.is_valid():
            return Response(
                serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY
            )

        serializer.process_hook()
        return Response(status=status.HTTP_202_ACCEPTED)


class UserView(CurrentUserObjectMixin, generics.RetrieveAPIView):
    """
    Shows the current user.
    """

    model = User
    serializer_class = FullUserSerializer
    permission_classes = (IsAuthenticated,)


class UserRefreshView(CurrentUserObjectMixin, APIView):
    model = User
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        from .jobs import refresh_github_repositories_for_user_job

        user = self.get_object()
        refresh_github_repositories_for_user_job.delay(user)
        return Response(status=status.HTTP_202_ACCEPTED)


class UserDisconnectSFView(CurrentUserObjectMixin, APIView):
    model = User
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        user = self.get_object()
        user.invalidate_salesforce_credentials()
        serializer = FullUserSerializer(user)
        return Response(serializer.data, status=status.HTTP_200_OK)


class UserViewSet(viewsets.ModelViewSet):
    permission_classes = (IsAuthenticated,)
    serializer_class = MinimalUserSerializer
    pagination_class = CustomPaginator
    queryset = User.objects.all()


class RepositoryViewSet(viewsets.ModelViewSet):
    permission_classes = (IsAuthenticated,)
    serializer_class = RepositorySerializer
    filter_backends = (DjangoFilterBackend,)
    filterset_class = RepositoryFilter
    pagination_class = CustomPaginator
    model = Repository

    def get_queryset(self):
        repo_ids = self.request.user.repositories.values_list("repo_id", flat=True)

        for repo in Repository.objects.filter(repo_id__isnull=True):
            try:
                repo.get_repo_id(self.request.user)
            except ResponseError:
                pass

        return Repository.objects.filter(repo_id__isnull=False, repo_id__in=repo_ids)

    @action(detail=True, methods=["POST"])
    def refresh_github_users(self, request, pk=None):
        instance = self.get_object()
        instance.queue_populate_github_users()
        return Response(status=status.HTTP_202_ACCEPTED)


class ProjectViewSet(CreatePrMixin, viewsets.ModelViewSet):
    permission_classes = (IsAuthenticated,)
    serializer_class = ProjectSerializer
    pagination_class = CustomPaginator
    queryset = Project.objects.all()
    filter_backends = (DjangoFilterBackend,)
    filterset_class = ProjectFilter
    error_pr_exists = _("Project has already been submitted for review.")


class TaskViewSet(CreatePrMixin, viewsets.ModelViewSet):
    permission_classes = (IsAuthenticated,)
    serializer_class = TaskSerializer
    queryset = Task.objects.all()
    filter_backends = (DjangoFilterBackend,)
    filterset_class = TaskFilter
    error_pr_exists = _("Task has already been submitted for review.")


class ScratchOrgViewSet(viewsets.ModelViewSet):
    permission_classes = (IsAuthenticated,)
    serializer_class = ScratchOrgSerializer
    queryset = ScratchOrg.objects.all()
    filter_backends = (DjangoFilterBackend,)
    filterset_class = ScratchOrgFilter

    def perform_create(self, *args, **kwargs):
        if self.request.user.is_devhub_enabled:
            super().perform_create(*args, **kwargs)
        else:
            raise PermissionDenied(
                _(
                    "User is not connected to a Salesforce organization "
                    "with Dev Hub enabled."
                )
            )

    def perform_destroy(self, instance):
        if self.request.user == instance.owner:
            instance.queue_delete()
        else:
            raise PermissionDenied(
                _("User is not the same user who created the ScratchOrg.")
            )

    def list(self, request, *args, **kwargs):
        # XXX: This method is copied verbatim from
        # rest_framework.mixins.RetrieveModelMixin, because I needed to
        # insert the get_unsaved_changes line in the middle.
        queryset = self.filter_queryset(self.get_queryset())

        # XXX: I am apprehensive about the possibility of flooding the
        # worker queues easily this way:
        filters = {
            "owner": request.user,
            "org_type": SCRATCH_ORG_TYPES.Dev,
            "url__isnull": False,
            "delete_queued_at__isnull": True,
            "currently_capturing_changes": False,
            "currently_refreshing_changes": False,
        }
        for instance in queryset.filter(**filters):
            instance.queue_get_unsaved_changes()

        # XXX: If we ever paginate this endpoint, we will need to add
        # pagination logic back in here.

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        # XXX: This method is adapted from
        # rest_framework.mixins.RetrieveModelMixin, but one particular
        # change: we needed to insert the get_unsaved_changes line in
        # the middle.
        instance = self.get_object()
        conditions = [
            instance.owner == request.user,
            instance.org_type == SCRATCH_ORG_TYPES.Dev,
            instance.url is not None,
            instance.delete_queued_at is None,
            not instance.currently_capturing_changes,
            not instance.currently_refreshing_changes,
        ]
        if all(conditions):
            instance.queue_get_unsaved_changes()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=["POST"])
    def commit(self, request, pk=None):
        serializer = CommitSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                serializer.errors, status=status.HTTP_422_UNPROCESSABLE_ENTITY
            )

        scratch_org = self.get_object()
        if not request.user == scratch_org.owner:
            return Response(
                {"error": _("Requesting user did not create scratch org.")},
                status=status.HTTP_403_FORBIDDEN,
            )
        commit_message = serializer.validated_data["commit_message"]
        desired_changes = serializer.validated_data["changes"]
        scratch_org.queue_commit_changes(request.user, desired_changes, commit_message)
        return Response(
            self.get_serializer(scratch_org).data, status=status.HTTP_202_ACCEPTED
        )

    @action(detail=True, methods=["GET"])
    def redirect(self, request, pk=None):
        scratch_org = self.get_object()
        if not request.user == scratch_org.owner:
            return Response(
                {"error": _("Requesting user did not create scratch org.")},
                status=status.HTTP_403_FORBIDDEN,
            )
        url = scratch_org.get_login_url()
        return HttpResponseRedirect(redirect_to=url)
