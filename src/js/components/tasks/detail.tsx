import Button from '@salesforce/design-system-react/components/button';
import PageHeaderControl from '@salesforce/design-system-react/components/page-header/control';
import classNames from 'classnames';
import { addMinutes, isPast, parseISO } from 'date-fns';
import i18n from 'i18next';
import React, { useCallback, useEffect, useState } from 'react';
import DocumentTitle from 'react-document-title';
import { useDispatch, useSelector } from 'react-redux';
import { Redirect, RouteComponentProps } from 'react-router-dom';

import FourOhFour from '@/components/404';
import CommitList from '@/components/commits/list';
import { Step } from '@/components/steps/stepsItem';
import CaptureModal from '@/components/tasks/capture';
import OrgCards from '@/components/tasks/cards';
import TaskStatusPath from '@/components/tasks/path';
import TaskStatusSteps from '@/components/tasks/steps';
import { AssignUserModal } from '@/components/user/githubUser';
import {
  DeleteModal,
  DetailPageLayout,
  EditModal,
  ExternalLink,
  getProjectLoadingOrNotFound,
  getRepositoryLoadingOrNotFound,
  getTaskLoadingOrNotFound,
  LabelWithSpinner,
  PageOptions,
  SpinnerWrapper,
  SubmitModal,
  useFetchOrgsIfMissing,
  useFetchProjectIfMissing,
  useFetchRepositoryIfMissing,
  useFetchTasksIfMissing,
} from '@/components/utils';
import { AppState, ThunkDispatch } from '@/store';
import { refetchOrg } from '@/store/orgs/actions';
import { Org } from '@/store/orgs/reducer';
import { selectTask, selectTaskSlug } from '@/store/tasks/selectors';
import { GitHubUser, User } from '@/store/user/reducer';
import { selectUserState } from '@/store/user/selectors';
import { addUrlParams } from '@/utils/api';
import {
  OBJECT_TYPES,
  ORG_TYPES,
  OrgTypes,
  REVIEW_STATUSES,
  SHOW_PROJECT_COLLABORATORS,
  TASK_STATUSES,
} from '@/utils/constants';
import { getBranchLink } from '@/utils/helpers';
import routes from '@/utils/routes';

