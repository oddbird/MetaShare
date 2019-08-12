import { fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

import RepositoryList from '@/components/repositories/list';
import { fetchObjects } from '@/store/actions';
import { syncRepos } from '@/store/repositories/actions';

import { renderWithRedux, storeWithThunk } from './../../utils';

jest.mock('react-fns', () => ({
  withScroll(Component) {
    // eslint-disable-next-line react/display-name
    return props => <Component x={0} y={0} {...props} />;
  },
}));
jest.mock('@/store/actions');
jest.mock('@/store/repositories/actions');
fetchObjects.mockReturnValue(() => Promise.resolve({ type: 'TEST' }));
syncRepos.mockReturnValue(() => Promise.resolve({ type: 'TEST' }));

afterEach(() => {
  fetchObjects.mockClear();
  syncRepos.mockClear();
});

describe('<RepositoryList />', () => {
  const setup = (
    initialState = {
      repositories: { repositories: [], notFound: [], next: null },
    },
    props = {},
    rerenderFn = null,
  ) => {
    const { getByText, queryByText, rerender } = renderWithRedux(
      <MemoryRouter>
        <RepositoryList {...props} />
      </MemoryRouter>,
      initialState,
      storeWithThunk,
      rerenderFn,
    );
    return { getByText, queryByText, rerender };
  };

  test('renders repositories list (empty)', () => {
    const { getByText } = setup();

    expect(getByText('¯\\_(ツ)_/¯')).toBeVisible();
  });

  test('renders repositories list', () => {
    const initialState = {
      repositories: {
        repositories: [
          {
            id: 'r1',
            name: 'Repository 1',
            slug: 'repository-1',
            description: 'This is a test repository.',
            repo_url: 'https://www.github.com/test/test-repo',
          },
        ],
        notFound: [],
        next: null,
      },
    };
    const { getByText } = setup(initialState);

    expect(getByText('Repository 1')).toBeVisible();
    expect(getByText('This is a test repository.')).toBeVisible();
  });

  describe('fetching more repositories', () => {
    const initialState = {
      repositories: {
        repositories: [
          {
            id: 'r1',
            name: 'Repository 1',
            slug: 'repository-1',
            description: 'This is a test repository.',
            repo_url: 'https://www.github.com/test/test-repo',
          },
        ],
        notFound: [],
        next: 'next-url',
      },
    };

    beforeAll(() => {
      jest
        .spyOn(document.documentElement, 'scrollHeight', 'get')
        .mockImplementation(() => 1100);
    });

    afterEach(() => {
      window.sessionStorage.removeItem('activeRepositoriesTab');
    });

    test('fetches next page of repositories', () => {
      const { rerender, getByText } = setup(initialState);
      setup(initialState, { y: 1000 }, rerender);

      expect(getByText('Loading…')).toBeVisible();
      expect(fetchObjects).toHaveBeenCalledWith({
        url: 'next-url',
        objectType: 'repository',
      });
    });

    test('does not fetch next page if no more repositories', () => {
      const state = {
        ...initialState,
        repositories: {
          ...initialState.repositories,
          next: null,
        },
      };
      const { rerender, queryByText } = setup(state);

      setup(state, { y: 1000 }, rerender);

      expect(queryByText('Loading…')).toBeNull();
      expect(fetchObjects).not.toHaveBeenCalled();
    });
  });

  describe('sync repos clicked', () => {
    test('sync repos', () => {
      const { getByText } = setup();
      const btn = getByText('Sync GitHub Repositories');

      expect(btn).toBeVisible();

      fireEvent.click(btn);

      expect(getByText('Syncing GitHub Repos…')).toBeVisible();
      expect(syncRepos).toHaveBeenCalledTimes(1);
    });
  });
});
