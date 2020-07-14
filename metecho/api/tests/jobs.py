from collections import namedtuple
from contextlib import ExitStack
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from django.utils.timezone import now
from github3.exceptions import NotFoundError
from simple_salesforce.exceptions import SalesforceGeneralError

from ..jobs import (
    TaskReviewIntegrityError,
    _create_branches_on_github,
    _create_org_and_run_flow,
    alert_user_about_expiring_org,
    available_task_org_config_names,
    commit_changes_from_org,
    create_branches_on_github_then_create_scratch_org,
    create_gh_branch_for_new_project,
    create_pr,
    delete_scratch_org,
    get_social_image,
    get_unsaved_changes,
    populate_github_users,
    refresh_commits,
    refresh_github_repositories_for_user,
    refresh_scratch_org,
    submit_review,
)
from ..models import SCRATCH_ORG_TYPES

Author = namedtuple("Author", ("avatar_url", "login"))
Commit = namedtuple(
    "Commit",
    ("sha", "author", "message", "commit", "html_url"),
    defaults=("", None, "", None, ""),
)
PATCH_ROOT = "metecho.api.jobs"


@pytest.mark.django_db
class TestCreateBranchesOnGitHub:
    def test_create_branches_on_github(self, user_factory, task_factory):
        user = user_factory()
        task = task_factory()
        project = task.project

        with ExitStack() as stack:
            stack.enter_context(patch(f"{PATCH_ROOT}.local_github_checkout"))
            project_config = stack.enter_context(patch("metecho.api.gh.ProjectConfig"))
            project_config_instance = MagicMock(project__git__prefix_feature="feature/")
            project_config.return_value = project_config_instance
            get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
            repository = MagicMock()
            repository.branch.return_value = MagicMock(
                **{"latest_sha.return_value": "123abc"}
            )
            get_repo_info.return_value = repository

            _create_branches_on_github(
                user=user,
                repo_id=123,
                project=project,
                task=task,
                originating_user_id="123abc",
            )

            assert repository.create_branch_ref.called

    def test_create_branches_on_github__missing(self, user_factory, project_factory):
        user = user_factory()
        with ExitStack() as stack:
            try_to_make_branch = stack.enter_context(
                patch(f"{PATCH_ROOT}.try_to_make_branch")
            )
            get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
            get_repo_info.return_value = MagicMock(
                **{"branch.side_effect": NotFoundError(MagicMock())}
            )
            project = project_factory(branch_name="placeholder")
            create_gh_branch_for_new_project(project, user=user)
            assert try_to_make_branch.called

    def test_create_branches_on_github__settings(
        self, settings, user_factory, task_factory
    ):
        settings.BRANCH_PREFIX = "test_prefix"
        user = user_factory()
        task = task_factory()
        project = task.project

        with ExitStack() as stack:
            local_github_checkout = stack.enter_context(
                patch(f"{PATCH_ROOT}.local_github_checkout")
            )
            try_to_make_branch = stack.enter_context(
                patch(f"{PATCH_ROOT}.try_to_make_branch")
            )
            try_to_make_branch.return_value = "bleep"
            get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
            repository = MagicMock()
            repository.branch.return_value = MagicMock(
                **{"latest_sha.return_value": "123abc"}
            )
            get_repo_info.return_value = repository

            _create_branches_on_github(
                user=user,
                repo_id=123,
                project=project,
                task=task,
                originating_user_id="123abc",
            )

            assert try_to_make_branch.called
            assert not local_github_checkout.called

    def test_create_branches_on_github__repo_branch_prefix(
        self, user_factory, task_factory
    ):
        user = user_factory()
        task = task_factory(project__repository__branch_prefix="test_prefix")
        project = task.project

        with ExitStack() as stack:
            local_github_checkout = stack.enter_context(
                patch(f"{PATCH_ROOT}.local_github_checkout")
            )
            try_to_make_branch = stack.enter_context(
                patch(f"{PATCH_ROOT}.try_to_make_branch")
            )
            try_to_make_branch.return_value = "bleep"
            get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
            repository = MagicMock()
            repository.branch.return_value = MagicMock(
                **{"latest_sha.return_value": "123abc"}
            )
            get_repo_info.return_value = repository

            _create_branches_on_github(
                user=user,
                repo_id=123,
                project=project,
                task=task,
                originating_user_id="123abc",
            )

            assert try_to_make_branch.called
            assert not local_github_checkout.called

    def test_create_branches_on_github__already_there(
        self, user_factory, project_factory, task_factory
    ):
        user = user_factory()
        with ExitStack() as stack:
            try_to_make_branch = stack.enter_context(
                patch(f"{PATCH_ROOT}.try_to_make_branch")
            )
            get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
            stack.enter_context(patch(f"{PATCH_ROOT}.project_create_branch"))
            get_repo_info.return_value = MagicMock(
                **{
                    "pull_requests.return_value": (
                        MagicMock(number=123, closed_at=None, merged_at=None,)
                        for _ in range(1)
                    ),
                    "compare_commits.return_value": MagicMock(ahead_by=0),
                }
            )

            project = project_factory(branch_name="pepin")
            create_gh_branch_for_new_project(project, user=user)
            assert not try_to_make_branch.called

            task = task_factory(branch_name="charlemagne", project=project)

        with ExitStack() as stack:
            get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
            repository = MagicMock()
            get_repo_info.return_value = repository

            _create_branches_on_github(
                user=user,
                repo_id=123,
                project=project,
                task=task,
                originating_user_id="123abc",
            )

            assert not repository.create_branch_ref.called


