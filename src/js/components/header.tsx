import PageHeader from '@salesforce/design-system-react/components/page-header';
import PageHeaderControl from '@salesforce/design-system-react/components/page-header/control';
import React from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';

import Errors from '@/components/apiErrors';
import OfflineAlert from '@/components/offlineAlert';
import Toasts from '@/components/toasts';
import UserInfo from '@/components/user/info';
import { selectSocketState } from '@/store/socket/selectors';
import { selectUserState } from '@/store/user/selectors';
import routes from '@/utils/routes';

const Header = () => {
  const user = useSelector(selectUserState);
  const socket = useSelector(selectSocketState);

  const controls = () => (
    <PageHeaderControl className="slds-grid slds-grid_vertical-align-center">
      <UserInfo />
    </PageHeaderControl>
  );

  return user ? (
    <>
      {socket ? null : <OfflineAlert />}
      <Errors />
      <Toasts />
      <PageHeader
        className="global-header
          slds-p-horizontal_x-large
          slds-p-vertical_medium"
        title={
          <Link
            to={routes.home()}
            className="slds-text-heading_large slds-text-link_reset"
          >
            <span data-logo-bit="start">met</span>
            <span data-logo-bit="end">echo</span>
          </Link>
        }
        onRenderControls={controls}
      />
    </>
  ) : null;
};

export default Header;
