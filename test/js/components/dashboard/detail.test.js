import { render } from '@testing-library/react';
import React from 'react';
import { StaticRouter } from 'react-router-dom';

import DashboardDetail from '@/components/dashboard/detail';

describe('<DashboardDetail/>', () => {
  const context = {};
  const { container } = render(
    <StaticRouter context={context}>
      <DashboardDetail match={{ path: '/dashboard' }} />
    </StaticRouter>,
  );

  test('renders dashboard', () => {
    expect(container).toMatchSnapshot();
  });
});
