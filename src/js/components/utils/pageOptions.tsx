import Dropdown from '@salesforce/design-system-react/components/menu-dropdown';
import i18n from 'i18next';
import React from 'react';

import { OBJECT_TYPES, ObjectTypes } from '@/utils/constants';

const PageOptions = ({
  modelType,
  handleOptionSelect,
}: {
  modelType: ObjectTypes;
  handleOptionSelect: (id: 'edit' | 'delete') => void;
}) => {
  const handleSelect = (option: { id: 'edit' | 'delete'; label: string }) => {
    handleOptionSelect(option.id);
  };

  let assistiveText, editLabel;
  switch (modelType) {
    case OBJECT_TYPES.TASK:
      assistiveText = i18n.t('Task Options');
      editLabel = i18n.t('Edit Task');
      break;
    case OBJECT_TYPES.PROJECT:
      assistiveText = i18n.t('Project Options');
      editLabel = i18n.t('Edit Project');
      break;
  }
  return (
    <Dropdown
      align="right"
      iconCategory="utility"
      iconName="settings"
      iconSize="large"
      iconVariant="more"
      width="xx-small"
      triggerClassName="slds-m-right_xx-small"
      assistiveText={{ icon: assistiveText }}
      onSelect={handleSelect}
      options={[
        { id: 'edit', label: editLabel },
        // { type: 'divider' },
        // { id: 'delete', label: deleteLabel },
      ]}
    />
  );
};

export default PageOptions;
