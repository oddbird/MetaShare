import Button from '@salesforce/design-system-react/components/button';
import Dropdown from '@salesforce/design-system-react/components/menu-dropdown';
import PageHeaderControl from '@salesforce/design-system-react/components/page-header/control';
import classNames from 'classnames';
import i18n from 'i18next';
import React, { useCallback, useEffect, useState } from 'react';
import DocumentTitle from 'react-document-title';
import { useDispatch } from 'react-redux';
import { Redirect, RouteComponentProps } from 'react-router-dom';

import FourOhFour from '@/components/404';
import ConfirmRemoveUserModal from '@/components/projects/confirmRemoveUserModal';
import ProjectStatusPath from '@/components/projects/path';
import ProjectProgress from '@/components/projects/progress';
import TaskForm from '@/components/tasks/createForm';
import TaskTable from '@/components/tasks/table';
import { AssignUsersModal, UserCards } from '@/components/user/githubUser';
import {
  DetailPageLayout,
  ExternalLink,
  getProjectLoadingOrNotFound,
  getRepositoryLoadingOrNotFound,
  LabelWithSpinner,
  SpinnerWrapper,
  useFetchProjectIfMissing,
  useFetchRepositoryIfMissing,
  useFetchTasksIfMissing,
} from '@/components/utils';
import EditModal from '@/components/utils/editModal';
import SubmitModal from '@/components/utils/submitModal';
import { ThunkDispatch } from '@/store';
import { updateObject } from '@/store/actions';
import { refreshGitHubUsers } from '@/store/repositories/actions';
import { Task } from '@/store/tasks/reducer';
import { GitHubUser } from '@/store/user/reducer';
import { getUrlParam, removeUrlParam } from '@/utils/api';
import {
  OBJECT_TYPES,
  ORG_TYPES,
  OrgTypes,
  PROJECT_STATUSES,
  SHOW_PROJECT_COLLABORATORS,
} from '@/utils/constants';
import { getBranchLink, getCompletedTasks } from '@/utils/helpers';
import routes from '@/utils/routes';

