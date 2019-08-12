import Button from '@salesforce/design-system-react/components/button';
import Icon from '@salesforce/design-system-react/components/icon';
import Spinner from '@salesforce/design-system-react/components/spinner';
import i18n from 'i18next';
import React, { useState } from 'react';
import DocumentTitle from 'react-document-title';
import { useDispatch } from 'react-redux';
import { Redirect, RouteComponentProps } from 'react-router-dom';

import ProjectForm from '@/components/projects/createForm';
import ProjectListItem from '@/components/projects/listItem';
import RepositoryNotFound from '@/components/repositories/repository404';
import {
  DetailPageLayout,
  getRepositoryLoadingOrNotFound,
  LabelWithSpinner,
  RepoLink,
  useFetchProjectsIfMissing,
  useFetchRepositoryIfMissing,
  useIsMounted,
} from '@/components/utils';
import { ThunkDispatch } from '@/store';
import { fetchObjects } from '@/store/actions';
import { OBJECT_TYPES } from '@/utils/constants';
import routes from '@/utils/routes';

const RepositoryDetail = (props: RouteComponentProps) => {
  const [fetchingProjects, setFetchingProjects] = useState(false);
  const isMounted = useIsMounted();
  const dispatch = useDispatch<ThunkDispatch>();
  const { repository, repositorySlug } = useFetchRepositoryIfMissing(props);
  const { projects } = useFetchProjectsIfMissing(repository, props);

  const loadingOrNotFound = getRepositoryLoadingOrNotFound({
    repository,
    repositorySlug,
  });

  if (loadingOrNotFound !== false) {
    return loadingOrNotFound;
  }

  // This redundant check is used to satisfy TypeScript...
  /* istanbul ignore if */
  if (!repository) {
    return <RepositoryNotFound />;
  }

  if (repositorySlug && repositorySlug !== repository.slug) {
    // Redirect to most recent repository slug
    return <Redirect to={routes.repository_detail(repository.slug)} />;
  }

  const fetchMoreProjects = () => {
    /* istanbul ignore else */
    if (projects && projects.next) {
      /* istanbul ignore else */
      if (isMounted.current) {
        setFetchingProjects(true);
      }

      dispatch(
        fetchObjects({
          objectType: OBJECT_TYPES.PROJECT,
          filters: { repository: repository.id },
          url: projects.next,
        }),
      ).finally(() => {
        /* istanbul ignore else */
        if (isMounted.current) {
          setFetchingProjects(false);
        }
      });
    }
  };

  const sidebarContent = (
    <RepoLink url={repository.repo_url}>
      {i18n.t('GitHub Repo')}
      <Icon
        category="utility"
        name="new_window"
        size="xx-small"
        className="slds-m-bottom_xx-small"
        containerClassName="slds-m-left_xx-small slds-current-color"
      />
    </RepoLink>
  );

  return (
    <DocumentTitle title={`${repository.name} | ${i18n.t('MetaShare')}`}>
      <DetailPageLayout
        title={repository.name}
        description={repository.description}
        repoUrl={repository.repo_url}
        breadcrumb={[{ name: repository.name }]}
        sidebar={sidebarContent}
      >
        {!projects || !projects.fetched ? (
          // Fetching projects from API
          <Spinner />
        ) : (
          <>
            <h2 className="slds-text-heading_medium slds-p-bottom_medium">
              {projects.projects.length ? (
                <>
                  {i18n.t('Projects for')} {repository.name}
                </>
              ) : (
                <>
                  {i18n.t('Create a Project for')} {repository.name}
                </>
              )}
            </h2>
            <ProjectForm
              repository={repository}
              startOpen={!projects.projects.length}
            />
            {Boolean(projects.projects.length) && (
              <>
                <ul className="slds-has-dividers_bottom">
                  {projects.projects.map(project => (
                    <ProjectListItem
                      key={project.id}
                      project={project}
                      repository={repository}
                    />
                  ))}
                </ul>
                {projects.next ? (
                  <div className="slds-m-top_large">
                    <Button
                      label={
                        fetchingProjects ? (
                          <LabelWithSpinner
                            label={i18n.t('Loading…')}
                            variant="base"
                            size="x-small"
                          />
                        ) : (
                          i18n.t('Load More')
                        )
                      }
                      onClick={fetchMoreProjects}
                    />
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </DetailPageLayout>
    </DocumentTitle>
  );
};

export default RepositoryDetail;
