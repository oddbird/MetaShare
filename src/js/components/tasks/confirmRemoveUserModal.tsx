import Button from '@salesforce/design-system-react/components/button';
import Modal from '@salesforce/design-system-react/components/modal';
import i18n from 'i18next';
import React from 'react';

import { AssignedUserTracker } from '@/components/tasks/cards';

const ConfirmRemoveUserModal = ({
  isOpen,
  waitingToRemoveUser,
  handleClose,
  handleCancel,
  handleAssignUser,
}: {
  isOpen: boolean;
  waitingToRemoveUser: AssignedUserTracker | null;
  handleClose: () => void;
  handleCancel: () => void;
  handleAssignUser: ({ type, assignee }: AssignedUserTracker) => void;
}) => {
  const handleSubmit = () => {
    handleClose();
    /* istanbul ignore else */
    if (waitingToRemoveUser) {
      handleAssignUser(waitingToRemoveUser);
    }
  };

  const heading = waitingToRemoveUser?.assignee
    ? i18n.t('Confirm Changing Developer and Deleting Dev Org')
    : i18n.t('Confirm Removing Developer and Deleting Dev Org');
  const message = waitingToRemoveUser?.assignee
    ? i18n.t(
        'The existing Dev Org for this task has uncaptured changes. Changing the assigned developer will also delete the org, and any changes will be lost. Are you sure you want to do that?',
      )
    : i18n.t(
        'The existing Dev Org for this task has uncaptured changes. Removing the assigned developer will also delete the org, and any changes will be lost. Are you sure you want to do that?',
      );

  return (
    <Modal
      isOpen={Boolean(isOpen && waitingToRemoveUser)}
      heading={heading}
      prompt="warning"
      onRequestClose={handleCancel}
      footer={[
        <Button key="cancel" label={i18n.t('Cancel')} onClick={handleCancel} />,
        <Button
          key="submit"
          label={i18n.t('Confirm')}
          variant="brand"
          onClick={handleSubmit}
        />,
      ]}
    >
      <div className="slds-p-vertical_medium">{message}</div>
    </Modal>
  );
};

export default ConfirmRemoveUserModal;
