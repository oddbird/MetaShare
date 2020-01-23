import Button from '@salesforce/design-system-react/components/button';
import PageHeaderControl from '@salesforce/design-system-react/components/page-header/control';
import classNames from 'classnames';
import i18n from 'i18next';
import React, { useCallback, useState } from 'react';
import DocumentTitle from 'react-document-title';
import { useDispatch } from 'react-redux';
import { Redirect, RouteComponentProps } from 'react-router-dom';

import FourOhFour from '@/components/404';
import {
  AssignedUserCards,
  AssignUsersModal,
} from '@/components/projects/repositoryGitHubUsers';
import TaskForm from '@/components/tasks/createForm';
import TaskTable from '@/components/tasks/table';
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
import SubmitModal from '@/components/utils/submitModal';
import { ThunkDispatch } from '@/store';
import { updateObject } from '@/store/actions';
import { GitHubUser } from '@/store/repositories/reducer';
import { OBJECT_TYPES } from '@/utils/constants';
import routes from '@/utils/routes';

const ProjectDetail = (props: RouteComponentProps) => {
  const dispatch = useDispatch<ThunkDispatch>();
  const { repository, repositorySlug } = useFetchRepositoryIfMissing(props);
  const { project, projectSlug } = useFetchProjectIfMissing(repository, props);
  const { tasks } = useFetchTasksIfMissing(project, props);

  // Assign users modal related:
  const [assignUsersModalOpen, setAssignUsersModalOpen] = useState(false);
  const openAvailableUserModal = () => {
    setAssignUsersModalOpen(true);
  };
  const closeAvailableUserModal = () => {
    setAssignUsersModalOpen(false);
  };
  const setProjectUsers = useCallback(
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
            // eslint-disable-next-line @typescript-eslint/camelcase
            github_users: users,
          },
        }),
      );
      setAssignUsersModalOpen(false);
    },
    [project, dispatch],
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
      dispatch(
        updateObject({
          objectType: OBJECT_TYPES.PROJECT,
          data: {
            ...project,
            // eslint-disable-next-line @typescript-eslint/camelcase
            github_users: users,
          },
        }),
      );
    },
    [project, dispatch],
  );

  // Submit modal related:
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const openSubmitModal = () => {
    setSubmitModalOpen(true);
  };
  const currentlySubmitting = Boolean(project && project.currently_creating_pr);
  const readyToSubmit = Boolean(
    project && project.has_unmerged_commits && !project.pr_is_open,
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

  const onRenderHeaderActions = () => (
    <PageHeaderControl>
      <Button
        iconCategory="utility"
        iconName="delete"
        iconPosition="left"
        label={i18n.t('Delete Project')}
        variant="text-destructive"
        disabled
      />
      {project.pr_url || project.branch_url ? (
        <ExternalLink
          url={(project.pr_url || project.branch_url) as string}
          showButtonIcon
          className="slds-button slds-button_outline-brand"
        >
          {project.pr_url ? i18n.t('View Pull Request') : i18n.t('View Branch')}
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
        description={project.description}
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
            <div className="slds-m-bottom_medium add-member">
              <h2 className="slds-text-heading_medium slds-p-bottom_small">
                {i18n.t('Collaborators')}
              </h2>
              <Button
                label={i18n.t('Add or Remove Collaborators')}
                variant="outline-brand"
                onClick={openAvailableUserModal}
              />
            </div>
            <AssignUsersModal
              allUsers={repository.github_users}
              users={project.github_users}
              projectName={project.name}
              isOpen={assignUsersModalOpen}
              onRequestClose={closeAvailableUserModal}
              setUsers={setProjectUsers}
            />
            <AssignedUserCards
              users={project.github_users}
              removeUser={removeProjectUser}
            />
          </>
        }
      >
        {submitButton}
        {tasks ? (
          <>
            <h2 className="slds-text-heading_medium slds-p-bottom_medium">
              {tasks.length ? (
                <>
                  {i18n.t('Tasks for')} {project.name}
                </>
              ) : (
                <>
                  {i18n.t('Add a Task for')} {project.name}
                </>
              )}
            </h2>
            <TaskForm project={project} startOpen={!tasks.length} />
            <TaskTable
              repositorySlug={repository.slug}
              projectSlug={project.slug}
              tasks={tasks}
            />
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
      </DetailPageLayout>
    </DocumentTitle>
  );
};

export default ProjectDetail;