@pytest.mark.django_db
class TestAlertUserAboutExpiringOrg:
    def test_soft_deleted_model(self, scratch_org_factory):
        scratch_org = scratch_org_factory()
        scratch_org.delete()
        with patch("metecho.api.models.send_mail") as send_mail:
            assert alert_user_about_expiring_org(org=scratch_org, days=3) is None
            assert not send_mail.called

    def test_good(self, scratch_org_factory):
        scratch_org = scratch_org_factory(unsaved_changes={"something": 1})
        with ExitStack() as stack:
            send_mail = stack.enter_context(patch("metecho.api.models.send_mail"))
            get_unsaved_changes = stack.enter_context(
                patch(f"{PATCH_ROOT}.get_unsaved_changes")
            )
            assert alert_user_about_expiring_org(org=scratch_org, days=3) is None
            assert get_unsaved_changes.called
            assert send_mail.called


def test_create_org_and_run_flow():
    with ExitStack() as stack:
        stack.enter_context(patch(f"{PATCH_ROOT}.get_latest_revision_numbers"))
        create_org = stack.enter_context(patch(f"{PATCH_ROOT}.create_org"))
        create_org.return_value = (
            MagicMock(expires=datetime(2020, 1, 1, 12, 0)),
            MagicMock(),
            MagicMock(),
        )
        run_flow = stack.enter_context(patch(f"{PATCH_ROOT}.run_flow"))
        stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
        get_valid_target_directories = stack.enter_context(
            patch(f"{PATCH_ROOT}.get_valid_target_directories")
        )
        get_valid_target_directories.return_value = (
            {"source": ["src"], "config": [], "post": [], "pre": []},
            False,
        )
        stack.enter_context(patch(f"{PATCH_ROOT}.get_scheduler"))
        Path = stack.enter_context(patch(f"{PATCH_ROOT}.Path"))
        Path.return_value = MagicMock(**{"read_text.return_value": "test logs"})
        _create_org_and_run_flow(
            MagicMock(org_type=SCRATCH_ORG_TYPES.Dev),
            user=MagicMock(),
            repo_id=123,
            repo_branch=MagicMock(),
            project_path="",
            originating_user_id=None,
        )

        assert create_org.called
        assert run_flow.called