const ProjectDetail = (props: RouteComponentProps) => {
  const dispatch = useDispatch<ThunkDispatch>();
  const { repository, repositorySlug } = useFetchRepositoryIfMissing(props);
  const { project, projectSlug } = useFetchProjectIfMissing(repository, props);
  const { tasks } = useFetchTasksIfMissing(project, props);

  // "Assign users to project" modal related:
  const [assignUsersModalOpen, setAssignUsersModalOpen] = useState(false);
  const openAssignUsersModal = useCallback(() => {
    setAssignUsersModalOpen(true);
  }, []);
  const closeAssignUsersModal = useCallback(() => {
    setAssignUsersModalOpen(false);
  }, []);

  // "Confirm remove user from project" modal related:
  const [waitingToUpdateUsers, setWaitingToUpdateUsers] = useState<
    GitHubUser[] | null
  >(null);
  const [confirmRemoveUsers, setConfirmRemoveUsers] = useState<
    GitHubUser[] | null
  >(null);
  const closeConfirmRemoveUsersModal = useCallback(() => {
    setWaitingToUpdateUsers(null);
    setConfirmRemoveUsers(null);
  }, []);

  // Auto-open the assign-users modal if `SHOW_PROJECT_COLLABORATORS` param
  const { history } = props;
  useEffect(() => {
    const showCollaborators = getUrlParam(SHOW_PROJECT_COLLABORATORS);
    if (showCollaborators === 'true') {
      // Remove query-string from URL
      history.replace({ search: removeUrlParam(SHOW_PROJECT_COLLABORATORS) });
      // Show collaborators modal
      openAssignUsersModal();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const usersAssignedToTasks = new Set<string>();
  (tasks || []).forEach((task) => {
    if (task.assigned_dev) {
      usersAssignedToTasks.add(task.assigned_dev.login);
    }
    if (task.assigned_qa) {
      usersAssignedToTasks.add(task.assigned_qa.login);
    }
  });

  const getRemovedUsers = useCallback(
    (users: GitHubUser[]) => {
      /* istanbul ignore if */
      if (!project) {
        return [];
      }
      return project.github_users.filter(
        (oldUser) =>
          usersAssignedToTasks.has(oldUser.login) &&
          !users.find((user) => user.id === oldUser.id),
      );
    },
    [project, usersAssignedToTasks],
  );
  const updateProjectUsers = useCallback(
    (users: GitHubUser[]) => {
      /* istanbul ignore if */
      if (!project) {
        return;
      }
      dispatch(
        updateObject({
          objectType: OBJECT_TYPES.PROJECT,
          data: {
            ...project,
            github_users: users,
          },
        }),
      );
    },
    [project, dispatch],
  );
  const setProjectUsers = useCallback(
    (users: GitHubUser[]) => {
      const removedUsers = getRemovedUsers(users);
      if (removedUsers.length) {
        setWaitingToUpdateUsers(users);
        setConfirmRemoveUsers(removedUsers);
      } else {
        updateProjectUsers(users);
      }
      setAssignUsersModalOpen(false);
    },
    [updateProjectUsers, getRemovedUsers],
  );
  const removeProjectUser = useCallback(
    (user: GitHubUser) => {
      /* istanbul ignore if */
      if (!project) {
        return;
      }
      const users = project.github_users.filter(
        (possibleUser) => user.id !== possibleUser.id,
      );
      const removedUsers = getRemovedUsers(users);
      if (removedUsers.length) {
        setWaitingToUpdateUsers(users);
        setConfirmRemoveUsers(removedUsers);
      } else {
        updateProjectUsers(users);
      }
    },
    [project, updateProjectUsers, getRemovedUsers],
  );
  const doRefreshGitHubUsers = useCallback(() => {
    /* istanbul ignore if */
    if (!repository) {
      return;
    }
    dispatch(refreshGitHubUsers(repository.id));
  }, [repository, dispatch]);

  // "Assign user to task" modal related:
  const assignUser = useCallback(
    ({
      task,
      type,
      assignee,
    }: {
      task: Task;
      type: OrgTypes;
      assignee: GitHubUser | null;
    }) => {
      /* istanbul ignore next */
      const userType = type === ORG_TYPES.DEV ? 'assigned_dev' : 'assigned_qa';
      dispatch(
        updateObject({
          objectType: OBJECT_TYPES.TASK,
          data: {
            ...task,
            [userType]: assignee,
          },
        }),
      );
    },
    [dispatch],
  );

  // "Submit" modal related:
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const openSubmitModal = () => {
    setSubmitModalOpen(true);
  };
  const currentlySubmitting = Boolean(project?.currently_creating_pr);
  const readyToSubmit = Boolean(
    project?.has_unmerged_commits &&
      !project?.pr_is_open &&
      project?.status !== PROJECT_STATUSES.MERGED,
  );

  // "edit" modal related:
  const [editModalOpen, setEditModalOpen] = useState(false);
  const openEditModal = () => {
    setEditModalOpen(true);
  };
  const closeEditModal = () => {
    setEditModalOpen(false);
  };

  const repositoryLoadingOrNotFound = getRepositoryLoadingOrNotFound({
    repository,
    repositorySlug,
  });
  if (repositoryLoadingOrNotFound !== false) {
    return repositoryLoadingOrNotFound;
  }

  const projectLoadingOrNotFound = getProjectLoadingOrNotFound({
    repository,
    project,
    projectSlug,
  });
  if (projectLoadingOrNotFound !== false) {
    return projectLoadingOrNotFound;
  }

  // This redundant check is used to satisfy TypeScript...
  /* istanbul ignore if */
  if (!repository || !project) {
    return <FourOhFour />;
  }

  if (
    (repositorySlug && repositorySlug !== repository.slug) ||
    (projectSlug && projectSlug !== project.slug)
  ) {
    // Redirect to most recent repository/project slug
    return (
      <Redirect to={routes.project_detail(repository.slug, project.slug)} />
    );
  }

  // Progress Bar:
  const tasksCompleted = tasks ? getCompletedTasks(tasks).length : 0;
  const tasksTotal = tasks?.length || 0;
  const projectProgress: [number, number] = [tasksCompleted, tasksTotal];

  // "Submit Project for Review" button:
  let submitButton: React.ReactNode = null;
  if (readyToSubmit) {
    const submitButtonText = currentlySubmitting ? (
      <LabelWithSpinner
        label={i18n.t('Submitting Project for Review…')}
        variant="inverse"
      />
    ) : (
      i18n.t('Submit Project for Review')
    );
    submitButton = (
      <Button
        label={submitButtonText}
        className={classNames('slds-size_full slds-m-bottom_x-large')}
        variant="brand"
        onClick={openSubmitModal}
        disabled={currentlySubmitting}
      />
    );
  }

  const handleSelect = (option: {
    id: string;
    label: string;
    disabled?: boolean;
  }) => {
    switch (option.id) {
      case 'edit':
        openEditModal();
        break;
      // case 'delete':
      //   break;
    }
  };
  const { branchLink, branchLinkText } = getBranchLink(project);
  const onRenderHeaderActions = () => (
    <PageHeaderControl>
      <Dropdown
        align="right"
        iconCategory="utility"
        iconName="settings"
        iconSize="large"
        iconVariant="more"
        width="xx-small"
        triggerClassName="slds-m-right_xx-small"
        assistiveText={{ icon: i18n.t('Project Options') }}
        onSelect={handleSelect}
        options={[
          { id: 'edit', label: i18n.t('Edit Project') },
          // { type: 'divider' },
          // { id: 'delete', label: i18n.t('Delete Project') },
        ]}
      />
      {branchLink ? (
        <ExternalLink
          url={branchLink}
          showButtonIcon
          className="slds-button slds-button_outline-brand"
        >
          {branchLinkText}
        </ExternalLink>
      ) : null}
    </PageHeaderControl>
  );

  return (
    <DocumentTitle
      title={`${project.name} | ${repository.name} | ${i18n.t('MetaShare')}`}
    >
      <DetailPageLayout
        title={project.name}
        description={project.description_rendered}
        repoUrl={repository.repo_url}
        breadcrumb={[
          {
            name: repository.name,
            url: routes.repository_detail(repository.slug),
          },
          { name: project.name },
        ]}
        onRenderHeaderActions={onRenderHeaderActions}
        sidebar={
          <>
            <div className="slds-m-bottom_medium">
              <h2 className="slds-text-heading_medium slds-p-bottom_small">
                {i18n.t('Collaborators')}
              </h2>
              <Button
                label={i18n.t('Add or Remove Collaborators')}
                variant="outline-brand"
                onClick={openAssignUsersModal}
              />
            </div>
            <AssignUsersModal
              allUsers={repository.github_users}
              selectedUsers={project.github_users}
              heading={`${i18n.t('Add or Remove Collaborators for')} ${
                project.name
              }`}
              isOpen={assignUsersModalOpen}
              onRequestClose={closeAssignUsersModal}
              setUsers={setProjectUsers}
              isRefreshing={Boolean(repository.currently_refreshing_gh_users)}
              refreshUsers={doRefreshGitHubUsers}
            />
            <ConfirmRemoveUserModal
              confirmRemoveUsers={confirmRemoveUsers}
              waitingToUpdateUsers={waitingToUpdateUsers}
              handleClose={closeConfirmRemoveUsersModal}
              handleUpdateUsers={updateProjectUsers}
            />
            <UserCards
              users={project.github_users}
              removeUser={removeProjectUser}
            />
          </>
        }
      >
        <ProjectStatusPath
          status={project.status}
          prIsOpen={project.pr_is_open}
        />
        {submitButton}
        {tasks ? (
          <>
            <h2 className="slds-text-heading_medium slds-p-bottom_medium">
              {tasks.length || project.status === PROJECT_STATUSES.MERGED ? (
                <>
                  {i18n.t('Tasks for')} {project.name}
                </>
              ) : (
                <>
                  {i18n.t('Add a Task for')} {project.name}
                </>
              )}
            </h2>
            {project.status !== PROJECT_STATUSES.MERGED && (
              <TaskForm project={project} startOpen={!tasks.length} />
            )}
            {tasks.length ? (
              <>
                <ProjectProgress range={projectProgress} />
                <TaskTable
                  repositorySlug={repository.slug}
                  projectSlug={project.slug}
                  tasks={tasks}
                  projectUsers={project.github_users}
                  openAssignProjectUsersModal={openAssignUsersModal}
                  assignUserAction={assignUser}
                />
              </>
            ) : null}
          </>
        ) : (
          // Fetching tasks from API
          <SpinnerWrapper />
        )}
        {readyToSubmit && (
          <SubmitModal
            instanceId={project.id}
            instanceName={project.name}
            instanceDiffUrl={project.branch_diff_url}
            instanceType="project"
            isOpen={submitModalOpen}
            toggleModal={setSubmitModalOpen}
          />
        )}
        <EditModal
          project={project}
          isOpen={editModalOpen}
          handleClose={closeEditModal}
        />
      </DetailPageLayout>
    </DocumentTitle>
  );
};

export default ProjectDetail;
