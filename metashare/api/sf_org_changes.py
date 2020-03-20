import json
import os.path
from collections import defaultdict

import simple_salesforce
from cumulusci.tasks.github.util import CommitDir
from cumulusci.tasks.salesforce.sourcetracking import retrieve_components
from django.conf import settings

from .custom_cci_configs import GlobalConfig, MetashareCumulusCIRuntime
from .gh import get_repo_info, get_source_format, local_github_checkout
from .sf_run_flow import refresh_access_token


def get_valid_target_directories(user, scratch_org, repo_root):
    """
    Expects to be called from within a `local_github_checkout`.
    """
    package_directories = {}
    repo_id = scratch_org.task.project.repository.get_repo_id(user)
    repository = get_repo_info(user, repo_id=repo_id)
    source_format = get_source_format(
        repo_root=repo_root,
        repo_name=repository.name,
        repo_url=repository.html_url,
        repo_owner=repository.owner.login,
        repo_branch=scratch_org.task.branch_name,
        repo_commit=repository.branch(scratch_org.task.branch_name).latest_sha(),
    )
    sfdx = source_format == "sfdx"
    if sfdx:
        with open("sfdx-project.json") as f:
            sfdx_project = json.load(f)
            # sfdx_project["packageDirectories"] will either be an array
            # of length 1, with no constituent object marked as
            # "default", OR an array of length > 1, with exactly one
            # constituent object marked as "default". These two logical
            # lines will ensure that the default is the first item in
            # the list at the "source" key of package_directories.
            package_directories["source"] = [
                directory["path"]
                for directory in sfdx_project["packageDirectories"]
                if directory.get("default")
            ]
            package_directories["source"].extend(
                [
                    directory["path"]
                    for directory in sfdx_project["packageDirectories"]
                    if not directory.get("default")
                ]
            )
    else:
        package_directories["source"] = ["src"]

    if os.path.isdir("unpackaged/pre"):
        package_directories["pre"] = [
            "unpackaged/pre/" + dirname
            for dirname in os.listdir("unpackaged/pre")
            if os.path.isdir("unpackaged/pre/" + dirname)
        ]
    if os.path.isdir("unpackaged/post"):
        package_directories["post"] = [
            "unpackaged/post/" + dirname
            for dirname in os.listdir("unpackaged/post")
            if os.path.isdir("unpackaged/post/" + dirname)
        ]
    if os.path.isdir("unpackaged/config"):
        package_directories["config"] = [
            "unpackaged/config/" + dirname
            for dirname in os.listdir("unpackaged/config")
            if os.path.isdir("unpackaged/config/" + dirname)
        ]

    return package_directories, sfdx


def run_retrieve_task(
    user,
    scratch_org,
    project_path,
    desired_changes,
    target_directory,
    originating_user_id,
):
    repo_id = scratch_org.task.project.repository.get_repo_id(user)
    org_config = refresh_access_token(
        config=scratch_org.config,
        org_name="dev",
        scratch_org=scratch_org,
        originating_user_id=originating_user_id,
    )
    repository = get_repo_info(user, repo_id=repo_id)
    branch = repository.default_branch
    cci = MetashareCumulusCIRuntime(
        repo_info={
            "root": project_path,
            "url": repository.html_url,
            "name": repository.name,
            "owner": repository.owner.login,
            "commit": branch,
        }
    )

    valid_directories, sfdx = get_valid_target_directories(
        user, scratch_org, project_path
    )
    md_format = not (sfdx and target_directory in valid_directories["source"])

    if sfdx:
        is_main_project_directory = target_directory == valid_directories["source"][0]
    else:
        is_main_project_directory = target_directory == "src"

    if is_main_project_directory:
        package_xml_opts = {
            "package_name": cci.project_config.project__package__name,
            "install_class": cci.project_config.project__package__install_class,
            "uninstall_class": cci.project_config.project__package__uninstall_class,
        }
    else:
        package_xml_opts = {}

    components = []
    for mdtype, members in desired_changes.items():
        for name in members:
            components.append({"MemberName": name, "MemberType": mdtype})
    retrieve_components(
        components,
        org_config,
        os.path.realpath(target_directory),
        md_format,
        extra_package_xml_opts=package_xml_opts,
        namespace_tokenize=False,
        api_version=cci.project_config.project__package__api_version,
    )


def commit_changes_to_github(
    *,
    user,
    scratch_org,
    repo_id,
    branch,
    desired_changes,
    commit_message,
    target_directory,
    originating_user_id,
):
    with local_github_checkout(user, repo_id) as project_path:
        # This won't return anything in-memory, but rather it will emit
        # files which we then copy into a source checkout, and then
        # commit and push all that.
        run_retrieve_task(
            user,
            scratch_org,
            project_path,
            desired_changes,
            target_directory,
            originating_user_id,
        )
        repo = get_repo_info(user, repo_id=repo_id)
        author = {"name": user.username, "email": user.email}
        CommitDir(repo, author=author)(
            project_path, branch, repo_dir="", commit_message=commit_message
        )


def get_salesforce_connection(*, config, scratch_org, originating_user_id, base_url=""):
    org_name = "dev"
    org_config = refresh_access_token(
        config=config,
        org_name=org_name,
        scratch_org=scratch_org,
        originating_user_id=originating_user_id,
    )

    conn = simple_salesforce.Salesforce(
        instance_url=org_config.instance_url,
        session_id=org_config.access_token,
        version=GlobalConfig().project__package__api_version,
    )
    conn.headers.setdefault(
        "Sforce-Call-Options", "client={}".format(settings.SF_CLIENT_ID)
    )
    conn.base_url += base_url

    return conn


def get_latest_revision_numbers(scratch_org, *, originating_user_id):
    conn = get_salesforce_connection(
        config=scratch_org.config,
        scratch_org=scratch_org,
        base_url="tooling/",
        originating_user_id=originating_user_id,
    )

    # Store the results here on the org, and if any of these are > number than earlier
    # version, there are changes.
    # We need to run this right after the setup flow and store that as initial state.
    records = conn.query_all(
        "SELECT MemberName, MemberType, RevisionCounter FROM SourceMember "
        "WHERE IsNameObsolete=false"
    ).get("records", [])

    record_dict = defaultdict(lambda: defaultdict(dict))
    for record in records:
        record_dict[record["MemberType"]][record["MemberName"]] = record[
            "RevisionCounter"
        ]

    return {k: dict(v) for k, v in record_dict.items()}


def compare_revisions(old_revision, new_revision):
    ret = defaultdict(list)
    for mt in new_revision.keys():
        for mn in new_revision[mt].keys():
            if new_revision[mt][mn] > old_revision.get(mt, {}).get(mn, -1):
                ret[mt].append(mn)
    return ret