def test_create_org_and_run_flow__fall_back_to_cases():
    with ExitStack() as stack:
        stack.enter_context(patch(f"{PATCH_ROOT}.get_latest_revision_numbers"))
        create_org = stack.enter_context(patch(f"{PATCH_ROOT}.create_org"))
        create_org.return_value = (
            MagicMock(expires=datetime(2020, 1, 1, 12, 0)),
            MagicMock(
                **{
                    "project_config.keychain.get_org.return_value": MagicMock(
                        setup_flow=None
                    ),
                }
            ),
            MagicMock(),
        )
        run_flow = stack.enter_context(patch(f"{PATCH_ROOT}.run_flow"))
        stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
        get_valid_target_directories = stack.enter_context(
            patch(f"{PATCH_ROOT}.get_valid_target_directories")
        )
        get_valid_target_directories.return_value = (
            {"source": ["src"], "config": [], "post": [], "pre": []},
            False,
        )
        stack.enter_context(patch(f"{PATCH_ROOT}.get_scheduler"))
        Path = stack.enter_context(patch(f"{PATCH_ROOT}.Path"))
        Path.return_value = MagicMock(**{"read_text.return_value": "test logs"})
        _create_org_and_run_flow(
            MagicMock(
                **{"org_type": SCRATCH_ORG_TYPES.Dev, "task.org_config_name": "dev"}
            ),
            user=MagicMock(),
            repo_id=123,
            repo_branch=MagicMock(),
            project_path="",
            originating_user_id=None,
        )

        assert create_org.called
        assert run_flow.called


@pytest.mark.django_db
def test_get_unsaved_changes(scratch_org_factory):
    scratch_org = scratch_org_factory(
        latest_revision_numbers={"TypeOne": {"NameOne": 10}}
    )
    with ExitStack() as stack:
        stack.enter_context(patch(f"{PATCH_ROOT}.local_github_checkout"))
        stack.enter_context(patch("metecho.api.sf_org_changes.get_repo_info"))
        get_valid_target_directories = stack.enter_context(
            patch(f"{PATCH_ROOT}.get_valid_target_directories")
        )
        get_valid_target_directories.return_value = (
            {"source": ["src"], "config": [], "post": [], "pre": []},
            False,
        )
        get_latest_revision_numbers = stack.enter_context(
            patch(f"{PATCH_ROOT}.get_latest_revision_numbers")
        )
        get_latest_revision_numbers.return_value = {
            "TypeOne": {"NameOne": 13},
            "TypeTwo": {"NameTwo": 10},
        }

        get_unsaved_changes(scratch_org=scratch_org, originating_user_id=None)
        scratch_org.refresh_from_db()

        assert scratch_org.unsaved_changes == {
            "TypeOne": ["NameOne"],
            "TypeTwo": ["NameTwo"],
        }
        assert scratch_org.latest_revision_numbers == {"TypeOne": {"NameOne": 10}}


def test_create_branches_on_github_then_create_scratch_org():
    # Not a great test, but not a complicated function.
    with ExitStack() as stack:
        stack.enter_context(patch(f"{PATCH_ROOT}.local_github_checkout"))
        _create_branches_on_github = stack.enter_context(
            patch(f"{PATCH_ROOT}._create_branches_on_github")
        )
        _create_org_and_run_flow = stack.enter_context(
            patch(f"{PATCH_ROOT}._create_org_and_run_flow")
        )
        stack.enter_context(patch(f"{PATCH_ROOT}.get_scheduler"))

        create_branches_on_github_then_create_scratch_org(
            scratch_org=MagicMock(), originating_user_id=None
        )

        assert _create_branches_on_github.called
        assert _create_org_and_run_flow.called