const TaskDetail = (props: RouteComponentProps) => {
  const [fetchingChanges, setFetchingChanges] = useState(false);
  const [captureModalOpen, setCaptureModalOpen] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [assignUserModalOpen, setAssignUserModalOpen] = useState(false);
  const [currentOrgType, setCurrentOrgType] = useState<OrgTypes | null>(null);

  const { repository, repositorySlug } = useFetchRepositoryIfMissing(props);
  const { project, projectSlug } = useFetchProjectIfMissing(repository, props);
  const dispatch = useDispatch<ThunkDispatch>();
  useFetchTasksIfMissing(project, props);
  const selectTaskWithProps = useCallback(selectTask, []);
  const selectTaskSlugWithProps = useCallback(selectTaskSlug, []);
  const task = useSelector((state: AppState) =>
    selectTaskWithProps(state, props),
  );
  const taskSlug = useSelector((state: AppState) =>
    selectTaskSlugWithProps(state, props),
  );
  const { orgs } = useFetchOrgsIfMissing(task, props);
  const user = useSelector(selectUserState) as User;

  const readyToSubmit = Boolean(
    task?.has_unmerged_commits && !task?.pr_is_open,
  );
  const currentlySubmitting = Boolean(task?.currently_creating_pr);
  const userIsAssignedDev = Boolean(
    user.username === task?.assigned_dev?.login,
  );
  const hasReviewRejected = Boolean(
    task?.review_valid &&
      task?.review_status === REVIEW_STATUSES.CHANGES_REQUESTED,
  );
  let currentlyFetching = false;
  let currentlyCommitting = false;
  let orgHasChanges = false;
  let userIsOwner = false;
  let devOrg: Org | null | undefined;
  let hasOrgs = false;
  if (orgs) {
    devOrg = orgs[ORG_TYPES.DEV];
    orgHasChanges =
      (devOrg?.total_unsaved_changes || 0) -
        (devOrg?.total_ignored_changes || 0) >
      0;
    userIsOwner = Boolean(
      userIsAssignedDev && devOrg?.is_created && devOrg?.owner === user.id,
    );
    currentlyFetching = Boolean(devOrg?.currently_refreshing_changes);
    currentlyCommitting = Boolean(devOrg?.currently_capturing_changes);
    /* istanbul ignore next */
    if (devOrg || orgs[ORG_TYPES.QA]) {
      hasOrgs = true;
    }
  }

  const openCaptureModal = () => {
    setCaptureModalOpen(true);
    setSubmitModalOpen(false);
    setEditModalOpen(false);
    setDeleteModalOpen(false);
  };
  const closeCaptureModal = () => {
    setCaptureModalOpen(false);
  };
  const openSubmitModal = () => {
    setSubmitModalOpen(true);
    setCaptureModalOpen(false);
    setEditModalOpen(false);
    setDeleteModalOpen(false);
  };
  // edit modal related...
  const openEditModal = () => {
    setEditModalOpen(true);
    setSubmitModalOpen(false);
    setCaptureModalOpen(false);
    setDeleteModalOpen(false);
  };
  const closeEditModal = () => {
    setEditModalOpen(false);
  };
  // delete modal related
  const openDeleteModal = () => {
    setDeleteModalOpen(true);
    setEditModalOpen(false);
    setSubmitModalOpen(false);
    setCaptureModalOpen(false);
  };
  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
  };
  // Assign user modal related
  const openAssignUserModal = (type?: OrgTypes) => {
    if (type) {
      setCurrentOrgType(type);
    }
    setAssignUserModalOpen(true);
  };
  const closeAssignUserModal = () => {
    setCurrentOrgType(null);
    setAssignUserModalOpen(false);
  };
  const handleStepAction = useCallback((step: Step) => {
    const action = step.action;
    switch (action) {
      case 'assign-dev':
        openAssignUserModal(ORG_TYPES.DEV);
        break;
    }
  }, []);
  // eslint-disable-next-line one-var
  let projectUrl = '';
  if (repository && project) {
    projectUrl = routes.project_detail(repository.slug, project.slug);
  }
  const handleEmptyMessageClick = useCallback(() => {
    if (projectUrl) {
      props.history.push(
        addUrlParams(projectUrl, { [SHOW_PROJECT_COLLABORATORS]: true }),
      );
    }
  }, [projectUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  const assignedUser =
    currentOrgType === ORG_TYPES.QA ? task?.assigned_qa : task?.assigned_dev;
  const doAssignUser = useCallback(
    (assignee: GitHubUser | null, shouldAlertAssignee: boolean) => {
      // eslint-disable-next-line no-console
      console.log(assignee, shouldAlertAssignee);
      // handleAssignUser({ type, assignee, shouldAlertAssignee });
    },
    [],
    // [handleAssignUser, type],
  );
  // When capture changes has been triggered, wait until org has been refreshed
  useEffect(() => {
    const changesFetched =
      fetchingChanges && devOrg && !devOrg.currently_refreshing_changes;

    if (changesFetched && devOrg) {
      setFetchingChanges(false);
      /* istanbul ignore else */
      if (orgHasChanges && !submitModalOpen) {
        openCaptureModal();
      }
    }
  }, [fetchingChanges, devOrg, orgHasChanges, submitModalOpen]);

  // If the task slug changes, make sure EditTask modal is closed
  useEffect(() => {
    if (taskSlug && task && taskSlug !== task.slug) {
      setEditModalOpen(false);
    }
  }, [task, taskSlug]);

  const doRefetchOrg = useCallback(
    (org: Org) => {
      dispatch(refetchOrg(org));
    },
    [dispatch],
  );

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

  const taskLoadingOrNotFound = getTaskLoadingOrNotFound({
    repository,
    project,
    task,
    taskSlug,
  });

  if (taskLoadingOrNotFound !== false) {
    return taskLoadingOrNotFound;
  }

  // This redundant check is used to satisfy TypeScript...
  /* istanbul ignore if */
  if (!repository || !project || !task) {
    return <FourOhFour />;
  }

  if (
    (repositorySlug && repositorySlug !== repository.slug) ||
    (projectSlug && projectSlug !== project.slug) ||
    (taskSlug && taskSlug !== task.slug)
  ) {
    // Redirect to most recent repository/project/task slug
    return (
      <Redirect
        to={routes.task_detail(repository.slug, project.slug, task.slug)}
      />
    );
  }

  const handlePageOptionSelect = (selection: 'edit' | 'delete') => {
    switch (selection) {
      case 'edit':
        openEditModal();
        break;
      case 'delete':
        openDeleteModal();
        break;
    }
  };

  const { branchLink, branchLinkText } = getBranchLink(task);
  const onRenderHeaderActions = () => (
    <PageHeaderControl>
      <PageOptions
        modelType={OBJECT_TYPES.TASK}
        handleOptionSelect={handlePageOptionSelect}
      />
      {branchLink && (
        <ExternalLink
          url={branchLink}
          showButtonIcon
          className="slds-button slds-button_outline-brand"
        >
          {branchLinkText}
        </ExternalLink>
      )}
    </PageHeaderControl>
  );

  let submitButton: React.ReactNode = null;
  if (readyToSubmit) {
    const isPrimary = !(userIsOwner && orgHasChanges);
    const submitButtonText = currentlySubmitting ? (
      <LabelWithSpinner
        label={i18n.t('Submitting Task for Testing…')}
        variant={isPrimary ? 'inverse' : 'base'}
      />
    ) : (
      i18n.t('Submit Task for Testing')
    );
    submitButton = (
      <Button
        label={submitButtonText}
        className="slds-size_full slds-m-bottom_x-large slds-m-left_none"
        variant={isPrimary ? 'brand' : 'outline-brand'}
        onClick={openSubmitModal}
        disabled={currentlySubmitting}
      />
    );
  }

  let captureButton: React.ReactNode = null;
  if (userIsOwner && (orgHasChanges || devOrg?.has_been_visited)) {
    const captureButtonAction = () => {
      /* istanbul ignore else */
      if (devOrg) {
        let shouldCheck = true;
        const checkAfterMinutes = window.GLOBALS.ORG_RECHECK_MINUTES;
        if (
          orgHasChanges &&
          devOrg.last_checked_unsaved_changes_at !== null &&
          typeof checkAfterMinutes === 'number'
        ) {
          const lastChecked = parseISO(devOrg.last_checked_unsaved_changes_at);
          const shouldCheckAfter = addMinutes(lastChecked, checkAfterMinutes);
          shouldCheck = isPast(shouldCheckAfter);
        }
        if (shouldCheck) {
          setFetchingChanges(true);
          doRefetchOrg(devOrg);
        } else {
          openCaptureModal();
        }
      }
    };
    let captureButtonText: JSX.Element = i18n.t(
      'Check for Unretrieved Changes',
    );
    const isPrimary =
      (orgHasChanges || !readyToSubmit) &&
      (!task.pr_is_open || hasReviewRejected);
    if (currentlyCommitting) {
      /* istanbul ignore next */
      captureButtonText = (
        <LabelWithSpinner
          label={i18n.t('Retrieving Selected Changes…')}
          variant={isPrimary ? 'inverse' : 'base'}
        />
      );
    } else if (fetchingChanges || currentlyFetching) {
      /* istanbul ignore next */
      captureButtonText = (
        <LabelWithSpinner
          label={i18n.t('Checking for Unretrieved Changes…')}
          variant={isPrimary ? 'inverse' : 'base'}
        />
      );
    } else if (orgHasChanges) {
      captureButtonText = i18n.t('Retrieve Changes from Dev Org');
    }
    captureButton = (
      <Button
        label={captureButtonText}
        className={classNames('slds-size_full', {
          'slds-m-bottom_medium': readyToSubmit,
          'slds-m-bottom_x-large': !readyToSubmit,
        })}
        variant={isPrimary ? 'brand' : 'outline-brand'}
        onClick={captureButtonAction}
        disabled={fetchingChanges || currentlyFetching || currentlyCommitting}
      />
    );
  }
  let headerUrl, headerUrlText; // eslint-disable-line one-var
  /* istanbul ignore else */
  if (task.branch_url && task.branch_name) {
    headerUrl = task.branch_url;
    headerUrlText = task.branch_name;
  } else if (project.branch_url && project.branch_name) {
    headerUrl = project.branch_url;
    headerUrlText = project.branch_name;
  } else {
    headerUrl = repository.repo_url;
    headerUrlText = `${repository.repo_owner}/${repository.repo_name}`;
  }

  return (
    <DocumentTitle
      title={` ${task.name} | ${project.name} | ${repository.name} | ${i18n.t(
        'Metecho',
      )}`}
    >
      <DetailPageLayout
        title={task.name}
        description={task.description_rendered}
        headerUrl={headerUrl}
        headerUrlText={headerUrlText}
        breadcrumb={[
          {
            name: repository.name,
            url: routes.repository_detail(repository.slug),
          },
          {
            name: project.name,
            url: projectUrl,
          },
          { name: task.name },
        ]}
        onRenderHeaderActions={onRenderHeaderActions}
        sidebar={
          <>
            <div className="slds-m-bottom_x-large ms-secondary-block">
              <TaskStatusPath task={task} />
            </div>
            {orgs && task.status !== TASK_STATUSES.COMPLETED ? (
              <div className="slds-m-bottom_x-large ms-secondary-block">
                <TaskStatusSteps
                  task={task}
                  orgs={orgs}
                  handleAction={handleStepAction}
                />
              </div>
            ) : null}
          </>
        }
      >
        {captureButton}
        {submitButton}

        {orgs ? (
          <OrgCards
            orgs={orgs}
            task={task}
            projectUsers={project.github_users}
            projectUrl={projectUrl}
            repoUrl={repository.repo_url}
            openCaptureModal={openCaptureModal}
            openAssignUserModal={openAssignUserModal}
          />
        ) : (
          <SpinnerWrapper />
        )}
        {devOrg &&
          userIsOwner &&
          (orgHasChanges || devOrg.has_ignored_changes) && (
            <CaptureModal
              org={devOrg}
              isOpen={captureModalOpen}
              closeModal={closeCaptureModal}
            />
          )}
        {readyToSubmit && (
          <SubmitModal
            instanceId={task.id}
            instanceName={task.name}
            instanceDiffUrl={task.branch_diff_url}
            instanceType="task"
            isOpen={submitModalOpen}
            toggleModal={setSubmitModalOpen}
          />
        )}
        <EditModal
          model={task}
          modelType={OBJECT_TYPES.TASK}
          hasOrgs={hasOrgs}
          projectId={project.id}
          orgConfigsLoading={project.currently_fetching_org_config_names}
          orgConfigs={project.available_task_org_config_names}
          isOpen={editModalOpen}
          handleClose={closeEditModal}
        />
        <DeleteModal
          model={task}
          modelType={OBJECT_TYPES.TASK}
          isOpen={deleteModalOpen}
          redirect={projectUrl}
          handleClose={closeDeleteModal}
        />
        <AssignUserModal
          allUsers={project.github_users}
          selectedUser={assignedUser}
          orgType={currentOrgType}
          isOpen={assignUserModalOpen}
          emptyMessageText={i18n.t('View Project to Add Collaborators')}
          emptyMessageAction={handleEmptyMessageClick}
          onRequestClose={closeAssignUserModal}
          setUser={doAssignUser}
        />
        <CommitList commits={task.commits} />
      </DetailPageLayout>
    </DocumentTitle>
  );
};

export default TaskDetail;
