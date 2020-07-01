import i18n from 'i18next';
import React from 'react';

import Steps from '@/components/steps';
import { Step } from '@/components/steps/stepsItem';
import { OrgsByTask } from '@/store/orgs/reducer';
import { Task } from '@/store/tasks/reducer';
import { ORG_TYPES, REVIEW_STATUSES } from '@/utils/constants';
import { getTaskCommits } from '@/utils/helpers';

interface TaskStatusStepsProps {
  task: Task;
  orgs: OrgsByTask;
  handleAction: (step: Step) => void;
}

const TaskStatusSteps = ({
  task,
  orgs,
  handleAction,
}: TaskStatusStepsProps) => {
  const hasDev = Boolean(task.assigned_dev);
  const hasTester = Boolean(task.assigned_qa);
  const hasReviewApproved =
    task.review_valid && task.review_status === REVIEW_STATUSES.APPROVED;
  const hasReviewRejected =
    task.review_valid &&
    task.review_status === REVIEW_STATUSES.CHANGES_REQUESTED;
  const readyForReview = task.has_unmerged_commits && task.pr_is_open;
  const devOrg = orgs[ORG_TYPES.DEV];
  const testOrg = orgs[ORG_TYPES.QA];
  const hasDevOrg = Boolean(devOrg?.is_created);
  const hasTestOrg = Boolean(testOrg?.is_created);
  const hasValidCommits = task.has_unmerged_commits && !hasReviewRejected;
  const taskCommits = getTaskCommits(task);
  const testOrgOutOfDate =
    hasTestOrg && taskCommits.indexOf(testOrg?.latest_commit || '') !== 0;

  const steps = [
    {
      label: i18n.t('Assign a Developer'),
      active: !hasDev,
      // Even if no dev is currently assigned,
      // consider this complete if there are commits and no rejected review
      complete: hasDev || hasValidCommits,
      assignee: null,
      action: 'assign-dev',
    },
    {
      label: i18n.t('Create a Scratch Org for development'),
      active: hasDev && !hasDevOrg,
      // Even if no dev is currently assigned and there's no Dev Org,
      // consider this complete if there are commits and no rejected review
      complete: (hasDev && hasDevOrg) || hasValidCommits,
      assignee: task.assigned_dev,
    },
    {
      label: i18n.t('Make changes in Dev Org'),
      // Active if we have an assigned Dev, a Dev Org, and the Dev Org has no
      // unsaved changes
      active: hasDev && hasDevOrg && !devOrg?.has_unsaved_changes,
      // Complete if the Dev Org has unsaved changes or we have commits
      // (without rejected review)
      complete: Boolean(devOrg?.has_unsaved_changes || hasValidCommits),
      assignee: task.assigned_dev,
    },
    {
      label: i18n.t('Retrieve changes from Dev Org'),
      // Active if we have an assigned Dev and a Dev Org with unsaved changes
      active: hasDev && hasDevOrg && Boolean(devOrg?.has_unsaved_changes),
      // Complete if we have commits (without rejected review)
      complete: hasValidCommits,
      assignee: task.assigned_dev,
    },
    {
      label: i18n.t('Submit changes for testing'),
      active: task.has_unmerged_commits && !task.pr_is_open,
      complete: task.pr_is_open,
      assignee: null,
    },
    {
      label: i18n.t('Assign a Tester'),
      active: readyForReview && !hasTester,
      complete: hasTester || task.review_valid,
      assignee: null,
    },
    {
      label: i18n.t('Create a Scratch Org for testing'),
      active: readyForReview && hasTester && !hasTestOrg,
      complete: (hasTester && hasTestOrg) || task.review_valid,
      hidden: testOrgOutOfDate,
      assignee: task.assigned_qa,
    },
    {
      label: i18n.t('Refresh Test Org'),
      active: testOrgOutOfDate,
      complete: false,
      hidden: !testOrgOutOfDate,
      assignee: task.assigned_qa,
    },
    {
      label: i18n.t('Test changes in Test Org'),
      active: readyForReview && hasTestOrg && !testOrg?.has_been_visited,
      complete:
        Boolean(hasTestOrg && testOrg?.has_been_visited) || task.review_valid,
      assignee: task.assigned_qa,
    },
    {
      label: i18n.t('Submit a review'),
      // Active if Task PR is still open, a up-to-date Test Org exists,
      // and there isn't already a valid review.
      active:
        readyForReview &&
        Boolean(hasTestOrg && testOrg?.has_been_visited) &&
        !testOrgOutOfDate &&
        !task.review_valid,
      complete: task.review_valid,
      assignee: task.assigned_qa,
    },
    {
      label: i18n.t('Merge pull request on GitHub'),
      active: readyForReview && hasReviewApproved,
      complete: false,
      assignee: null,
    },
  ];

  return (
    <Steps
      steps={steps}
      title={i18n.t('Next Steps for this Task')}
      handleAction={handleAction}
    />
  );
};

export default TaskStatusSteps;