@pytest.mark.django_db
class TestRefreshScratchOrg:
    def test_refresh_scratch_org(self, scratch_org_factory):
        scratch_org = scratch_org_factory()
        with ExitStack() as stack:
            delete_org = stack.enter_context(patch(f"{PATCH_ROOT}.delete_org"))
            stack.enter_context(patch(f"{PATCH_ROOT}.local_github_checkout"))
            _create_org_and_run_flow = stack.enter_context(
                patch(f"{PATCH_ROOT}._create_org_and_run_flow")
            )
            refresh_scratch_org(scratch_org, originating_user_id=None)

            assert delete_org.called
            assert _create_org_and_run_flow.called

    def test_refresh_scratch_org__error(self, scratch_org_factory):
        scratch_org = scratch_org_factory()
        with ExitStack() as stack:
            delete_org = stack.enter_context(patch(f"{PATCH_ROOT}.delete_org"))
            delete_org.side_effect = Exception
            async_to_sync = stack.enter_context(
                patch("metecho.api.model_mixins.async_to_sync")
            )
            logger = stack.enter_context(patch(f"{PATCH_ROOT}.logger"))

            with pytest.raises(Exception):
                refresh_scratch_org(scratch_org, originating_user_id=None)

            assert async_to_sync.called
            assert logger.error.called


@pytest.mark.django_db
def test_delete_scratch_org(scratch_org_factory):
    scratch_org = scratch_org_factory()
    with patch(f"{PATCH_ROOT}.delete_org") as sf_delete_scratch_org:
        delete_scratch_org(scratch_org, originating_user_id=None)

        assert sf_delete_scratch_org.called


@pytest.mark.django_db
def test_delete_scratch_org__exception(scratch_org_factory):
    scratch_org = scratch_org_factory()
    with ExitStack() as stack:
        stack.enter_context(patch(f"{PATCH_ROOT}.async_to_sync"))
        get_latest_revision_numbers = stack.enter_context(
            patch(f"{PATCH_ROOT}.get_latest_revision_numbers")
        )
        get_latest_revision_numbers.return_value = {
            "name": {"member": 1, "member2": 1},
            "name1": {"member": 1, "member2": 1},
        }
        sf_delete_scratch_org = stack.enter_context(patch(f"{PATCH_ROOT}.delete_org"))
        sf_delete_scratch_org.side_effect = SalesforceGeneralError(
            "https://example.com", 418, "I'M A TEAPOT", [{"error": "Short and stout"}]
        )
        with pytest.raises(SalesforceGeneralError):
            delete_scratch_org(scratch_org, originating_user_id=None)

        scratch_org.refresh_from_db()
        assert scratch_org.delete_queued_at is None
        assert get_latest_revision_numbers.called


def test_refresh_github_repositories_for_user(user_factory):
    user = MagicMock()
    refresh_github_repositories_for_user(user)
    assert user.refresh_repositories.called


@pytest.mark.django_db
def test_commit_changes_from_org(scratch_org_factory, user_factory):
    scratch_org = scratch_org_factory()
    user = user_factory()
    with ExitStack() as stack:
        commit_changes_to_github = stack.enter_context(
            patch(f"{PATCH_ROOT}.commit_changes_to_github")
        )
        get_latest_revision_numbers = stack.enter_context(
            patch(f"{PATCH_ROOT}.get_latest_revision_numbers")
        )
        get_latest_revision_numbers.return_value = {
            "name": {"member": 1, "member2": 1},
            "name1": {"member": 1, "member2": 1},
        }
        get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
        commit = MagicMock(
            sha="12345",
            html_url="https://github.com/test/user/foo",
            commit=MagicMock(author={"date": now()}),
        )
        repository = MagicMock()
        repository.branch.return_value = MagicMock(commit=commit)
        get_repo_info.return_value = repository

        desired_changes = {"name": ["member"]}
        commit_message = "test message"
        target_directory = "src"
        assert scratch_org.latest_revision_numbers == {}
        commit_changes_from_org(
            scratch_org=scratch_org,
            user=user,
            desired_changes=desired_changes,
            commit_message=commit_message,
            target_directory=target_directory,
            originating_user_id=None,
        )

        assert commit_changes_to_github.called
        assert scratch_org.latest_revision_numbers == {"name": {"member": 1}}


