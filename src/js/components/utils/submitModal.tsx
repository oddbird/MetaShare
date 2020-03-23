import Button from '@salesforce/design-system-react/components/button';
import Input from '@salesforce/design-system-react/components/input';
import Modal from '@salesforce/design-system-react/components/modal';
import Textarea from '@salesforce/design-system-react/components/textarea';
import i18n from 'i18next';
import React, { useRef, useState } from 'react';
import { Trans } from 'react-i18next';

import {
  ExternalLink,
  LabelWithSpinner,
  useForm,
  useIsMounted,
} from '@/components/utils';
import { OBJECT_TYPES } from '@/utils/constants';

interface Props {
  instanceId: string;
  instanceName: string;
  instanceDiffUrl: string | null;
  instanceType: 'task' | 'project';
  isOpen: boolean;
  toggleModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const SubmitModal = ({
  instanceId,
  instanceName,
  instanceDiffUrl,
  instanceType,
  isOpen,
  toggleModal,
}: Props) => {
  const [submittingReview, setSubmittingReview] = useState(false);
  const isMounted = useIsMounted();
  const submitButton = useRef<HTMLButtonElement | null>(null);

  const handleSuccess = () => {
    /* istanbul ignore else */
    if (isMounted.current) {
      setSubmittingReview(false);
      toggleModal(false);
    }
  };

  /* istanbul ignore next */
  const handleError = () => {
    if (isMounted.current) {
      setSubmittingReview(false);
    }
  };

  let objectType, heading, submittingLabel, toSubmitLabel;
  switch (instanceType) {
    case 'task':
      objectType = {
        objectType: OBJECT_TYPES.TASK_PR,
        url: window.api_urls.task_create_pr(instanceId),
      };
      heading = i18n.t('Submit this task for review');
      submittingLabel = i18n.t('Submitting Task for Review…');
      toSubmitLabel = i18n.t('Submit Task for Review');
      break;
    case 'project':
      objectType = {
        objectType: OBJECT_TYPES.PROJECT_PR,
        url: window.api_urls.project_create_pr(instanceId),
      };
      heading = i18n.t('Submit this project for review');
      submittingLabel = i18n.t('Submitting Project for Review…');
      toSubmitLabel = i18n.t('Submit Project for Review');
      break;
  }

  const {
    inputs,
    errors,
    handleInputChange,
    handleSubmit,
    resetForm,
  } = useForm({
    fields: {
      title: instanceName,
      critical_changes: '',
      additional_changes: '',
      issues: '',
      notes: '',
    },
    onSuccess: handleSuccess,
    onError: handleError,
    shouldSubscribeToObject: false,
    ...objectType,
  });

  const handleSubmitClicked = () => {
    // Click hidden button inside form to activate native browser validation
    /* istanbul ignore else */
    if (submitButton.current) {
      submitButton.current.click();
    }
  };

  const handleClose = () => {
    toggleModal(false);
    resetForm();
  };

  const submitInstance = (e: React.FormEvent<HTMLFormElement>) => {
    setSubmittingReview(true);
    handleSubmit(e);
  };

  return (
    <Modal
      isOpen={isOpen}
      size="medium"
      disableClose={submittingReview}
      heading={heading}
      footer={[
        <Button
          key="cancel"
          label={i18n.t('Cancel')}
          onClick={handleClose}
          disabled={submittingReview}
        />,
        <Button
          key="submit"
          type="submit"
          label={
            submittingReview ? (
              <LabelWithSpinner label={submittingLabel} variant="inverse" />
            ) : (
              toSubmitLabel
            )
          }
          variant="brand"
          onClick={handleSubmitClicked}
          disabled={submittingReview}
        />,
      ]}
      onRequestClose={handleClose}
    >
      <form className="slds-form slds-p-around_large" onSubmit={submitInstance}>
        <div className="slds-grid slds-wrap slds-gutters">
          <div
            className="slds-col
              slds-size_1-of-1
              slds-medium-size_6-of-12
              slds-large-size_8-of-12
              slds-p-bottom_medium"
          >
            <div className="slds-form-element__help slds-p-bottom_small">
              <Trans i18nKey="releaseNotesInfo">
                Details entered will be used when publishing release notes.
                Please use Markdown to format your notes.
              </Trans>
            </div>
            <Input
              id="pr-title"
              label={i18n.t('Title')}
              className="slds-p-bottom_small"
              name="title"
              value={inputs.title}
              required
              aria-required
              errorText={errors.title}
              onChange={handleInputChange}
            />
            <Textarea
              id="pr-critical-changes"
              label={i18n.t(
                'Describe any critical changes which might impact existing functionality',
              )}
              className="ms-textarea slds-p-bottom_small"
              name="critical_changes"
              value={inputs.critical_changes}
              errorText={errors.critical_changes}
              onChange={handleInputChange}
            />
            <Textarea
              id="pr-additional-changes"
              label={i18n.t(
                'Describe additional changes including instructions for users for any post-upgrade tasks',
              )}
              className="ms-textarea slds-p-bottom_small"
              name="additional_changes"
              value={inputs.additional_changes}
              errorText={errors.additional_changes}
              onChange={handleInputChange}
            />
            <Textarea
              id="pr-notes"
              label={i18n.t('Developer notes')}
              className="ms-textarea slds-p-bottom_small"
              name="notes"
              value={inputs.notes}
              errorText={errors.notes}
              onChange={handleInputChange}
            />
          </div>
          <div
            className="slds-col
              slds-size_1-of-1
              slds-medium-size_6-of-12
              slds-large-size_4-of-12"
          >
            {instanceDiffUrl && (
              <ExternalLink
                url={instanceDiffUrl}
                showButtonIcon
                className="slds-button
                  slds-button_outline-brand
                  slds-m-bottom_medium"
              >
                {i18n.t('Compare Changes')}
              </ExternalLink>
            )}
            <div className="submit-guide">
              <h3 className="slds-m-bottom_medium slds-text-heading_small">
                {i18n.t('Markdown Guide')}
              </h3>
              <div className="markdown-block slds-m-vertical_medium">
                <pre>## {i18n.t('Heading')}</pre>
                <pre>### {i18n.t('Subheading')}</pre>
              </div>
              <div className="markdown-block slds-m-vertical_medium">
                <pre>*{i18n.t('This becomes italic text')}*</pre>
                <pre>**{i18n.t('This becomes bold text')}**</pre>
              </div>
              <div className="markdown-block slds-m-vertical_medium">
                <pre>- {i18n.t('Unordered list')}</pre>
                {/* prettier-ignore */}
                <pre>  - {i18n.t('Double space to nest')}</pre>
              </div>
              <div className="markdown-block slds-m-vertical_medium">
                <pre>- [x] {i18n.t('Completed item')}</pre>
                <pre>- [ ] {i18n.t('Incomplete item')}</pre>
              </div>
              <p className="slds-m-top_medium">
                <b>{i18n.t('Example')}</b>
              </p>
              <pre>## {i18n.t('Stops widget from refreshing')}</pre>
              <pre>{i18n.t('This includes:')}</pre>
              <div className="markdown-block">
                <pre>- {i18n.t('Renders incomplete bobble')}</pre>
                <pre>- {i18n.t('Prevents fire from building')}</pre>
                {/* prettier-ignore */}
                <pre>  - {i18n.t('Prevents fire duplication')}</pre>
                {/* prettier-ignore */}
                <pre>  - {i18n.t('Prevents fire spread')}</pre>
              </div>
              <div className="slds-m-vertical_x-large">---</div>
              <p>
                <Trans i18nKey="markdownGuide">
                  For more options, view this{' '}
                  <ExternalLink url="https://guides.github.com/features/mastering-markdown/">
                    Markdown Guide
                  </ExternalLink>
                  .
                </Trans>
              </p>
            </div>
          </div>
        </div>
        {/* Clicking hidden button allows for native browser form validation */}
        <button
          ref={submitButton}
          type="submit"
          style={{ display: 'none' }}
          disabled={submittingReview}
        />
      </form>
    </Modal>
  );
};

export default SubmitModal;
