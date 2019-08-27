import itertools
import logging
import os
import shutil
import zipfile
from glob import glob
from urllib.parse import urlparse

import github3
from cumulusci.core.config import ScratchOrgConfig
from cumulusci.utils import temporary_dir
from django.conf import settings

logger = logging.getLogger(__name__)


def extract_user_and_repo(gh_url):
    path = urlparse(gh_url).path
    _, user, repo, *_ = path.split("/")
    return user, repo


def is_safe_path(path):
    return not os.path.isabs(path) and ".." not in path.split(os.path.sep)


def zip_file_is_safe(zip_file):
    return all(is_safe_path(info.filename) for info in zip_file.infolist())


def clone_repo_locally(repo_url):
    gh = github3.login(token=settings.GITHUB_TOKEN)
    user, repo_name = extract_user_and_repo(repo_url)
    return gh.repository(user, repo_name)


def normalize_user_and_repo_name(repo):
    """
    Make sure we have the _actual_ owner/repo name if we were
    redirected.
    """
    user = repo.owner.login
    repo_name = repo.name
    return user, repo_name


def get_zip_file(repo, commit_ish):
    zip_file_name = "archive.zip"
    repo.archive("zipball", path=zip_file_name, ref=commit_ish)
    return zipfile.ZipFile(zip_file_name)


def log_unsafe_zipfile_error(user, repo_name, commit_ish):
    """
    It is very unlikely that we will get an unsafe zipfile, as we get it
    from GitHub, but must be considered.
    """
    url = f"https://github.com/{user}/{repo_name}#{commit_ish}"
    logger.error(f"Malformed or malicious zip file from {url}.")


def extract_zip_file(zip_file, user, repo_name):
    zip_file.extractall()
    # We know that the zipball contains a root directory named something
    # like this by GitHub's convention. If that ever breaks, this will
    # break:
    zipball_root = glob(f"{user}-{repo_name}-*")[0]
    # It's not unlikely that the zipball root contains a directory with
    # the same name, so we pre-emptively rename it to probably avoid
    # collisions:
    shutil.move(zipball_root, "zipball_root")
    for path in itertools.chain(glob("zipball_root/*"), glob("zipball_root/.*")):
        shutil.move(path, ".")
    shutil.rmtree("zipball_root")


def call_out_to_sf_api():
    # TODO: this ain't workin'.
    org_config = ScratchOrgConfig(
        {"config_file": "orgs/dev.json", "scratch": True}, "dev"
    )
    org_config.create_org()


def make_scratch_org(repo_url, commit_ish):
    repo_url = "https://github.com/SFDO-Tooling/CumulusCI-Test"
    commit_ish = "master"
    with temporary_dir():
        repo = clone_repo_locally(repo_url)
        user, repo_name = normalize_user_and_repo_name(repo)
        zip_file = get_zip_file(repo, commit_ish)

        if not zip_file_is_safe(zip_file):
            log_unsafe_zipfile_error(user, repo_name, commit_ish)
            return

        # Because subsequent operations require certain things to be
        # present in the filesystem at cwd, things that are in the repo
        # (we hope):
        extract_zip_file(zip_file, user, repo_name)

        call_out_to_sf_api()