# TODO: this should be bundled with each function, not all error-handling together.
@pytest.mark.django_db
class TestErrorHandling:
    def test_create_branches_on_github_then_create_scratch_org(
        self, scratch_org_factory
    ):
        scratch_org = scratch_org_factory()
        with ExitStack() as stack:
            async_to_sync = stack.enter_context(
                patch("metecho.api.model_mixins.async_to_sync")
            )
            _create_branches_on_github = stack.enter_context(
                patch(f"{PATCH_ROOT}._create_branches_on_github")
            )
            _create_branches_on_github.side_effect = Exception
            stack.enter_context(patch(f"{PATCH_ROOT}.local_github_checkout"))
            scratch_org.delete = MagicMock()

            with pytest.raises(Exception):
                create_branches_on_github_then_create_scratch_org(
                    scratch_org=scratch_org, originating_user_id=None,
                )

            assert scratch_org.delete.called
            assert async_to_sync.called

    def test_get_unsaved_changes(self, scratch_org_factory):
        scratch_org = scratch_org_factory()
        with ExitStack() as stack:
            async_to_sync = stack.enter_context(
                patch("metecho.api.model_mixins.async_to_sync")
            )
            get_latest_revision_numbers = stack.enter_context(
                patch(f"{PATCH_ROOT}.get_latest_revision_numbers")
            )
            get_latest_revision_numbers.side_effect = Exception

            with pytest.raises(Exception):
                get_unsaved_changes(scratch_org, originating_user_id=None)

            assert async_to_sync.called

    def test_commit_changes_from_org(self, scratch_org_factory, user_factory):
        user = user_factory()
        scratch_org = scratch_org_factory()
        with ExitStack() as stack:
            async_to_sync = stack.enter_context(
                patch("metecho.api.model_mixins.async_to_sync")
            )
            commit_changes_to_github = stack.enter_context(
                patch(f"{PATCH_ROOT}.commit_changes_to_github")
            )
            commit_changes_to_github.side_effect = Exception

            with pytest.raises(Exception):
                commit_changes_from_org(
                    scratch_org=scratch_org,
                    user=user,
                    desired_changes={},
                    commit_message="message",
                    target_directory="src",
                    originating_user_id=None,
                )

            assert async_to_sync.called


@pytest.mark.django_db
class TestRefreshCommits:
    def test_task__no_user(self, repository_factory, project_factory, task_factory):
        repository = repository_factory()
        project = project_factory(repository=repository)
        task = task_factory(project=project, branch_name="task", origin_sha="1234abcd")
        with ExitStack() as stack:
            commit1 = Commit(
                **{
                    "sha": "abcd1234",
                    "author": Author(
                        **{
                            "avatar_url": "https://example.com/img.png",
                            "login": "test_user",
                        }
                    ),
                    "message": "Test message 1",
                    "commit": Commit(**{"author": {"date": "2019-12-09 13:00"}}),
                    "html_url": "https://github.com/test/user/foo",
                }
            )
            commit2 = Commit(
                **{
                    "sha": "1234abcd",
                    "author": None,
                    "message": "Test message 2",
                    "commit": Commit(**{"author": {"date": "2019-12-09 12:30"}}),
                    "html_url": "https://github.com/test/user/foo",
                }
            )
            repo = MagicMock(**{"commits.return_value": [commit1, commit2]})
            get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
            get_repo_info.return_value = repo

            refresh_commits(
                repository=repository, branch_name="task", originating_user_id=None
            )
            task.refresh_from_db()
            assert len(task.commits) == 0

    def test_task__user(
        self,
        user_factory,
        repository_factory,
        project_factory,
        task_factory,
        git_hub_repository_factory,
    ):
        user = user_factory()
        repository = repository_factory(repo_id=123)
        git_hub_repository_factory(repo_id=123, user=user)
        project = project_factory(repository=repository)
        task = task_factory(project=project, branch_name="task", origin_sha="1234abcd")
        with ExitStack() as stack:
            commit1 = Commit(
                **{
                    "sha": "abcd1234",
                    "author": Author(
                        **{
                            "avatar_url": "https://example.com/img.png",
                            "login": "test_user",
                        }
                    ),
                    "message": "Test message 1",
                    "commit": Commit(**{"author": {"date": "2019-12-09 13:00"}}),
                    "html_url": "https://github.com/test/user/foo",
                }
            )
            commit2 = Commit(
                **{
                    "sha": "1234abcd",
                    "author": None,
                    "message": "Test message 2",
                    "commit": Commit(**{"author": {"date": "2019-12-09 12:30"}}),
                    "html_url": "https://github.com/test/user/foo",
                }
            )
            repo = MagicMock(**{"commits.return_value": [commit1, commit2]})
            get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
            get_repo_info.return_value = repo

            refresh_commits(
                repository=repository, branch_name="task", originating_user_id=None
            )
            task.refresh_from_db()
            assert len(task.commits) == 1


