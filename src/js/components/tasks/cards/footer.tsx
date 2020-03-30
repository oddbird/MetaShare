import Button from '@salesforce/design-system-react/components/button';
import i18n from 'i18next';
import React from 'react';

import { ExternalLink } from '@/components/utils';
import { Org } from '@/store/orgs/reducer';

const Footer = ({
  org,
  ownedByCurrentUser,
  isCreating,
  isDeleting,
  isRefreshingChanges,
  isRefreshingOrg,
  testOrgOutOfDate,
  readyForReview,
  openRefreshOrgModal,
}: {
  org: Org | null;
  ownedByCurrentUser: boolean;
  isCreating: boolean;
  isDeleting: boolean;
  isRefreshingChanges: boolean;
  isRefreshingOrg: boolean;
  testOrgOutOfDate: boolean;
  readyForReview: boolean;
  openRefreshOrgModal: () => void;
}) => {
  const loadingMsg = i18n.t(
    'This process could take a number of minutes. Feel free to leave this page and check back later.',
  );

  if (isCreating || isRefreshingOrg) {
    return <>{loadingMsg}</>;
  }
  if (isDeleting) {
    return <>{i18n.t('Deleting Org…')}</>;
  }
  if (isRefreshingChanges) {
    return <>{i18n.t('Checking for Unretrieved Changes…')}</>;
  }
  if (org && ownedByCurrentUser) {
    if (org.currently_capturing_changes) {
      return (
        <>
          {i18n.t('Retrieving Selected Changes…')}
          <div className="slds-p-top_small">{loadingMsg}</div>
        </>
      );
    }
    const orgUrl = window.api_urls.scratch_org_redirect(org.id);
    /* istanbul ignore else */
    if (orgUrl) {
      if (testOrgOutOfDate) {
        return (
          <Button
            label={i18n.t('View Org')}
            variant="link"
            onClick={openRefreshOrgModal}
          />
        );
      }
      const label = readyForReview
        ? i18n.t('Test Changes in Org')
        : i18n.t('View Org');
      return <ExternalLink url={orgUrl}>{label}</ExternalLink>;
    }
  }

  return null;
};

export default Footer;