@pytest.mark.django_db
def test_create_pr(user_factory, task_factory):
    user = user_factory()
    task = task_factory(assigned_qa={"id": user.github_account.uid})
    with ExitStack() as stack:
        pr = MagicMock(number=123)
        repository = MagicMock(**{"create_pull.return_value": pr})
        get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
        get_repo_info.return_value = repository

        create_pr(
            task,
            user,
            repo_id=123,
            base="main",
            head="feature",
            title="My PR",
            critical_changes="",
            additional_changes="",
            issues="",
            notes="",
            alert_assigned_qa=True,
            originating_user_id=None,
        )

        assert repository.create_pull.called
        assert task.pr_number == 123


@pytest.mark.django_db
def test_create_pr__error(user_factory, task_factory):
    user = user_factory()
    task = task_factory()
    with ExitStack() as stack:
        repository = MagicMock()
        get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
        get_repo_info.return_value = repository
        repository.create_pull = MagicMock(side_effect=Exception)
        async_to_sync = stack.enter_context(
            patch("metecho.api.model_mixins.async_to_sync")
        )

        with pytest.raises(Exception):
            create_pr(
                task,
                user,
                repo_id=123,
                base="main",
                head="feature",
                title="My PR",
                critical_changes="",
                additional_changes="",
                issues="",
                notes="",
                alert_assigned_qa=True,
                originating_user_id=None,
            )

        assert async_to_sync.called


@pytest.mark.django_db
class TestPopulateGitHubUsers:
    def test_user_present(
        self, user_factory, repository_factory, git_hub_repository_factory,
    ):
        user = user_factory()
        repository = repository_factory(repo_id=123)
        git_hub_repository_factory(repo_id=123, user=user)
        with patch(f"{PATCH_ROOT}.get_repo_info") as get_repo_info:
            collab1 = MagicMock(
                id=123,
                login="test-user-1",
                avatar_url="https://example.com/avatar1.png",
            )
            collab2 = MagicMock(
                id=456,
                login="test-user-2",
                avatar_url="https://example.com/avatar2.png",
            )
            repo = MagicMock(**{"collaborators.return_value": [collab1, collab2]})
            get_repo_info.return_value = repo

            populate_github_users(repository, originating_user_id=None)
            repository.refresh_from_db()
            assert len(repository.github_users) == 2

    def test_user_missing(self, repository_factory):
        repository = repository_factory(repo_id=123)
        with patch(f"{PATCH_ROOT}.logger") as logger:
            populate_github_users(repository, originating_user_id=None)
            assert logger.warning.called

    def test__error(self, user_factory, repository_factory, git_hub_repository_factory):
        user = user_factory()
        repository = repository_factory(repo_id=123)
        git_hub_repository_factory(repo_id=123, user=user)
        with ExitStack() as stack:
            get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
            get_repo_info.side_effect = Exception
            async_to_sync = stack.enter_context(
                patch("metecho.api.model_mixins.async_to_sync")
            )
            logger = stack.enter_context(patch(f"{PATCH_ROOT}.logger"))

            with pytest.raises(Exception):
                populate_github_users(repository, originating_user_id=None)

            assert logger.error.called
            assert async_to_sync.called


@pytest.mark.django_db
class TestSubmitReview:
    def test_good(self, task_factory, user_factory):
        with ExitStack() as stack:
            get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))

            user = user_factory()
            task = task_factory(
                pr_is_open=True, review_valid=True, review_sha="test_sha"
            )
            task.finalize_submit_review = MagicMock()
            pr = MagicMock()
            repository = MagicMock(**{"pull_request.return_value": pr})
            get_repo_info.return_value = repository
            submit_review(
                user=user,
                task=task,
                data={
                    "notes": "Notes",
                    "status": "APPROVE",
                    "delete_org": False,
                    "org": None,
                },
                originating_user_id=None,
            )

            assert task.finalize_submit_review.called
            assert task.finalize_submit_review.call_args.args
            assert task.finalize_submit_review.call_args.kwargs == {
                "sha": "test_sha",
                "status": "APPROVE",
                "delete_org": False,
                "org": None,
                "originating_user_id": None,
            }, task.finalize_submit_review.call_args.kwargs
            assert "err" not in task.finalize_submit_review.call_args.kwargs

    def test_good__has_org(self, task_factory, scratch_org_factory, user_factory):
        with ExitStack() as stack:
            stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
            get_repo_info = stack.enter_context(
                patch("metecho.api.model_mixins.get_repo_info")
            )

            user = user_factory()
            task = task_factory(pr_is_open=True, review_valid=True, review_sha="none")
            scratch_org = scratch_org_factory(task=task, latest_commit="test_sha")
            task.finalize_submit_review = MagicMock()
            task.project.repository.get_repo_id = MagicMock()
            pr = MagicMock()
            repository = MagicMock(**{"pull_request.return_value": pr})
            get_repo_info.return_value = repository
            submit_review(
                user=user,
                task=task,
                data={
                    "notes": "Notes",
                    "status": "APPROVE",
                    "delete_org": False,
                    "org": scratch_org,
                },
                originating_user_id=None,
            )

            assert task.finalize_submit_review.called
            assert task.finalize_submit_review.call_args.args
            assert task.finalize_submit_review.call_args.kwargs == {
                "sha": "test_sha",
                "status": "APPROVE",
                "delete_org": False,
                "org": scratch_org,
                "originating_user_id": None,
            }, task.finalize_submit_review.call_args.kwargs

    def test_good__review_invalid(self, task_factory, user_factory):
        with ExitStack() as stack:
            stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
            get_repo_info = stack.enter_context(
                patch("metecho.api.model_mixins.get_repo_info")
            )

            user = user_factory()
            task = task_factory(
                pr_is_open=True, review_valid=False, review_sha="test_sha"
            )
            task.finalize_submit_review = MagicMock()
            task.project.repository.get_repo_id = MagicMock()
            pr = MagicMock()
            repository = MagicMock(**{"pull_request.return_value": pr})
            get_repo_info.return_value = repository
            with pytest.raises(TaskReviewIntegrityError):
                submit_review(
                    user=user,
                    task=task,
                    data={
                        "notes": "Notes",
                        "status": "APPROVE",
                        "delete_org": False,
                        "org": None,
                    },
                    originating_user_id=None,
                )

            assert task.finalize_submit_review.called
            assert task.finalize_submit_review.call_args.args
            assert "error" in task.finalize_submit_review.call_args.kwargs

    def test_bad(self):
        with ExitStack() as stack:
            get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))

            task = MagicMock()
            pr = MagicMock()
            pr.create_review.side_effect = ValueError()
            repository = MagicMock(**{"pull_request.return_value": pr})
            get_repo_info.return_value = repository
            with pytest.raises(ValueError):
                submit_review(
                    user=None,
                    task=task,
                    data={
                        "notes": "Notes",
                        "status": "APPROVE",
                        "delete_org": False,
                        "org": None,
                    },
                    originating_user_id=None,
                )

            assert task.finalize_submit_review.called
            assert task.finalize_submit_review.call_args.args
            assert "error" in task.finalize_submit_review.call_args.kwargs


@pytest.mark.django_db
class TestCreateGhBranchForNewProject:
    def test_no_pr(self, user_factory, project_factory):
        user = user_factory()
        with ExitStack() as stack:
            get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
            stack.enter_context(patch(f"{PATCH_ROOT}.project_create_branch"))
            get_repo_info.return_value = MagicMock(
                **{
                    "pull_requests.return_value": (
                        _ for _ in range(0)  # empty generator
                    ),
                    "compare_commits.return_value": MagicMock(ahead_by=0),
                }
            )

            project = project_factory(branch_name="pepin")
            create_gh_branch_for_new_project(project, user=user)
            assert project.pr_number is None

    def test_no_branch_name(self, user_factory, project_factory):
        user = user_factory()
        with ExitStack() as stack:
            get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
            project_create_branch = stack.enter_context(
                patch(f"{PATCH_ROOT}.project_create_branch")
            )
            get_repo_info.return_value = MagicMock()

            project = project_factory()
            create_gh_branch_for_new_project(project, user=user)
            assert project_create_branch.called

    def test_exception(self, user_factory, project_factory):
        user = user_factory()
        with ExitStack() as stack:
            get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
            project_create_branch = stack.enter_context(
                patch(f"{PATCH_ROOT}.project_create_branch")
            )
            get_repo_info.side_effect = ValueError()

            project = project_factory()
            with pytest.raises(ValueError):
                create_gh_branch_for_new_project(project, user=user)

            assert not project_create_branch.called


@pytest.mark.django_db
class TestAvailableTaskOrgConfigNames:
    def test_available_task_org_config_names(self, project_factory, user_factory):
        project = project_factory()
        user = user_factory()
        project.finalize_available_task_org_config_names = MagicMock()
        with ExitStack() as stack:
            stack.enter_context(patch(f"{PATCH_ROOT}.local_github_checkout"))
            get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
            get_repo_info.return_value = MagicMock(
                **{
                    "name": "repo",
                    "html_url": "https://example.com",
                    "owner.login": "login",
                    "branch.return_value": MagicMock(
                        **{"latest_sha.return_value": "123abc"}
                    ),
                }
            )
            stack.enter_context(patch(f"{PATCH_ROOT}.get_project_config"))
            BaseCumulusCI = stack.enter_context(
                patch("metecho.api.sf_org_changes.BaseCumulusCI")
            )
            BaseCumulusCI.return_value = MagicMock(
                **{"project_config.orgs__scratch": {}}
            )

            available_task_org_config_names(project, user=user)

            assert project.finalize_available_task_org_config_names.called

    def test_available_task_org_config_names__error(
        self, project_factory, user_factory
    ):
        project = project_factory()
        user = user_factory()
        project.finalize_available_task_org_config_names = MagicMock()
        with ExitStack() as stack:
            get_repo_info = stack.enter_context(patch(f"{PATCH_ROOT}.get_repo_info"))
            get_repo_info.side_effect = ValueError

            with pytest.raises(ValueError):
                available_task_org_config_names(project, user=user)

            assert project.finalize_available_task_org_config_names.called


@pytest.mark.django_db
def test_get_social_image(repository_factory, user_factory):
    repository = repository_factory()
    user = user_factory()
    with ExitStack() as stack:
        stack.enter_context(patch("metecho.api.jobs.get_repo_info"))
        get = stack.enter_context(patch("metecho.api.jobs.requests.get"))
        get.return_value = MagicMock(
            content="""
            <html>
                <head>
                <meta property="og:image" content="https://example.com/">
                </head>
                <body></body>
            </html>
            """
        )
        get_social_image(repository=repository, user=user)

        repository.refresh_from_db()
        assert repository.repo_image_url == "https://example.com/"
